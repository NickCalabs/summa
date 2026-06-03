import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

const CACHE_PATH = path.join(os.tmpdir(), "summa-btc-history-cache.json");

// Fetches up to 2000 days of daily BTC/USD closes (covers ~5.5y). Returns
// date(YYYY-MM-DD) -> USD close. Caches the raw response to CACHE_PATH so
// re-runs require no network call.
export async function getBtcUsdHistory(): Promise<Map<string, number>> {
  if (fs.existsSync(CACHE_PATH)) {
    return parseHistoday(JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")));
  }
  const res = await fetch(
    "https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000"
  );
  if (!res.ok) throw new Error(`CryptoCompare histoday failed: ${res.status}`);
  const json = await res.json() as unknown;
  fs.writeFileSync(CACHE_PATH, JSON.stringify(json));
  return parseHistoday(json);
}
