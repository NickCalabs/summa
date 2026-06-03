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

async function commit(_db: unknown, _ctx: unknown): Promise<void> { throw new Error("commit not implemented yet"); }
async function undo(_db: unknown, _manifest: string): Promise<void> { throw new Error("undo not implemented yet"); }

main().catch((e) => { console.error("import-kubera-history failed:", e); process.exit(1); });
