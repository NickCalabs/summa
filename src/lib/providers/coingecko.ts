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

/**
 * Fetch USD price for an ERC-20 token by its Ethereum mainnet contract
 * address. Uses the /coins/ethereum/contract/{address} endpoint.
 *
 * Returns the USD price, or null if CoinGecko doesn't have the token
 * (404). Callers should treat null as "price unknown, value = 0" rather
 * than an error.
 *
 * Aggressively cached (10 min TTL) because token prices don't need to
 * refresh every cron cycle and the free tier only allows 30 req/min.
 */
const TOKEN_PRICE_TTL = 10 * 60 * 1000; // 10 minutes

export async function getCoinGeckoTokenPrice(
  contractAddress: string
): Promise<number | null> {
  const normalized = contractAddress.trim().toLowerCase();
  const cacheKey = `token:${normalized}`;

  const cached = cache.get(cacheKey) as number | null | undefined;
  if (cached !== undefined) return cached;

  try {
    const data = await cgFetch<{
      market_data?: {
        current_price?: { usd?: number };
      };
    }>(`/coins/ethereum/contract/${encodeURIComponent(normalized)}`);

    const price = data?.market_data?.current_price?.usd ?? null;
    cache.set(cacheKey, price, TOKEN_PRICE_TTL);
    return price;
  } catch (err) {
    // 404 = CoinGecko doesn't track this token. Cache the null so we
    // don't re-query on every cron tick.
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("404")) {
      cache.set(cacheKey, null, TOKEN_PRICE_TTL);
      return null;
    }
    // Real errors (rate limit, network) — don't cache, throw so the
    // caller can decide what to do.
    throw err;
  }
}

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
