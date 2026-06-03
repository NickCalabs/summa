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
