import { TtlCache } from "@/lib/providers/rate-limit-cache";

const cache = new TtlCache<number>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

// Coinbase's /v2/prices/BTC-USD/spot endpoint is public (no API key) and is the
// same authoritative source we already use to price Coinbase holdings (see
// getCoinbaseSpotPrices). We switched to it after CryptoCompare's free
// min-api endpoint started returning 401 "API key required", which silently
// turned getCurrentBtcUsd into a null factory — breaking every BTC/sats
// conversion and spiking the net-worth chart (today's point fell back to a raw
// USD value plotted against historical BTC points).
export async function getCurrentBtcUsd(): Promise<number | null> {
  const cached = cache.get("btc-usd");
  if (cached != null) return cached;

  try {
    const res = await fetch(
      "https://api.coinbase.com/v2/prices/BTC-USD/spot"
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { amount?: string | number } };
    const rate = Number(data?.data?.amount);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    cache.set("btc-usd", rate, TTL_MS);
    return rate;
  } catch {
    return null;
  }
}
