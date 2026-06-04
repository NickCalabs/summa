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
  const cleaned = cell.replace(/[$,]/g, "").trim();
  if (/^nan$/i.test(cleaned)) return null; // Kubera writes "NaN" for empty qty/price on zero-value days
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN; // NaN signals a genuine parse error to the caller
}

export function parseKuberaHistoryFile(text: string): ParsedKuberaFile {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
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
