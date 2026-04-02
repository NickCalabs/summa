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
import { convertToBase } from "@/lib/currency";
import { isLiabilityAsset } from "@/lib/portfolio-utils";

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

  // Upsert asset snapshots
  let snapshotCount = 0;
  for (const asset of assetRows) {
    const valueInBase = convertToBase(
      Number(asset.currentValue),
      asset.currency,
      baseCurrency,
      rates
    ).toFixed(2);

    await db
      .insert(assetSnapshots)
      .values({
        assetId: asset.id,
        date: today,
        value: asset.currentValue,
        valueInBase,
        price: asset.currentPrice,
        quantity: asset.quantity,
        source: "manual",
      })
      .onConflictDoUpdate({
        target: [assetSnapshots.assetId, assetSnapshots.date],
        set: {
          value: asset.currentValue,
          valueInBase,
          price: asset.currentPrice,
          quantity: asset.quantity,
        },
      });
    snapshotCount++;
  }

  // Compute portfolio aggregates with currency conversion
  let totalAssets = 0;
  let totalDebts = 0;
  let cashOnHand = 0;

  for (const asset of assetRows) {
    const val = convertToBase(
      Number(asset.currentValue),
      asset.currency,
      baseCurrency,
      rates
    );
    const sheetId = sectionSheetMap.get(asset.sectionId);
    const sheetType = sheetId ? sheetTypeMap.get(sheetId) : "assets";
    const sheet = { type: sheetType ?? "assets" };

    if (isLiabilityAsset(sheet, asset)) {
      totalDebts += val;
    } else {
      totalAssets += val;
    }
    if (asset.isCashEquivalent) {
      cashOnHand += val;
    }
  }

  const netWorth = totalAssets - totalDebts;

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
    })
    .onConflictDoUpdate({
      target: [portfolioSnapshots.portfolioId, portfolioSnapshots.date],
      set: {
        totalAssets: totalAssets.toFixed(2),
        totalDebts: totalDebts.toFixed(2),
        netWorth: netWorth.toFixed(2),
        cashOnHand: cashOnHand.toFixed(2),
      },
    })
    .returning();

  return {
    assetSnapshots: snapshotCount,
    portfolioSnapshot: portfolioSnap,
  };
}
