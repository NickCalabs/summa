/**
 * One-off backfill: recompute every existing portfolio_snapshot row from
 * asset_snapshots, skipping provider-grouped parent rows so we don't
 * double-count.
 *
 * Run: `pnpm tsx src/lib/db/backfill-snapshots.ts`
 *
 * Idempotent — safe to run multiple times. Each run rewrites every row with
 * the recomputed totals using current asset flags (isCashEquivalent,
 * isInvestable) and current sheet types. Asset flags don't change often, so
 * applying them retroactively is the right approximation.
 *
 * What it preserves:
 * - portfolio_snapshots.btcUsdRate stays as recorded
 * - asset_snapshots are untouched (each asset, parent or child, keeps its row
 *   so lens charts pointing at parent ids still resolve)
 *
 * What it overwrites:
 * - portfolio_snapshots.{totalAssets, totalDebts, netWorth, cashOnHand,
 *   investableTotal} for every row
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, and } from "drizzle-orm";
import * as schema from "./schema";
import {
  aggregatePortfolioTotals,
  type AggregatableAsset,
} from "@/lib/snapshots-aggregate";

const url =
  process.env.DATABASE_URL ||
  "postgres://summa:summa@localhost:5432/summa";

async function backfill() {
  const client = postgres(url);
  const db = drizzle(client, { schema });

  const portfolioRows = await db.select().from(schema.portfolios);

  let totalRowsUpdated = 0;

  for (const portfolio of portfolioRows) {
    console.log(
      `\nPortfolio: ${portfolio.name} (${portfolio.id}) — base ${portfolio.currency}`
    );

    const sheetRows = await db
      .select()
      .from(schema.sheets)
      .where(eq(schema.sheets.portfolioId, portfolio.id));
    const sheetTypeMap = new Map<string, string>(
      sheetRows.map((s) => [s.id, s.type])
    );

    const sheetIds = sheetRows.map((s) => s.id);
    const sectionRows =
      sheetIds.length > 0
        ? await db
            .select()
            .from(schema.sections)
            .where(inArray(schema.sections.sheetId, sheetIds))
        : [];
    const sectionSheetMap = new Map<string, string>(
      sectionRows.map((s) => [s.id, s.sheetId])
    );

    const sectionIds = sectionRows.map((s) => s.id);
    const assetRows =
      sectionIds.length > 0
        ? await db
            .select()
            .from(schema.assets)
            .where(inArray(schema.assets.sectionId, sectionIds))
        : [];

    // Build a metadata map keyed by asset id — gives us flags + sheet routing
    // when iterating asset_snapshots later.
    const assetMetaById = new Map<string, (typeof assetRows)[number]>(
      assetRows.map((a) => [a.id, a])
    );

    // Fetch every snapshot day for this portfolio
    const snapshotRows = await db
      .select()
      .from(schema.portfolioSnapshots)
      .where(eq(schema.portfolioSnapshots.portfolioId, portfolio.id));

    if (snapshotRows.length === 0) {
      console.log("  No portfolio_snapshots — skipping");
      continue;
    }

    // Pull all asset_snapshots for this portfolio's assets across all dates,
    // then group by date for per-day aggregation.
    const assetIds = Array.from(assetMetaById.keys());
    const assetSnapshotRows =
      assetIds.length > 0
        ? await db
            .select()
            .from(schema.assetSnapshots)
            .where(inArray(schema.assetSnapshots.assetId, assetIds))
        : [];

    const snapshotsByDate = new Map<
      string,
      (typeof assetSnapshotRows)[number][]
    >();
    for (const snap of assetSnapshotRows) {
      const list = snapshotsByDate.get(snap.date) ?? [];
      list.push(snap);
      snapshotsByDate.set(snap.date, list);
    }

    let portfolioRowsUpdated = 0;

    for (const portfolioSnap of snapshotRows) {
      const daySnapshots = snapshotsByDate.get(portfolioSnap.date) ?? [];

      // Map asset_snapshots to AggregatableAsset shape using:
      //   - valueInBase from the snapshot (already in base currency)
      //   - flags + parent/section/ownership from current asset metadata
      // Skip snapshots whose asset has been hard-deleted.
      const aggregateInputs: AggregatableAsset[] = [];
      for (const snap of daySnapshots) {
        const meta = assetMetaById.get(snap.assetId);
        if (!meta) continue; // asset no longer exists
        aggregateInputs.push({
          id: meta.id,
          sectionId: meta.sectionId,
          parentAssetId: meta.parentAssetId,
          // Setting currency = baseCurrency makes convertToBase a no-op so the
          // already-converted valueInBase passes through untouched.
          currency: portfolio.currency,
          currentValue: snap.valueInBase,
          ownershipPct: meta.ownershipPct,
          type: meta.type,
          isCashEquivalent: meta.isCashEquivalent,
          isInvestable: meta.isInvestable,
        });
      }

      const totals = aggregatePortfolioTotals({
        assetRows: aggregateInputs,
        sectionSheetMap,
        sheetTypeMap,
        baseCurrency: portfolio.currency,
        rates: {}, // unused; conversions are no-ops
      });

      const netWorth = totals.totalAssets - totals.totalDebts;

      await db
        .update(schema.portfolioSnapshots)
        .set({
          totalAssets: totals.totalAssets.toFixed(2),
          totalDebts: totals.totalDebts.toFixed(2),
          netWorth: netWorth.toFixed(2),
          cashOnHand: totals.cashOnHand.toFixed(2),
          investableTotal: totals.investableTotal.toFixed(2),
        })
        .where(
          and(
            eq(schema.portfolioSnapshots.portfolioId, portfolio.id),
            eq(schema.portfolioSnapshots.date, portfolioSnap.date)
          )
        );
      portfolioRowsUpdated++;
    }

    console.log(`  Recomputed ${portfolioRowsUpdated} snapshot rows`);
    totalRowsUpdated += portfolioRowsUpdated;
  }

  console.log(`\nDone. Total snapshot rows recomputed: ${totalRowsUpdated}`);
  await client.end();
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
