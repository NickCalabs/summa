import { TtlCache } from "@/lib/providers/rate-limit-cache";

const cache = new TtlCache<number>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getCurrentBtcUsd(): Promise<number | null> {
  const cached = cache.get("btc-usd");
  if (cached != null) return cached;

  try {
    const res = await fetch(
      "https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD"
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data.USD;
    if (typeof rate !== "number" || rate <= 0) return null;
    cache.set("btc-usd", rate, TTL_MS);
    return rate;
  } catch {
    return null;
  }
}
