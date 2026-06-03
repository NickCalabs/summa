/**
 * Backfill Kubera per-asset history into Summa snapshots.
 *
 *   Dry run (default, no writes):
 *     pnpm tsx --env-file=.env src/lib/db/import-kubera-history.ts --dir ./kubera-history --portfolio <id>
 *   Commit:
 *     ... --commit
 *   Undo a prior commit:
 *     ... --undo kubera-backfill-manifest-<ts>.json
 *
 * Safe by construction: only INSERTS dated history rows; never updates assets or
 * existing snapshots. See docs/superpowers/specs/2026-06-03-kubera-history-backfill-design.md
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import * as schema from "./schema";
import { aggregatePortfolioTotals, type AggregatableAsset } from "@/lib/snapshots-aggregate";
import { parseKuberaHistoryFile } from "@/lib/kubera-history/parse";
import { matchFiles } from "@/lib/kubera-history/match";
import { getBtcUsdHistory } from "@/lib/kubera-history/btc-history";
import {
  planAssetSnapshots, filterExistingAssetSnapshots, portfolioDatesToCreate,
  type AssetPlanInput,
} from "@/lib/kubera-history/plan";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const COMMIT = process.argv.includes("--commit");
const UNDO = arg("--undo");

if (process.argv.includes("--undo") && !UNDO) {
  throw new Error("--undo requires a manifest file path");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set (run with --env-file=.env)");
  const client = postgres(url);
  const db = drizzle(client, { schema });
  try {
    if (UNDO) return await undo(db, UNDO);

    const dir = arg("--dir") ?? "./kubera-history";
    const portfolioId = arg("--portfolio");
    if (!portfolioId) throw new Error("--portfolio <id> is required");

    // 1. Parse files
    const files = fs.readdirSync(dir).filter((f) => /\.(csv|tsv|txt)$/i.test(f));
    const parsed = files.map((f) =>
      parseKuberaHistoryFile(fs.readFileSync(path.join(dir, f), "utf8"))
    );

    // 2. Load portfolio assets (candidates) + maps (mirror backfill-snapshots.ts)
    const [portfolio] = await db.select().from(schema.portfolios)
      .where(eq(schema.portfolios.id, portfolioId)).limit(1);
    if (!portfolio) throw new Error("portfolio not found");
    const sheetRows = await db.select().from(schema.sheets)
      .where(eq(schema.sheets.portfolioId, portfolioId));
    const sheetTypeMap = new Map(sheetRows.map((s) => [s.id, s.type]));
    const sectionRows = sheetRows.length
      ? await db.select().from(schema.sections).where(inArray(schema.sections.sheetId, sheetRows.map((s) => s.id)))
      : [];
    const sectionSheetMap = new Map(sectionRows.map((s) => [s.id, s.sheetId]));
    const assetRows = sectionRows.length
      ? await db.select().from(schema.assets).where(inArray(schema.assets.sectionId, sectionRows.map((s) => s.id)))
      : [];
    const assetMetaById = new Map(assetRows.map((a) => [a.id, a]));

    // 3. Match
    const overrides = fs.existsSync(path.join(dir, "mapping.json"))
      ? JSON.parse(fs.readFileSync(path.join(dir, "mapping.json"), "utf8"))
      : {};
    const match = matchFiles(parsed.map((p) => p.assetName),
      assetRows.map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type })), overrides);
    const assetIdByName = new Map(match.matched.map((m) => [m.assetName, m.assetId]));

    // 4. Per-asset cutoff = earliest existing asset_snapshot date
    const matchedIds = match.matched.map((m) => m.assetId);
    const existingSnaps = matchedIds.length
      ? await db.select().from(schema.assetSnapshots).where(inArray(schema.assetSnapshots.assetId, matchedIds))
      : [];
    const cutoffByAsset = new Map<string, string>();
    const existingKeys = new Set<string>();
    for (const s of existingSnaps) {
      existingKeys.add(`${s.assetId}@${s.date}`);
      const cur = cutoffByAsset.get(s.assetId);
      if (!cur || s.date < cur) cutoffByAsset.set(s.assetId, s.date);
    }

    // 5. Plan
    const planInputs: AssetPlanInput[] = parsed
      .filter((p) => assetIdByName.has(p.assetName))
      .map((p) => {
        const assetId = assetIdByName.get(p.assetName)!;
        return { assetId, rows: p.rows, cutoff: cutoffByAsset.get(assetId) ?? null };
      });
    const plannedAll = planAssetSnapshots(planInputs);
    const planned = filterExistingAssetSnapshots(plannedAll, existingKeys);

    const unionDates = Array.from(new Set(planned.map((p) => p.date))).sort();
    const existingPortfolioRows = await db.select().from(schema.portfolioSnapshots)
      .where(eq(schema.portfolioSnapshots.portfolioId, portfolioId));
    const existingPortfolioDates = new Set(existingPortfolioRows.map((r) => r.date));
    const globalCutoff = existingPortfolioRows.length
      ? existingPortfolioRows.map((r) => r.date).sort()[0] : null;
    const portfolioDates = portfolioDatesToCreate(unionDates, globalCutoff, existingPortfolioDates);

    // 6. Report
    console.log(`\n=== Kubera backfill ${COMMIT ? "(COMMIT)" : "(DRY RUN — no writes)"} ===`);
    console.log(`Portfolio: ${portfolio.name} base=${portfolio.currency}`);
    console.log(`Matched: ${match.matched.map((m) => m.assetName).join(", ") || "(none)"}`);
    if (match.ambiguous.length) console.log(`AMBIGUOUS (add to mapping.json): ${match.ambiguous.join(", ")}`);
    if (match.unmatched.length) console.log(`UNMATCHED (add to mapping.json): ${match.unmatched.join(", ")}`);
    console.log(`Asset snapshots to insert: ${planned.length} (date range ${unionDates[0] ?? "-"}..${unionDates.at(-1) ?? "-"})`);
    console.log(`Portfolio snapshots to create: ${portfolioDates.length}`);
    if (portfolio.currency !== "USD") console.log("WARNING: base currency is not USD; values are treated as USD.");

    if (!COMMIT) { console.log("\nDry run complete. Re-run with --commit to write."); return; }
    // commit path implemented in Task 8
    await commit(db, { portfolio, planned, portfolioDates, sheetTypeMap, sectionSheetMap, assetMetaById });
  } finally {
    await client.end();
  }
}

type DbOrTx = ReturnType<typeof drizzle> | Parameters<Parameters<ReturnType<typeof drizzle>["transaction"]>[0]>[0];

async function commit(
  db: ReturnType<typeof drizzle>,
  ctx: {
    portfolio: typeof schema.portfolios.$inferSelect;
    planned: { assetId: string; date: string; usd: number; qty: number | null; price: number | null }[];
    portfolioDates: string[];
    sheetTypeMap: Map<string, string>;
    sectionSheetMap: Map<string, string>;
    assetMetaById: Map<string, typeof schema.assets.$inferSelect>;
  }
): Promise<void> {
  const { portfolio, planned, portfolioDates, sheetTypeMap, sectionSheetMap, assetMetaById } = ctx;

  // Invariant BEFORE: sum of current asset values (must be unchanged after).
  // Fetched OUTSIDE the transaction so a long-running network call does not hold a TX open.
  const before = await currentValueSum(db, portfolio.id);

  // BTC history fetch OUTSIDE the transaction (network I/O must not block a TX).
  const btc = await getBtcUsdHistory();
  const insertedAssetIds: string[] = [];
  const insertedPortfolioIds: string[] = [];

  // Single atomic transaction: all inserts + invariant check.
  // On any error (insert failure or invariant violation) Drizzle rolls back the entire TX
  // and the exception propagates — no manifest is written.
  await db.transaction(async (tx) => {
    // Insert asset snapshots (insert-only via onConflictDoNothing)
    for (const p of planned) {
      const rate = btc.get(p.date) ?? null;
      const valueInBtc = rate ? (p.usd / rate).toFixed(10) : null;
      const [row] = await tx.insert(schema.assetSnapshots).values({
        assetId: p.assetId, date: p.date,
        value: p.usd.toFixed(2), valueInBase: p.usd.toFixed(2), valueInBtc,
        price: p.price != null ? p.price.toFixed(8) : null,
        quantity: p.qty != null ? p.qty.toFixed(8) : null,
        source: "import",
      }).onConflictDoNothing({ target: [schema.assetSnapshots.assetId, schema.assetSnapshots.date] }).returning();
      if (row) insertedAssetIds.push(row.id);
    }

    // Create portfolio snapshots for each historical date (insert-only)
    const plannedByDate = new Map<string, typeof planned>();
    for (const p of planned) {
      const list = plannedByDate.get(p.date) ?? [];
      list.push(p);
      plannedByDate.set(p.date, list);
    }
    for (const date of portfolioDates) {
      const dayRows = plannedByDate.get(date) ?? [];
      const rate = btc.get(date) ?? null;
      const aggInputs: AggregatableAsset[] = [];
      for (const p of dayRows) {
        const meta = assetMetaById.get(p.assetId);
        if (!meta) continue;
        aggInputs.push({
          id: meta.id, sectionId: meta.sectionId, parentAssetId: meta.parentAssetId,
          currency: portfolio.currency, currentValue: p.usd.toFixed(2),
          ownershipPct: meta.ownershipPct, type: meta.type,
          isCashEquivalent: meta.isCashEquivalent, isInvestable: meta.isInvestable,
        });
      }
      const t = aggregatePortfolioTotals({
        assetRows: aggInputs, sectionSheetMap, sheetTypeMap,
        baseCurrency: portfolio.currency, rates: {}, btcUsdRate: rate && rate > 0 ? rate : null,
      });
      const netWorth = t.totalAssets - t.totalDebts;
      const nwBtc = t.totalAssetsInBtc != null && t.totalDebtsInBtc != null ? t.totalAssetsInBtc - t.totalDebtsInBtc : null;
      const fb = (v: number | null) => (v != null ? v.toFixed(10) : null);
      const [row] = await tx.insert(schema.portfolioSnapshots).values({
        portfolioId: portfolio.id, date,
        totalAssets: t.totalAssets.toFixed(2), totalDebts: t.totalDebts.toFixed(2),
        netWorth: netWorth.toFixed(2), cashOnHand: t.cashOnHand.toFixed(2),
        investableTotal: t.investableTotal.toFixed(2),
        totalAssetsInBtc: fb(t.totalAssetsInBtc), totalDebtsInBtc: fb(t.totalDebtsInBtc),
        netWorthInBtc: fb(nwBtc), cashOnHandInBtc: fb(t.cashOnHandInBtc), investableInBtc: fb(t.investableInBtc),
        btcUsdRate: rate ? rate.toFixed(2) : null,
      }).onConflictDoNothing({ target: [schema.portfolioSnapshots.portfolioId, schema.portfolioSnapshots.date] }).returning();
      if (row) insertedPortfolioIds.push(row.id);
    }

    // Invariant AFTER (inside TX so a violation rolls back all writes)
    const after = await currentValueSum(tx, portfolio.id);
    if (before !== after) {
      throw new Error(`INVARIANT VIOLATED: current value sum changed ${before} -> ${after}. Rolled back; investigate.`);
    }
  });

  // Manifest written only after the transaction commits successfully.
  const manifest = { ts: new Date().toISOString(), portfolioId: portfolio.id, insertedAssetIds, insertedPortfolioIds };
  const file = `kubera-backfill-manifest-${manifest.ts.replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));

  // Capture `after` for the success log (re-read outside TX is fine for display only).
  const afterDisplay = await currentValueSum(db, portfolio.id);
  console.log(`\nInserted ${insertedAssetIds.length} asset snapshots, ${insertedPortfolioIds.length} portfolio snapshots.`);
  console.log(`Invariant OK (current value sum unchanged: ${afterDisplay}).`);
  console.log(`Undo manifest written: ${file}`);
}

async function currentValueSum(db: DbOrTx, portfolioId: string): Promise<string> {
  const sheetRows = await db.select().from(schema.sheets).where(eq(schema.sheets.portfolioId, portfolioId));
  const sectionRows = sheetRows.length
    ? await db.select().from(schema.sections).where(inArray(schema.sections.sheetId, sheetRows.map((s) => s.id))) : [];
  const assetRows = sectionRows.length
    ? await db.select().from(schema.assets).where(inArray(schema.assets.sectionId, sectionRows.map((s) => s.id))) : [];
  let sum = 0;
  for (const a of assetRows) sum += Number(a.currentValue);
  return sum.toFixed(2);
}

async function undo(db: ReturnType<typeof drizzle>, manifestPath: string): Promise<void> {
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { insertedAssetIds: string[]; insertedPortfolioIds: string[] };
  if (m.insertedAssetIds.length)
    await db.delete(schema.assetSnapshots).where(inArray(schema.assetSnapshots.id, m.insertedAssetIds));
  if (m.insertedPortfolioIds.length)
    await db.delete(schema.portfolioSnapshots).where(inArray(schema.portfolioSnapshots.id, m.insertedPortfolioIds));
  console.log(`Undid ${m.insertedAssetIds.length} asset + ${m.insertedPortfolioIds.length} portfolio snapshots.`);
}

main().catch((e) => { console.error("import-kubera-history failed:", e); process.exit(1); });
