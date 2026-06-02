import { db } from "@/lib/db";
import {
  assets,
  sections,
  sheets,
  portfolios,
  assetSnapshots,
  portfolioSnapshots,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getExchangeRates } from "@/lib/providers/exchange-rates";
import { getCurrentBtcUsd } from "@/lib/providers/cryptocompare";
import { convertToBase } from "@/lib/currency";
import { aggregatePortfolioTotals } from "@/lib/snapshots-aggregate";

export async function takePortfolioSnapshot(portfolioId: string) {
  const today = new Date().toISOString().split("T")[0];

  // Get all sheets for portfolio
  const sheetRows = await db
    .select()
    .from(sheets)
    .where(eq(sheets.portfolioId, portfolioId));

  if (sheetRows.length === 0) {
    return { assetSnapshots: 0, portfolioSnapshot: null };
  }

  // Fetch portfolio to get base currency
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);

  const baseCurrency = portfolio?.currency ?? "USD";

  const sheetIds = sheetRows.map((s) => s.id);
  const sheetTypeMap = new Map(sheetRows.map((s) => [s.id, s.type]));

  // Get all sections
  const sectionRows = await db
    .select()
    .from(sections)
    .where(inArray(sections.sheetId, sheetIds));

  if (sectionRows.length === 0) {
    return { assetSnapshots: 0, portfolioSnapshot: null };
  }

  const sectionIds = sectionRows.map((s) => s.id);
  const sectionSheetMap = new Map(sectionRows.map((s) => [s.id, s.sheetId]));

  // Get non-archived assets
  const assetRows = await db
    .select()
    .from(assets)
    .where(
      and(inArray(assets.sectionId, sectionIds), eq(assets.isArchived, false))
    );

  // Fetch exchange rates for currency conversion
  const hasMixedCurrencies = assetRows.some(
    (a) => a.currency !== baseCurrency
  );
  const rates = hasMixedCurrencies
    ? await getExchangeRates(baseCurrency)
    : {};

  // Fetch today's BTC/USD rate up-front so per-asset valueInBtc and rolled-up
  // portfolio totals share the exact same denominator. Without this the chart
  // wiggles in BTC mode because each layer uses a slightly different rate.
  const btcUsdRate = await getCurrentBtcUsd();
  const btcDivisor = btcUsdRate && btcUsdRate > 0 ? btcUsdRate : null;

  // Upsert asset snapshots
  let snapshotCount = 0;
  for (const asset of assetRows) {
    const valueInBaseNum = convertToBase(
      Number(asset.currentValue),
      asset.currency,
      baseCurrency,
      rates
    );
    const valueInBase = valueInBaseNum.toFixed(2);
    const valueInBtc = btcDivisor
      ? (valueInBaseNum / btcDivisor).toFixed(10)
      : null;

    await db
      .insert(assetSnapshots)
      .values({
        assetId: asset.id,
        date: today,
        value: asset.currentValue,
        valueInBase,
        valueInBtc,
        price: asset.currentPrice,
        quantity: asset.quantity,
        source: "manual",
      })
      .onConflictDoUpdate({
        target: [assetSnapshots.assetId, assetSnapshots.date],
        set: {
          value: asset.currentValue,
          valueInBase,
          valueInBtc,
          price: asset.currentPrice,
          quantity: asset.quantity,
        },
      });
    snapshotCount++;
  }

  const {
    totalAssets,
    totalDebts,
    cashOnHand,
    investableTotal,
    totalAssetsInBtc,
    totalDebtsInBtc,
    cashOnHandInBtc,
    investableInBtc,
  } = aggregatePortfolioTotals({
    assetRows,
    sectionSheetMap,
    sheetTypeMap,
    baseCurrency,
    rates,
    btcUsdRate: btcDivisor,
  });

  const netWorth = totalAssets - totalDebts;
  const netWorthInBtc =
    totalAssetsInBtc != null && totalDebtsInBtc != null
      ? totalAssetsInBtc - totalDebtsInBtc
      : null;

  const fixBtc = (v: number | null) => (v != null ? v.toFixed(10) : null);

  // Upsert portfolio snapshot
  const [portfolioSnap] = await db
    .insert(portfolioSnapshots)
    .values({
      portfolioId,
      date: today,
      totalAssets: totalAssets.toFixed(2),
      totalDebts: totalDebts.toFixed(2),
      netWorth: netWorth.toFixed(2),
      cashOnHand: cashOnHand.toFixed(2),
      investableTotal: investableTotal.toFixed(2),
      totalAssetsInBtc: fixBtc(totalAssetsInBtc),
      totalDebtsInBtc: fixBtc(totalDebtsInBtc),
      netWorthInBtc: fixBtc(netWorthInBtc),
      cashOnHandInBtc: fixBtc(cashOnHandInBtc),
      investableInBtc: fixBtc(investableInBtc),
      btcUsdRate: btcUsdRate != null ? btcUsdRate.toFixed(2) : null,
    })
    .onConflictDoUpdate({
      target: [portfolioSnapshots.portfolioId, portfolioSnapshots.date],
      set: {
        totalAssets: totalAssets.toFixed(2),
        totalDebts: totalDebts.toFixed(2),
        netWorth: netWorth.toFixed(2),
        cashOnHand: cashOnHand.toFixed(2),
        investableTotal: investableTotal.toFixed(2),
        totalAssetsInBtc: fixBtc(totalAssetsInBtc),
        totalDebtsInBtc: fixBtc(totalDebtsInBtc),
        netWorthInBtc: fixBtc(netWorthInBtc),
        cashOnHandInBtc: fixBtc(cashOnHandInBtc),
        investableInBtc: fixBtc(investableInBtc),
        ...(btcUsdRate != null ? { btcUsdRate: btcUsdRate.toFixed(2) } : {}),
      },
    })
    .returning();

  return {
    assetSnapshots: snapshotCount,
    portfolioSnapshot: portfolioSnap,
  };
}

/**
 * Upsert today's `asset_snapshots` row for a single asset.
 *
 * Called whenever an asset's value changes (manual PATCH, sync paths) so
 * snapshot-based views (lens chart, recap drill-down) stay fresh between
 * daily cron runs. Without this, a manual edit at 10am wouldn't show up on
 * the lens until midnight UTC the next snapshot run.
 *
 * Best-effort: failures here log + continue, since the live `assets` table
 * has already been updated with the authoritative value.
 */
export async function upsertTodayAssetSnapshot(assetId: string): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0];

    const [asset] = await db
      .select({
        currentValue: assets.currentValue,
        currency: assets.currency,
        currentPrice: assets.currentPrice,
        quantity: assets.quantity,
        sectionId: assets.sectionId,
      })
      .from(assets)
      .where(eq(assets.id, assetId))
      .limit(1);

    if (!asset) return;

    // Resolve portfolio currency via section → sheet → portfolio
    const [section] = await db
      .select({ sheetId: sections.sheetId })
      .from(sections)
      .where(eq(sections.id, asset.sectionId))
      .limit(1);
    if (!section) return;

    const [sheet] = await db
      .select({ portfolioId: sheets.portfolioId })
      .from(sheets)
      .where(eq(sheets.id, section.sheetId))
      .limit(1);
    if (!sheet) return;

    const [portfolio] = await db
      .select({ currency: portfolios.currency })
      .from(portfolios)
      .where(eq(portfolios.id, sheet.portfolioId))
      .limit(1);
    if (!portfolio) return;

    const baseCurrency = portfolio.currency;
    const rates =
      asset.currency !== baseCurrency
        ? await getExchangeRates(baseCurrency)
        : {};

    const valueInBaseNum = convertToBase(
      Number(asset.currentValue),
      asset.currency,
      baseCurrency,
      rates
    );
    const valueInBase = valueInBaseNum.toFixed(2);

    const btcUsdRate = await getCurrentBtcUsd();
    const valueInBtc =
      btcUsdRate && btcUsdRate > 0
        ? (valueInBaseNum / btcUsdRate).toFixed(10)
        : null;

    await db
      .insert(assetSnapshots)
      .values({
        assetId,
        date: today,
        value: asset.currentValue,
        valueInBase,
        valueInBtc,
        price: asset.currentPrice,
        quantity: asset.quantity,
        source: "manual",
      })
      .onConflictDoUpdate({
        target: [assetSnapshots.assetId, assetSnapshots.date],
        set: {
          value: asset.currentValue,
          valueInBase,
          valueInBtc,
          price: asset.currentPrice,
          quantity: asset.quantity,
        },
      });
  } catch (err) {
    console.error(`[snapshots] upsertTodayAssetSnapshot(${assetId}) failed:`, err);
  }
}
