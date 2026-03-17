export interface PriceResult {
  price: number;
  currency: string;
  source: "yahoo" | "coingecko";
  timestamp: Date;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: "stock" | "etf" | "crypto" | "index" | "mutualfund";
  source: "yahoo" | "coingecko";
}

export interface PriceProvider {
  type: "yahoo" | "coingecko";
  getPrice(symbol: string, currency: string): Promise<PriceResult>;
  search(query: string): Promise<SearchResult[]>;
}

const providers: Record<string, () => Promise<PriceProvider>> = {
  yahoo: async () => (await import("./yahoo")).yahooProvider,
  coingecko: async () => (await import("./coingecko")).coingeckoProvider,
};

export async function getProvider(source: string): Promise<PriceProvider> {
  const loader = providers[source];
  if (!loader) throw new Error(`Unknown provider: ${source}`);
  return loader();
}
