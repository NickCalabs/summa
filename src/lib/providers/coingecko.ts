import { TokenBucket, TtlCache } from "./rate-limit-cache";
import type { PriceProvider, PriceResult, SearchResult, BatchPriceResult } from "./types";

const BASE_URL = "https://api.coingecko.com/api/v3";
const CACHE_TTL = 5 * 60 * 1000;

const bucket = new TokenBucket(25, 60_000);
const cache = new TtlCache<unknown>();

async function cgFetch<T>(path: string): Promise<T> {
  await bucket.waitForToken();
  const res = await fetch(`${BASE_URL}${path}`);
  if (res.status === 429) {
    bucket.reportRateLimit();
    throw new Error("CoinGecko rate limit exceeded");
  }
  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const coingeckoProvider: PriceProvider = {
  type: "coingecko",

  async getPrice(symbol: string, currency: string): Promise<PriceResult> {
    const cur = currency.toLowerCase();
    const cacheKey = `price:${symbol}:${cur}`;

    const cached = cache.get(cacheKey) as PriceResult | undefined;
    if (cached) return cached;

    const data = await cgFetch<Record<string, Record<string, number>>>(
      `/simple/price?ids=${encodeURIComponent(symbol)}&vs_currencies=${encodeURIComponent(cur)}`
    );

    const coinData = data[symbol];
    if (!coinData || coinData[cur] === undefined) {
      throw new Error(`No price data for ${symbol}`);
    }

    const result: PriceResult = {
      price: coinData[cur],
      currency: currency.toUpperCase(),
      source: "coingecko",
      timestamp: new Date(),
    };

    cache.set(cacheKey, result, CACHE_TTL);
    return result;
  },

  async search(query: string): Promise<SearchResult[]> {
    const q = query.toLowerCase();
    const cacheKey = `search:${q}`;

    const cached = cache.get(cacheKey) as SearchResult[] | undefined;
    if (cached) return cached;

    const data = await cgFetch<{ coins: Array<{ id: string; name: string; symbol: string }> }>(
      `/search?query=${encodeURIComponent(query)}`
    );

    const results: SearchResult[] = (data.coins ?? []).map((coin) => ({
      symbol: coin.id,
      name: coin.name,
      exchange: "crypto",
      type: "crypto" as const,
      source: "coingecko" as const,
    }));

    cache.set(cacheKey, results, CACHE_TTL);
    return results;
  },
};

export async function getCoinGeckoBatchPrices(
  coinIds: string[],
  currency: string
): Promise<Map<string, BatchPriceResult>> {
  const results = new Map<string, BatchPriceResult>();
  const cur = currency.toLowerCase();
  const chunkSize = 50;

  for (let i = 0; i < coinIds.length; i += chunkSize) {
    const chunk = coinIds.slice(i, i + chunkSize);
    try {
      const ids = chunk.map((id) => encodeURIComponent(id)).join(",");
      const data = await cgFetch<Record<string, Record<string, number>>>(
        `/simple/price?ids=${ids}&vs_currencies=${encodeURIComponent(cur)}`
      );

      for (const coinId of chunk) {
        const coinData = data[coinId];
        if (coinData && coinData[cur] !== undefined) {
          results.set(coinId, {
            symbol: coinId,
            price: coinData[cur],
            currency: currency.toUpperCase(),
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      console.error(`[coingecko] Batch price error for chunk starting at ${i}:`, error);
    }
  }

  return results;
}
