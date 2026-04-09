import { TokenBucket, TtlCache } from "./rate-limit-cache";
import { isValidSolAddress, normalizeSolAddress } from "@/lib/sol";

/**
 * Helius DAS (Digital Asset Standard) API provider for Solana mainnet
 * balance + SPL token detection.
 *
 * Free-tier constraints:
 * - 100k credits/month (~3 req/sec sustained)
 * - `getAssetsByOwner` with `showFungible + showNativeBalance` returns
 *   SOL + all fungible SPL tokens in one call — much simpler than ETH.
 *
 * Strategy:
 * 1. Call `getAssetsByOwner` once per address
 * 2. Parse `nativeBalance` for SOL
 * 3. Filter `items` to `interface === "FungibleToken"` for SPL tokens
 * 4. Helius pre-prices most tokens — use their price when available
 * 5. Filter to top 50 by USD value, drop zero-balance dust
 */

const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60_000;
const BATCH_POLITENESS_MS = 350;
const MAX_TOKENS = 50;

// ~3 req/sec sustained — conservative for the free tier.
const bucket = new TokenBucket(3, 1_000);
const cache = new TtlCache<SolAddressInfo>();

export interface SolTokenBalance {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  rawBalance: bigint;
  formattedBalance: string;
  priceUsd: number;
  valueUsd: number;
}

export interface SolAddressInfo {
  address: string;
  solBalanceLamports: bigint;
  solBalanceFormatted: number;
  solPriceUsd: number | null;
  solValueUsd: number;
  tokens: SolTokenBalance[];
  source: "helius";
  fetchedAt: Date;
}

export interface HeliusFetchOptions {
  fetchImpl?: typeof fetch;
  skipRateLimit?: boolean;
  skipCache?: boolean;
}

export class HeliusError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "rate_limited"
      | "network_error"
      | "invalid_response"
      | "missing_api_key"
      | "api_error",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "HeliusError";
  }
}

function getApiKey(): string {
  const key = process.env.HELIUS_API_KEY;
  if (!key) {
    throw new HeliusError(
      "HELIUS_API_KEY is not set — cannot query Helius",
      "missing_api_key"
    );
  }
  return key;
}

function getRpcUrl(apiKey: string): string {
  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
}

// ── DAS response types (subset we care about) ──

interface DasNativeBalance {
  lamports: number;
  sol: number;
  total_price: number;
  price_per_sol: number;
}

interface DasTokenInfo {
  balance: number;
  supply: number;
  decimals: number;
  token_program: string;
  symbol?: string;
  price_info?: {
    price_per_token: number;
    total_price: number;
    currency: string;
  };
}

interface DasContentMetadata {
  name?: string;
  symbol?: string;
}

interface DasAssetItem {
  id: string;
  interface: string;
  content?: {
    metadata?: DasContentMetadata;
  };
  token_info?: DasTokenInfo;
}

interface DasResponse {
  jsonrpc: string;
  result?: {
    total: number;
    limit: number;
    page: number;
    items: DasAssetItem[];
    nativeBalance?: DasNativeBalance;
  };
  error?: {
    code: number;
    message: string;
  };
}

async function heliusFetch(
  address: string,
  opts: HeliusFetchOptions = {}
): Promise<DasResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;

  if (!opts.skipRateLimit) {
    await bucket.waitForToken();
  }

  const apiKey = getApiKey();
  const url = getRpcUrl(apiKey);

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: "summa-sol",
    method: "getAssetsByOwner",
    params: {
      ownerAddress: address,
      page: 1,
      limit: 100,
      displayOptions: {
        showFungible: true,
        showNativeBalance: true,
      },
    },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    throw new HeliusError("Helius: network error", "network_error", err);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    bucket.reportRateLimit();
    throw new HeliusError("Helius: rate limited", "rate_limited");
  }
  if (!res.ok) {
    throw new HeliusError(
      `Helius: HTTP ${res.status}`,
      "network_error"
    );
  }

  let data: DasResponse;
  try {
    data = (await res.json()) as DasResponse;
  } catch (err) {
    throw new HeliusError(
      "Helius: invalid JSON response",
      "invalid_response",
      err
    );
  }

  if (data.error) {
    const msg = data.error.message ?? "";
    if (msg.includes("rate") || msg.includes("limit")) {
      bucket.reportRateLimit();
      throw new HeliusError("Helius: rate limited", "rate_limited");
    }
    throw new HeliusError(
      `Helius API error: ${msg}`,
      "api_error"
    );
  }

  return data;
}

function parseDasResponse(
  address: string,
  data: DasResponse
): SolAddressInfo {
  const result = data.result;
  const native = result?.nativeBalance;

  const solBalanceLamports = BigInt(native?.lamports ?? 0);
  const solBalanceFormatted = native?.sol ?? 0;
  const solPriceUsd = native?.price_per_sol ?? null;
  const solValueUsd = native?.total_price ?? 0;

  const tokens: SolTokenBalance[] = [];

  if (result?.items) {
    for (const item of result.items) {
      // Only fungible SPL tokens — drop NFTs, compressed NFTs, etc.
      if (item.interface !== "FungibleToken") continue;

      const tokenInfo = item.token_info;
      if (!tokenInfo) continue;

      const decimals = tokenInfo.decimals ?? 0;
      const rawBalance = BigInt(tokenInfo.balance ?? 0);
      if (rawBalance === 0n) continue;

      const symbol =
        tokenInfo.symbol ??
        item.content?.metadata?.symbol ??
        "";
      const name =
        item.content?.metadata?.name ??
        symbol;

      // Skip tokens with no symbol (likely spam/dust).
      if (!symbol) continue;

      // Format the balance using decimals
      const divisor = 10n ** BigInt(decimals);
      const whole = rawBalance / divisor;
      const fraction = rawBalance % divisor;
      const fractionStr = fraction.toString().padStart(decimals, "0");
      const formattedBalance = `${whole}.${fractionStr}`;

      const priceUsd = tokenInfo.price_info?.price_per_token ?? 0;
      const valueUsd = tokenInfo.price_info?.total_price ?? Number(formattedBalance) * priceUsd;

      tokens.push({
        mint: item.id,
        symbol,
        name,
        decimals,
        rawBalance,
        formattedBalance,
        priceUsd,
        valueUsd,
      });
    }
  }

  // Sort by USD value desc, keep top N.
  tokens.sort((a, b) => b.valueUsd - a.valueUsd);
  const topTokens = tokens.slice(0, MAX_TOKENS);

  return {
    address,
    solBalanceLamports,
    solBalanceFormatted,
    solPriceUsd,
    solValueUsd,
    tokens: topTokens,
    source: "helius",
    fetchedAt: new Date(),
  };
}

/**
 * Fetch SOL balance + SPL token holdings for a single address.
 */
export async function getSolBalance(
  address: string,
  opts: HeliusFetchOptions = {}
): Promise<SolAddressInfo> {
  const normalized = normalizeSolAddress(address);

  if (!opts.skipCache) {
    const cached = cache.get(normalized);
    if (cached) return cached;
  }

  const data = await heliusFetch(normalized, opts);
  const info = parseDasResponse(normalized, data);

  if (!opts.skipCache) {
    cache.set(normalized, info, CACHE_TTL_MS);
  }

  return info;
}

/**
 * Fetch balances for many addresses with polite delays.
 */
export async function getSolBalanceBatch(
  addresses: string[],
  opts: HeliusFetchOptions & {
    onError?: (address: string, error: unknown) => void;
  } = {}
): Promise<Map<string, SolAddressInfo>> {
  const results = new Map<string, SolAddressInfo>();
  const unique = [...new Set(addresses.map(normalizeSolAddress))];

  for (let i = 0; i < unique.length; i++) {
    const address = unique[i];
    try {
      const info = await getSolBalance(address, opts);
      results.set(address, info);
    } catch (err) {
      opts.onError?.(address, err);
    }

    if (i < unique.length - 1) {
      await new Promise((r) => setTimeout(r, BATCH_POLITENESS_MS));
    }
  }

  return results;
}

/**
 * Check if the Helius API key is configured.
 */
export function isHeliusConfigured(): boolean {
  return !!process.env.HELIUS_API_KEY;
}
