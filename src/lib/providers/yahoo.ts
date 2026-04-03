import yahooFinance from "yahoo-finance2";
import type { PriceProvider, PriceResult, SearchResult, BatchPriceResult } from "./types";

const yf = yahooFinance as any;

const QUOTE_TYPE_MAP: Record<string, SearchResult["type"]> = {
  EQUITY: "stock",
  ETF: "etf",
  CRYPTOCURRENCY: "crypto",
  INDEX: "index",
  MUTUALFUND: "mutualfund",
};

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error?.response?.status ?? error?.statusCode;
      const isRetryable = status === 502 || status === 503 || status === 429;
      if (!isRetryable || attempt === retries) throw error;
      console.warn(`[yahoo] Retrying after ${status} (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
    }
  }
  throw new Error("unreachable");
}

export const yahooProvider: PriceProvider = {
  type: "yahoo",

  async getPrice(symbol: string, currency: string): Promise<PriceResult> {
    const quote: any = await fetchWithRetry(() => yf.quote(symbol));
    return {
      price: quote.regularMarketPrice ?? 0,
      currency: quote.currency ?? currency,
      source: "yahoo",
      timestamp: quote.regularMarketTime
        ? new Date(quote.regularMarketTime)
        : new Date(),
    };
  },

  async search(query: string): Promise<SearchResult[]> {
    const result: any = await fetchWithRetry(() =>
      yf.search(query, { quotesCount: 20, newsCount: 0 })
    );

    return (result.quotes ?? [])
      .filter((q: any) => q.isYahooFinance !== false)
      .map((q: any) => ({
        symbol: q.symbol ?? "",
        name: q.shortname ?? q.longname ?? q.symbol ?? "",
        exchange: q.exchDisp ?? q.exchange ?? "",
        type: QUOTE_TYPE_MAP[q.quoteType ?? ""] ?? "stock",
        source: "yahoo" as const,
      }))
      .filter((r: SearchResult) => r.symbol);
  },
};

export async function getYahooBatchPrices(
  symbols: string[]
): Promise<Map<string, BatchPriceResult>> {
  const results = new Map<string, BatchPriceResult>();
  const chunkSize = 50;

  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    try {
      const quotes = await fetchWithRetry(() => yf.quote(chunk));
      const quoteArray = Array.isArray(quotes) ? quotes : [quotes];
      for (const q of quoteArray) {
        if (q?.symbol && q.regularMarketPrice != null) {
          if (q.regularMarketPrice <= 0) {
            console.warn(`[yahoo] Skipping ${q.symbol}: received invalid price ${q.regularMarketPrice}`);
            continue;
          }
          results.set(q.symbol, {
            symbol: q.symbol,
            price: q.regularMarketPrice,
            currency: q.currency ?? "USD",
            timestamp: q.regularMarketTime
              ? new Date(q.regularMarketTime)
              : new Date(),
          });
        }
      }
    } catch (error) {
      console.error(`[yahoo] Batch quote error for chunk starting at ${i}:`, error);
    }
  }

  return results;
}
