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
