import { TokenBucket, TtlCache } from "./rate-limit-cache";
import { isValidEthAddress, normalizeEthAddress } from "@/lib/eth";

/**
 * Etherscan v2 API provider for Ethereum mainnet balance + ERC-20 tokens.
 *
 * Free-tier constraints:
 * - With API key: 5 calls/second, 100k calls/day
 * - Without API key: heavily throttled (unusable for cron)
 *
 * Strategy for tokens:
 * 1. Fetch ETH balance  (1 call)
 * 2. Fetch all ERC-20 transfers via tokentx  (1 call, capped at 200 most
 *    recent)
 * 3. Derive unique contract addresses from transfer log
 * 4. Per-contract tokenbalance query  (N calls, capped at top 50)
 * 5. Filter to non-zero balances, drop spam
 *
 * This means a wallet with 30 unique tokens costs ~32 calls per sync.
 * At 5 calls/sec that's ~6 seconds. Fine for 30-min cron on a single-user
 * instance.
 */

const BASE_URL = "https://api.etherscan.io/v2/api";
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60_000;

// 4 req/sec — conservative vs. the 5/sec hard limit to avoid 429s.
const bucket = new TokenBucket(4, 1_000);
const cache = new TtlCache<EthAddressInfo>();

// 200ms between calls inside a batch. Etherscan punishes bursts more than
// steady streams, so spacing calls helps keep us under the rate fence.
const BATCH_POLITENESS_MS = 200;

// Max unique contracts to query per wallet. Wallets with 1000+ tokens are
// almost always 99% airdrop spam — cap this to avoid burning our quota.
const MAX_TOKEN_CONTRACTS = 50;

export interface EthTokenBalance {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  rawBalance: bigint;
  formattedBalance: string;
}

export interface EthAddressInfo {
  address: string;
  ethBalanceWei: bigint;
  ethBalanceFormatted: number;
  tokens: EthTokenBalance[];
  source: "etherscan";
  fetchedAt: Date;
}

export interface EtherscanFetchOptions {
  /** Override base URL. Tests inject a mock server here. */
  baseUrl?: string;
  /** Inject a custom fetch. Tests pass vi.fn() here. */
  fetchImpl?: typeof fetch;
  /** Skip the rate-limit bucket. Only for tests. */
  skipRateLimit?: boolean;
  /** Skip the TTL cache. For manual-sync flows. */
  skipCache?: boolean;
}

export class EtherscanError extends Error {
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
    this.name = "EtherscanError";
  }
}

function getApiKey(): string {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) {
    throw new EtherscanError(
      "ETHERSCAN_API_KEY is not set — cannot query Etherscan",
      "missing_api_key"
    );
  }
  return key;
}

async function fetchWithTimeout(
  url: string,
  fetchImpl: typeof fetch
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

interface EtherscanApiResponse {
  status: string; // "1" for ok, "0" for error
  message: string;
  result: unknown;
}

async function etherscanFetch<T>(
  params: Record<string, string>,
  opts: EtherscanFetchOptions = {}
): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl ?? BASE_URL;

  if (!opts.skipRateLimit) {
    await bucket.waitForToken();
  }

  const apiKey = opts.baseUrl ? "test" : getApiKey(); // tests don't need real key
  const queryParams = new URLSearchParams({
    ...params,
    chainid: "1",
    apikey: apiKey,
  });

  const url = `${base}?${queryParams.toString()}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, fetchImpl);
  } catch (err: unknown) {
    throw new EtherscanError("Etherscan: network error", "network_error", err);
  }

  if (res.status === 429) {
    bucket.reportRateLimit();
    throw new EtherscanError("Etherscan: rate limited", "rate_limited");
  }
  if (!res.ok) {
    throw new EtherscanError(
      `Etherscan: HTTP ${res.status}`,
      "network_error"
    );
  }

  let data: EtherscanApiResponse;
  try {
    data = (await res.json()) as EtherscanApiResponse;
  } catch (err) {
    throw new EtherscanError(
      "Etherscan: invalid JSON response",
      "invalid_response",
      err
    );
  }

  // Etherscan returns status="0" for various errors. The "message" field
  // tells us what happened. Rate limits come as "NOTOK" + a message like
  // "Max rate limit reached".
  if (data.status === "0") {
    const msg = String(data.message ?? "");
    const resultMsg = String(data.result ?? "");
    if (msg.includes("rate limit") || resultMsg.includes("rate limit")) {
      bucket.reportRateLimit();
      throw new EtherscanError(
        "Etherscan: rate limited",
        "rate_limited"
      );
    }
    // "No transactions found" is not an error — it means the address
    // hasn't made any ERC-20 transfers.
    if (resultMsg === "No transactions found" || msg === "No transactions found") {
      return [] as unknown as T;
    }
    throw new EtherscanError(
      `Etherscan API error: ${msg} — ${resultMsg}`,
      "api_error"
    );
  }

  return data.result as T;
}

/**
 * Fetch the native ETH balance for an address.
 */
async function fetchEthBalance(
  address: string,
  opts: EtherscanFetchOptions = {}
): Promise<bigint> {
  const result = await etherscanFetch<string>(
    { module: "account", action: "balance", address, tag: "latest" },
    opts
  );
  return BigInt(result);
}

/**
 * Unique token contracts discovered from an address's ERC-20 transfer
 * history. We pull recent transfers rather than Etherscan's pro-only
 * tokenlist endpoint.
 */
interface TokenTxEntry {
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
}

async function fetchTokenContracts(
  address: string,
  opts: EtherscanFetchOptions = {}
): Promise<Map<string, { name: string; symbol: string; decimals: number }>> {
  const raw = await etherscanFetch<TokenTxEntry[]>(
    {
      module: "account",
      action: "tokentx",
      address,
      startblock: "0",
      endblock: "99999999",
      sort: "desc",
      page: "1",
      offset: "200", // most recent 200 transfers
    },
    opts
  );

  const contracts = new Map<
    string,
    { name: string; symbol: string; decimals: number }
  >();

  if (!Array.isArray(raw)) return contracts;

  for (const tx of raw) {
    const addr = tx.contractAddress?.toLowerCase();
    if (!addr || contracts.has(addr)) continue;
    const symbol = tx.tokenSymbol ?? "";
    const decimals = parseInt(tx.tokenDecimal, 10);
    // Skip tokens with no symbol (likely spam/dust contracts).
    if (!symbol) continue;
    contracts.set(addr, {
      name: tx.tokenName ?? symbol,
      symbol,
      decimals: Number.isFinite(decimals) ? decimals : 18,
    });
    if (contracts.size >= MAX_TOKEN_CONTRACTS) break;
  }

  return contracts;
}

/**
 * Fetch the balance of a specific ERC-20 token for an address.
 */
async function fetchTokenBalance(
  address: string,
  contractAddress: string,
  opts: EtherscanFetchOptions = {}
): Promise<bigint> {
  const result = await etherscanFetch<string>(
    {
      module: "account",
      action: "tokenbalance",
      contractaddress: contractAddress,
      address,
      tag: "latest",
    },
    opts
  );
  try {
    return BigInt(result);
  } catch {
    return 0n;
  }
}

/**
 * Fetch current ETH balance + ERC-20 token holdings for a single address.
 *
 * This is the main entry point. It:
 * 1. Gets native ETH balance
 * 2. Discovers token contracts from transfer history
 * 3. Fetches balances for each discovered token
 * 4. Filters out zero-balance tokens
 */
export async function getEthBalance(
  address: string,
  opts: EtherscanFetchOptions = {}
): Promise<EthAddressInfo> {
  const normalized = normalizeEthAddress(address);

  if (!opts.skipCache) {
    const cached = cache.get(normalized);
    if (cached) return cached;
  }

  // Fetch ETH balance and token contracts concurrently.
  const [ethBalanceWei, contracts] = await Promise.all([
    fetchEthBalance(normalized, opts),
    fetchTokenContracts(normalized, opts),
  ]);

  // For each discovered contract, fetch its balance with a polite delay.
  const tokens: EthTokenBalance[] = [];
  const contractEntries = [...contracts.entries()];

  for (let i = 0; i < contractEntries.length; i++) {
    const [contractAddr, meta] = contractEntries[i];
    try {
      const rawBalance = await fetchTokenBalance(normalized, contractAddr, opts);
      if (rawBalance === 0n) continue; // skip empty holdings

      const divisor = 10n ** BigInt(meta.decimals);
      const whole = rawBalance / divisor;
      const fraction = rawBalance % divisor;
      const fractionStr = fraction.toString().padStart(meta.decimals, "0");
      const formattedBalance = `${whole}.${fractionStr}`;

      tokens.push({
        contractAddress: contractAddr,
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        rawBalance,
        formattedBalance,
      });
    } catch (err) {
      // Log but continue — one broken token shouldn't block the rest.
      console.warn(
        `[etherscan] Failed to fetch balance for token ${meta.symbol} (${contractAddr}):`,
        err instanceof Error ? err.message : String(err)
      );
    }

    // Politeness delay between token balance calls.
    if (i < contractEntries.length - 1 && !opts.skipRateLimit) {
      await new Promise((r) => setTimeout(r, BATCH_POLITENESS_MS));
    }
  }

  const ethBalanceFormatted = Number(ethBalanceWei) / 1e18;

  const info: EthAddressInfo = {
    address: normalized,
    ethBalanceWei,
    ethBalanceFormatted,
    tokens,
    source: "etherscan",
    fetchedAt: new Date(),
  };

  if (!opts.skipCache) {
    cache.set(normalized, info, CACHE_TTL_MS);
  }

  return info;
}

/**
 * Fetch balances for many addresses. Like Blockstream's batch, we loop
 * with a delay since Etherscan has no batch endpoint on the free tier.
 */
export async function getEthBalanceBatch(
  addresses: string[],
  opts: EtherscanFetchOptions & {
    onError?: (address: string, error: unknown) => void;
  } = {}
): Promise<Map<string, EthAddressInfo>> {
  const results = new Map<string, EthAddressInfo>();
  const unique = [...new Set(addresses.map(normalizeEthAddress))];

  for (let i = 0; i < unique.length; i++) {
    const address = unique[i];
    try {
      const info = await getEthBalance(address, opts);
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
 * Check if the Etherscan API key is configured. Used by the cron to
 * silently skip ETH sync when no key is available, rather than spamming
 * errors every 30 minutes.
 */
export function isEtherscanConfigured(): boolean {
  return !!process.env.ETHERSCAN_API_KEY;
}
