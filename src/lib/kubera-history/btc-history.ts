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

// Fetches up to 2000 days of daily BTC/USD closes (covers ~5.5y). Returns
// date(YYYY-MM-DD) -> USD close.
export async function getBtcUsdHistory(): Promise<Map<string, number>> {
  const res = await fetch(
    "https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000"
  );
  if (!res.ok) throw new Error(`CryptoCompare histoday failed: ${res.status}`);
  return parseHistoday(await res.json());
}
