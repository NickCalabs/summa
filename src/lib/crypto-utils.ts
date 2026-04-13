/**
 * Maps common CoinGecko IDs to ticker symbols.
 * Falls back to uppercased first 5 chars for unknown tokens.
 */
const COINGECKO_SYMBOLS: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  litecoin: "LTC",
  dogecoin: "DOGE",
  cardano: "ADA",
  polkadot: "DOT",
  chainlink: "LINK",
  "avalanche-2": "AVAX",
  "matic-network": "MATIC",
  uniswap: "UNI",
  cosmos: "ATOM",
  monero: "XMR",
  stellar: "XLM",
  tezos: "XTZ",
  algorand: "ALGO",
  ripple: "XRP",
};

/**
 * For crypto ticker assets (CoinGecko source), returns the crypto symbol
 * (e.g., "BTC", "ETH"). Returns null for non-crypto assets.
 *
 * Crypto assets store currency="USD" because prices/values are in USD,
 * but the quantity is in native crypto units. This function tells you
 * what those units actually are.
 */
export function getCryptoSymbol(
  providerConfig: Record<string, unknown> | null | undefined
): string | null {
  if (!providerConfig) return null;
  if (providerConfig.exchange !== "crypto") return null;
  const ticker = providerConfig.ticker;
  if (typeof ticker !== "string") return null;
  return COINGECKO_SYMBOLS[ticker] ?? ticker.slice(0, 5).toUpperCase();
}
