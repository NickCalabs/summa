// eslint-disable-next-line @typescript-eslint/no-require-imports
import yahooFinance from "yahoo-finance2";
import type { PriceProvider, PriceResult, SearchResult } from "./types";

const yf = yahooFinance as any;

const QUOTE_TYPE_MAP: Record<string, SearchResult["type"]> = {
  EQUITY: "stock",
  ETF: "etf",
  CRYPTOCURRENCY: "crypto",
  INDEX: "index",
  MUTUALFUND: "mutualfund",
};

export const yahooProvider: PriceProvider = {
  type: "yahoo",

  async getPrice(symbol: string, currency: string): Promise<PriceResult> {
    const quote = await yf.quote(symbol);
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
    const result = await yf.search(query, {
      quotesCount: 20,
      newsCount: 0,
    });

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
