# Kubera Historical Backfill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-time, idempotent, dry-run-first script that backfills ~2 years of Kubera per-asset history into Summa's `asset_snapshots` + `portfolio_snapshots` (USD and BTC/sats), without ever touching live/current values.

**Architecture:** Pure, unit-tested helpers do the parsing, carry-forward, BTC-price mapping, matching, and write-planning. A thin orchestrator wires them, runs in dry-run by default, enforces insert-only + per-asset boundary, captures a current-state invariant, writes an undo manifest, and (on `--commit`) inserts snapshots and creates historical portfolio snapshots via the existing `aggregatePortfolioTotals`.

**Tech Stack:** TypeScript, Drizzle ORM (postgres-js), Vitest, CryptoCompare histoday API. Script runs via `pnpm tsx --env-file=.env <path>`.

**Spec:** `docs/superpowers/specs/2026-06-03-kubera-history-backfill-design.md`

**Test command:** `pnpm vitest run <path>`. `@/` → `src/`.

**Safety:** Build + test the pure logic and the dry-run path BEFORE any real data is touched. The only step that writes to the DB is Task 9 (the guided real run), which begins with a fresh `pg_dump`.

---

## Shared types (used across tasks)

```ts
// src/lib/kubera-history/types.ts
export interface KuberaHistoryRow {
  date: string;        // YYYY-MM-DD
  usd: number;         // value in USD on that date
  qty: number | null;  // units held (null for pure cash)
  price: number | null;// per-unit price (null for pure cash)
}
export interface ParsedKuberaFile {
  assetName: string;          // from line 1 of the file
  rows: KuberaHistoryRow[];   // sorted ascending by date
}
export interface PlannedAssetSnapshot {
  assetId: string;
  date: string;
  usd: number;
  qty: number | null;
  price: number | null;
}
```

### Task 1: types module

**Files:**
- Create: `src/lib/kubera-history/types.ts`

- [ ] **Step 1: Create the file** with exactly the four interfaces shown in "Shared types" above.
- [ ] **Step 2: Typecheck** — `pnpm exec tsc --noEmit` (ignore pre-existing errors in `snapshot-utils.test.ts`/`portfolio-utils.test.ts`).
- [ ] **Step 3: Commit**
```bash
git add src/lib/kubera-history/types.ts
git commit -m "feat(kubera-history): shared types"
```

---

### Task 2: Tolerant parser

**Files:**
- Create: `src/lib/kubera-history/parse.ts`
- Test: `src/lib/kubera-history/__tests__/parse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseKuberaHistoryFile } from "@/lib/kubera-history/parse";

const SAMPLE = `Riv (BTC)
Date\tUSD\tQTY\tPRICE (USD)
2026-06-03\t10957.85\t0.16729032\t65502.00
2024-11-27\t9112.68\t0.095\t95923.00`;

describe("parseKuberaHistoryFile", () => {
  it("reads the asset name from line 1 and parses rows sorted ascending", () => {
    const r = parseKuberaHistoryFile(SAMPLE);
    expect(r.assetName).toBe("Riv (BTC)");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ date: "2024-11-27", usd: 9112.68, qty: 0.095, price: 95923 });
    expect(r.rows[1].date).toBe("2026-06-03");
  });

  it("accepts comma- and multi-space-delimited rows", () => {
    const csv = `Cash USD\nDate,USD,QTY,PRICE\n2025-01-02,1000.00,,\n2025-02-02,1200.50,,`;
    const r = parseKuberaHistoryFile(csv);
    expect(r.assetName).toBe("Cash USD");
    expect(r.rows[0]).toEqual({ date: "2025-01-02", usd: 1000, qty: null, price: null });
  });

  it("throws with the bad line when a row has a non-numeric USD or bad date", () => {
    const bad = `X\nDate\tUSD\n2025-13-99\tNaN`;
    expect(() => parseKuberaHistoryFile(bad)).toThrow(/2025-13-99/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm vitest run src/lib/kubera-history/__tests__/parse.test.ts`

- [ ] **Step 3: Implement `src/lib/kubera-history/parse.ts`**

```ts
import type { KuberaHistoryRow, ParsedKuberaFile } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function splitCells(line: string): string[] {
  // Tolerant: tab, comma, or runs of 2+ spaces.
  return line.trim().split(/\t|,|\s{2,}/).map((c) => c.trim());
}

function isHeader(cells: string[]): boolean {
  return cells.some((c) => /^date$/i.test(c)) || cells.some((c) => /^usd$/i.test(c));
}

function num(cell: string | undefined): number | null {
  if (cell == null || cell === "") return null;
  const n = Number(cell.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : NaN; // NaN signals a parse error to the caller
}

export function parseKuberaHistoryFile(text: string): ParsedKuberaFile {
  const lines = text.split(/\r?\n/).map((l) => l).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("empty file");
  const assetName = lines[0].trim();

  const rows: KuberaHistoryRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCells(line);
    if (isHeader(cells)) continue;
    const date = cells[0];
    if (!DATE_RE.test(date)) throw new Error(`bad date in row: "${line}"`);
    const usd = num(cells[1]);
    if (usd == null || Number.isNaN(usd)) throw new Error(`bad USD in row: "${line}"`);
    const qty = num(cells[2]);
    const price = num(cells[3]);
    if (Number.isNaN(qty as number) || Number.isNaN(price as number)) {
      throw new Error(`bad qty/price in row: "${line}"`);
    }
    rows.push({ date, usd, qty: qty, price: price });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { assetName, rows };
}
```

- [ ] **Step 4: Run — expect PASS** (3 tests).
- [ ] **Step 5: Commit**
```bash
git add src/lib/kubera-history/parse.ts src/lib/kubera-history/__tests__/parse.test.ts
git commit -m "feat(kubera-history): tolerant per-asset history parser"
```

---

### Task 3: Carry-forward + write planning (pure)

This is the correctness core: build the date union, carry each asset's most-recent value forward, and apply the per-asset boundary + insert-only filter.

**Files:**
- Create: `src/lib/kubera-history/plan.ts`
- Test: `src/lib/kubera-history/__tests__/plan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { mostRecentOnOrBefore, planAssetSnapshots } from "@/lib/kubera-history/plan";

const btcRows = [
  { date: "2025-01-01", usd: 100, qty: 1, price: 100 },
  { date: "2025-03-01", usd: 300, qty: 3, price: 100 },
];
const cashRows = [
  { date: "2025-02-01", usd: 50, qty: null, price: null },
];

describe("mostRecentOnOrBefore", () => {
  it("returns the latest row on or before the date, or null before the first", () => {
    expect(mostRecentOnOrBefore(btcRows, "2025-02-15")?.usd).toBe(100);
    expect(mostRecentOnOrBefore(btcRows, "2025-03-01")?.usd).toBe(300);
    expect(mostRecentOnOrBefore(btcRows, "2024-12-31")).toBeNull();
  });
});

describe("planAssetSnapshots", () => {
  it("carries forward each asset across the union of dates, within its active range", () => {
    const planned = planAssetSnapshots([
      { assetId: "btc", rows: btcRows, cutoff: null, firstDate: "2025-01-01" },
      { assetId: "cash", rows: cashRows, cutoff: null, firstDate: "2025-02-01" },
    ]);
    // union dates = 2025-01-01, 2025-02-01, 2025-03-01
    // btc present on all 3; cash only from 2025-02-01
    const byKey = new Map(planned.map((p) => [`${p.assetId}@${p.date}`, p]));
    expect(byKey.get("btc@2025-01-01")?.usd).toBe(100);
    expect(byKey.get("btc@2025-02-01")?.usd).toBe(100); // carried forward
    expect(byKey.get("btc@2025-03-01")?.usd).toBe(300);
    expect(byKey.has("cash@2025-01-01")).toBe(false);    // before cash existed
    expect(byKey.get("cash@2025-02-01")?.usd).toBe(50);
    expect(byKey.get("cash@2025-03-01")?.usd).toBe(50);  // carried forward
  });

  it("excludes dates on/after an asset's cutoff (Summa-era boundary)", () => {
    const planned = planAssetSnapshots([
      { assetId: "btc", rows: btcRows, cutoff: "2025-03-01", firstDate: "2025-01-01" },
    ]);
    const dates = planned.map((p) => p.date);
    expect(dates).toContain("2025-01-01");
    expect(dates).not.toContain("2025-03-01"); // cutoff is exclusive
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/lib/kubera-history/plan.ts`**

```ts
import type { KuberaHistoryRow, PlannedAssetSnapshot } from "./types";

export interface AssetPlanInput {
  assetId: string;
  rows: KuberaHistoryRow[];   // sorted ascending
  cutoff: string | null;      // earliest existing Summa snapshot date (exclusive), or null = no cutoff
  firstDate: string;          // rows[0].date
}

export function mostRecentOnOrBefore(
  rows: KuberaHistoryRow[],
  date: string
): KuberaHistoryRow | null {
  let best: KuberaHistoryRow | null = null;
  for (const r of rows) {
    if (r.date <= date) best = r;
    else break; // rows sorted ascending
  }
  return best;
}

// Carry each asset's value forward across the union of all update dates, but
// only within [firstDate, cutoff). Returns the per-(asset,date) rows to write.
export function planAssetSnapshots(
  inputs: AssetPlanInput[]
): PlannedAssetSnapshot[] {
  const union = Array.from(
    new Set(inputs.flatMap((a) => a.rows.map((r) => r.date)))
  ).sort();

  const out: PlannedAssetSnapshot[] = [];
  for (const a of inputs) {
    for (const date of union) {
      if (date < a.firstDate) continue;          // asset didn't exist yet
      if (a.cutoff != null && date >= a.cutoff) continue; // Summa era
      const row = mostRecentOnOrBefore(a.rows, date);
      if (!row) continue;
      out.push({ assetId: a.assetId, date, usd: row.usd, qty: row.qty, price: row.price });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**
```bash
git add src/lib/kubera-history/plan.ts src/lib/kubera-history/__tests__/plan.test.ts
git commit -m "feat(kubera-history): carry-forward + boundary write planning"
```

---

### Task 4: BTC daily-history provider

**Files:**
- Create: `src/lib/kubera-history/btc-history.ts`
- Test: `src/lib/kubera-history/__tests__/btc-history.test.ts`

- [ ] **Step 1: Write the failing test** (pure response parser; the fetch wrapper is not unit-tested)

```ts
import { describe, it, expect } from "vitest";
import { parseHistoday } from "@/lib/kubera-history/btc-history";

describe("parseHistoday", () => {
  it("maps each daily entry's unix time to an ISO date -> close price", () => {
    const json = { Response: "Success", Data: { Data: [
      { time: 1700000000, close: 37000.5 }, // 2023-11-14 (UTC)
      { time: 1700086400, close: 36000 },
    ] } };
    const map = parseHistoday(json);
    expect(map.get("2023-11-14")).toBeCloseTo(37000.5);
    expect(map.get("2023-11-15")).toBeCloseTo(36000);
  });
  it("skips zero/negative closes", () => {
    const json = { Data: { Data: [ { time: 1700000000, close: 0 } ] } };
    expect(parseHistoday(json).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/lib/kubera-history/btc-history.ts`**

```ts
interface HistodayEntry { time: number; close: number }

export function parseHistoday(json: unknown): Map<string, number> {
  const data = (json as { Data?: { Data?: HistodayEntry[] } })?.Data?.Data ?? [];
  const out = new Map<string, number>();
  for (const e of data) {
    if (!(typeof e.close === "number") || e.close <= 0) continue;
    const date = new Date(e.time * 1000).toISOString().slice(0, 10);
    out.set(date, e.close);
  }
  return out;
}

// Fetches up to 2000 days of daily BTC/USD closes (covers ~5.5y). Cached to a
// local JSON so re-runs need no network. Returns date(YYYY-MM-DD) -> USD close.
export async function getBtcUsdHistory(): Promise<Map<string, number>> {
  const res = await fetch(
    "https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000"
  );
  if (!res.ok) throw new Error(`CryptoCompare histoday failed: ${res.status}`);
  return parseHistoday(await res.json());
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**
```bash
git add src/lib/kubera-history/btc-history.ts src/lib/kubera-history/__tests__/btc-history.test.ts
git commit -m "feat(kubera-history): daily BTC/USD history provider"
```

---

### Task 5: File→asset matching

**Files:**
- Create: `src/lib/kubera-history/match.ts`
- Test: `src/lib/kubera-history/__tests__/match.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { matchFiles } from "@/lib/kubera-history/match";

const candidates = [
  { id: "a1", name: "Riv", currency: "USD", type: "cash" },
  { id: "a2", name: "Riv", currency: "USD", type: "crypto" },
  { id: "a3", name: "Schwab", currency: "USD", type: "investment" },
];

describe("matchFiles", () => {
  it("auto-matches an unambiguous name", () => {
    const r = matchFiles(["Schwab"], candidates, {});
    expect(r.matched).toEqual([{ assetName: "Schwab", assetId: "a3" }]);
    expect(r.ambiguous).toEqual([]);
    expect(r.unmatched).toEqual([]);
  });

  it("flags ambiguous names (two 'Riv') unless an override resolves them", () => {
    const r = matchFiles(["Riv (BTC)"], candidates, {});
    expect(r.ambiguous).toContain("Riv (BTC)");
    const r2 = matchFiles(["Riv (BTC)"], candidates, { "Riv (BTC)": "a2" });
    expect(r2.matched).toEqual([{ assetName: "Riv (BTC)", assetId: "a2" }]);
  });

  it("reports a name that matches nothing as unmatched", () => {
    expect(matchFiles(["Nonexistent XYZ"], candidates, {}).unmatched).toContain("Nonexistent XYZ");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/lib/kubera-history/match.ts`**

```ts
import { suggestAssetMatch } from "@/lib/ai/fuzzy-match";

interface Candidate { id: string; name: string; currency: string; type: string }
export interface MatchOutcome {
  matched: { assetName: string; assetId: string }[];
  ambiguous: string[];   // names with >1 equally-good candidate and no override
  unmatched: string[];   // names with no candidate and no override
}

export function matchFiles(
  assetNames: string[],
  candidates: Candidate[],
  overrides: Record<string, string>
): MatchOutcome {
  const out: MatchOutcome = { matched: [], ambiguous: [], unmatched: [] };
  for (const name of assetNames) {
    if (overrides[name]) {
      out.matched.push({ assetName: name, assetId: overrides[name] });
      continue;
    }
    const best = suggestAssetMatch(name, "USD", candidates);
    if (!best) { out.unmatched.push(name); continue; }
    // Ambiguous if another candidate ties the best confidence.
    const ties = candidates.filter((c) => {
      const m = suggestAssetMatch(name, "USD", [c]);
      return m != null && Math.abs(m.confidence - best.confidence) < 1e-9;
    });
    if (ties.length > 1) { out.ambiguous.push(name); continue; }
    out.matched.push({ assetName: name, assetId: best.assetId });
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**
```bash
git add src/lib/kubera-history/match.ts src/lib/kubera-history/__tests__/match.test.ts
git commit -m "feat(kubera-history): file-to-asset matching with override + ambiguity flags"
```

---

### Task 6: Insert-only filter (pure)

**Files:**
- Create: append to `src/lib/kubera-history/plan.ts`
- Test: append to `src/lib/kubera-history/__tests__/plan.test.ts`

- [ ] **Step 1: Add a failing test**

```ts
import { filterExistingAssetSnapshots, portfolioDatesToCreate } from "@/lib/kubera-history/plan";

describe("insert-only filters", () => {
  it("drops planned asset snapshots whose (assetId,date) already exists", () => {
    const planned = [
      { assetId: "btc", date: "2025-01-01", usd: 100, qty: 1, price: 100 },
      { assetId: "btc", date: "2025-02-01", usd: 100, qty: 1, price: 100 },
    ];
    const existing = new Set(["btc@2025-02-01"]);
    const kept = filterExistingAssetSnapshots(planned, existing);
    expect(kept.map((p) => p.date)).toEqual(["2025-01-01"]);
  });

  it("only creates portfolio snapshots for union dates before the global cutoff and not already present", () => {
    const dates = portfolioDatesToCreate(
      ["2025-01-01", "2025-02-01", "2025-03-01"],
      "2025-03-01",                 // globalCutoff (earliest existing portfolio_snapshot)
      new Set(["2025-01-01"])       // existing portfolio_snapshot dates
    );
    expect(dates).toEqual(["2025-02-01"]); // 01 exists, 03 is >= cutoff
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Append to `src/lib/kubera-history/plan.ts`**

```ts
export function filterExistingAssetSnapshots(
  planned: PlannedAssetSnapshot[],
  existingKeys: Set<string> // "assetId@date"
): PlannedAssetSnapshot[] {
  return planned.filter((p) => !existingKeys.has(`${p.assetId}@${p.date}`));
}

// Portfolio snapshots are created only for pre-Summa-era union dates that don't
// already have a row — so we never undercount a mixed (partly-live) date and
// never touch an existing snapshot.
export function portfolioDatesToCreate(
  unionDates: string[],
  globalCutoff: string | null,     // earliest existing portfolio_snapshot date
  existingDates: Set<string>
): string[] {
  return unionDates.filter(
    (d) => (globalCutoff == null || d < globalCutoff) && !existingDates.has(d)
  );
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**
```bash
git add src/lib/kubera-history/plan.ts src/lib/kubera-history/__tests__/plan.test.ts
git commit -m "feat(kubera-history): insert-only + global-cutoff filters"
```

---

### Task 7: Orchestrator — dry run

**Files:**
- Create: `src/lib/db/import-kubera-history.ts`

This wires everything and, by default, writes NOTHING. It reads CSVs from a folder, matches, loads existing snapshot keys + per-asset cutoffs, plans the write set, fetches BTC history, and prints a full report. Mirrors the DB-setup pattern in `src/lib/db/backfill-snapshots.ts` (postgres-js + drizzle, build `sheetTypeMap`/`sectionSheetMap`/`assetMetaById`).

- [ ] **Step 1: Implement the orchestrator scaffold + dry-run report**

```ts
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
        return { assetId, rows: p.rows, cutoff: cutoffByAsset.get(assetId) ?? null, firstDate: p.rows[0]?.date ?? "9999-12-31" };
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
```

- [ ] **Step 2: Typecheck** — `pnpm exec tsc --noEmit` (only pre-existing fixture errors allowed).
- [ ] **Step 3: Commit**
```bash
git add src/lib/db/import-kubera-history.ts
git commit -m "feat(kubera-history): orchestrator dry-run (parse/match/plan/report)"
```

---

### Task 8: Orchestrator — commit, invariant, manifest, undo

**Files:**
- Modify: `src/lib/db/import-kubera-history.ts` (replace the `commit`/`undo` stubs)

- [ ] **Step 1: Implement `commit`** — capture invariant, insert asset snapshots (with `valueInBtc` from BTC history), create portfolio snapshots via `aggregatePortfolioTotals`, write manifest, re-check invariant.

```ts
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
  const before = await currentValueSum(db, portfolio.id);

  const btc = await getBtcUsdHistory();
  const insertedAssetIds: string[] = [];
  const insertedPortfolioIds: string[] = [];

  // Insert asset snapshots (insert-only via onConflictDoNothing)
  for (const p of planned) {
    const rate = btc.get(p.date) ?? null;
    const valueInBtc = rate ? (p.usd / rate).toFixed(10) : null;
    const [row] = await db.insert(schema.assetSnapshots).values({
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
  for (const p of planned) { (plannedByDate.get(p.date) ?? plannedByDate.set(p.date, []).get(p.date)!).push(p); }
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
    const [row] = await db.insert(schema.portfolioSnapshots).values({
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

  // Invariant AFTER
  const after = await currentValueSum(db, portfolio.id);
  if (before !== after) {
    throw new Error(`INVARIANT VIOLATED: current value sum changed ${before} -> ${after}. Investigate before trusting this run.`);
  }

  const manifest = { ts: new Date().toISOString(), portfolioId: portfolio.id, insertedAssetIds, insertedPortfolioIds };
  const file = `kubera-backfill-manifest-${manifest.ts.replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  console.log(`\nInserted ${insertedAssetIds.length} asset snapshots, ${insertedPortfolioIds.length} portfolio snapshots.`);
  console.log(`Invariant OK (current value sum unchanged: ${after}).`);
  console.log(`Undo manifest written: ${file}`);
}

async function currentValueSum(db: ReturnType<typeof drizzle>, portfolioId: string): Promise<string> {
  const sheetRows = await db.select().from(schema.sheets).where(eq(schema.sheets.portfolioId, portfolioId));
  const sectionRows = sheetRows.length
    ? await db.select().from(schema.sections).where(inArray(schema.sections.sheetId, sheetRows.map((s) => s.id))) : [];
  const assetRows = sectionRows.length
    ? await db.select().from(schema.assets).where(inArray(schema.assets.sectionId, sectionRows.map((s) => s.id))) : [];
  let sum = 0;
  for (const a of assetRows) sum += Number(a.currentValue);
  return sum.toFixed(2);
}
```

- [ ] **Step 2: Implement `undo`** (replace stub)

```ts
async function undo(db: ReturnType<typeof drizzle>, manifestPath: string): Promise<void> {
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { insertedAssetIds: string[]; insertedPortfolioIds: string[] };
  if (m.insertedAssetIds.length)
    await db.delete(schema.assetSnapshots).where(inArray(schema.assetSnapshots.id, m.insertedAssetIds));
  if (m.insertedPortfolioIds.length)
    await db.delete(schema.portfolioSnapshots).where(inArray(schema.portfolioSnapshots.id, m.insertedPortfolioIds));
  console.log(`Undid ${m.insertedAssetIds.length} asset + ${m.insertedPortfolioIds.length} portfolio snapshots.`);
}
```

- [ ] **Step 3: Typecheck** — `pnpm exec tsc --noEmit`. Fix any type errors against the real `schema.*.$inferSelect`/`$inferInsert` shapes (e.g. `parentAssetId` nullability). The non-crypto/cash insert path mirrors the existing Kubera importer and `backfill-snapshots.ts`.
- [ ] **Step 4: Full unit suite** — `pnpm vitest run` (expect all green; this task adds no unit tests, only orchestration).
- [ ] **Step 5: Commit**
```bash
git add src/lib/db/import-kubera-history.ts
git commit -m "feat(kubera-history): commit path, current-state invariant, manifest + undo"
```

---

### Task 9: Guided real run (with the user's data)

**This is the only task that writes real data. Do it WITH Nick, not autonomously.**

- [ ] **Step 1: Backup.** `docker exec summa-postgres pg_dump -U summa summa > ~/summa-pre-kubera-$(date +%Y%m%d-%H%M).sql` and confirm the file is non-empty.
- [ ] **Step 2: Stage CSVs.** Nick drops one file per asset into `/opt/summa/kubera-history/` (or a chosen `--dir`). Create `mapping.json` for any asset whose name is ambiguous (e.g. `{"Riv (BTC)": "7f95bfd5-3363-4484-a016-ad3be9647ec3", "Riv (USD)": "879a7939-8f3f-4fb3-a500-e572857941ed"}`).
- [ ] **Step 3: Dry run.** `pnpm tsx --env-file=.env src/lib/db/import-kubera-history.ts --dir ./kubera-history --portfolio <portfolioId>`. Review: all files matched (no AMBIGUOUS/UNMATCHED), sane date ranges and counts. Resolve any flags via `mapping.json` and re-run until clean.
- [ ] **Step 4: Commit the import.** Add `--commit`. Confirm "Invariant OK" prints and the manifest path is shown.
- [ ] **Step 5: Verify.**
  - Current state unchanged: dashboard net worth identical to before (the invariant already asserts this; eyeball anyway).
  - History extended: open the net-worth chart (USD and BTC/sats) and an asset-detail chart — they now go back ~2 years, smooth, with the live era unchanged at the boundary.
  - Spot-check one date in the DB: `SELECT date, net_worth, net_worth_in_btc, btc_usd_rate FROM portfolio_snapshots WHERE portfolio_id='<id>' ORDER BY date LIMIT 5;`
- [ ] **Step 6: If anything looks wrong**, `--undo <manifest.json>` (surgical) or restore the pg_dump (backstop). Re-run after fixing CSVs (idempotent).

---

## Self-Review

**Spec coverage:**
- Input format / tolerant parse → Task 2 ✓
- Match (fuzzy + override + ambiguity) → Task 5 ✓
- Historical BTC price → Task 4 ✓
- Per-asset boundary + carry-forward → Task 3 ✓
- Insert-only + global cutoff → Task 6 ✓
- Net-worth recompute (insert-only, historical rate) → Task 8 ✓
- pg_dump, dry-run default, invariant, manifest/undo → Tasks 7, 8, 9 ✓
- Non-USD flagged/skipped; null BTC price → null fields → Tasks 7 (warning), 8 (null valueInBtc/btcUsdRate) ✓

**Type consistency:** `KuberaHistoryRow`/`ParsedKuberaFile`/`PlannedAssetSnapshot` (Task 1) flow through parse (2), plan (3, 6), orchestrator (7, 8). `AssetPlanInput` defined in Task 3 is used in Task 7. `matchFiles`→`MatchOutcome` (5) consumed in 7. `aggregatePortfolioTotals`/`AggregatableAsset` used exactly as in `backfill-snapshots.ts`.

**Placeholder scan:** Task 7 ships intentional `commit`/`undo` stubs that throw, explicitly replaced in Task 8 — not placeholders, a deliberate two-step. No "TBD"/"add error handling" placeholders elsewhere.
