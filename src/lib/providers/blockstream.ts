import { TokenBucket, TtlCache } from "./rate-limit-cache";
import { computeBalanceSats, satsToBtcNumber, satsToBtcString } from "@/lib/btc";

/**
 * Esplora-compatible BTC address provider.
 *
 * Primary source: Blockstream's public Esplora (no auth, no hard rate limit
 * but we self-throttle to be polite). Fallback: Mempool.space, which
 * implements the same response shape because they both fork Esplora.
 *
 * We do NOT try to submit transactions or pull full history — this module
 * is read-only: "what's the balance of this address right now?" Everything
 * else is out of scope for v0.2.
 */

const PRIMARY_BASE = "https://blockstream.info/api";
const FALLBACK_BASE = "https://mempool.space/api";
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;

// 10 requests per minute per process — plenty for a single-tester
// instance, and tiny enough that we'll never be a Blockstream nuisance.
const bucket = new TokenBucket(10, 60_000);
const cache = new TtlCache<BtcAddressInfo>();

// 100ms politeness delay between calls inside a batch. Esplora doesn't
// require it, but hammering a public endpoint with no spacing is rude.
const BATCH_POLITENESS_MS = 100;

export interface BtcAddressInfo {
  address: string;
  balanceSats: bigint;
  balanceBtc: number;
  balanceBtcString: string;
  source: "blockstream" | "mempool.space";
  fetchedAt: Date;
}

export interface BlockstreamFetchOptions {
  /**
   * Override the default Blockstream base URL. Used by tests to inject a
   * mock server. In production, leave this undefined.
   */
  primaryBase?: string;
  fallbackBase?: string;
  /**
   * Inject a custom fetch implementation. In production we use the global
   * fetch. Tests pass a vi.fn() so they can assert calls.
   */
  fetchImpl?: typeof fetch;
  /**
   * Skip the rate-limit bucket. Only for tests — production code should
   * always go through the bucket.
   */
  skipRateLimit?: boolean;
  /**
   * Skip the TTL cache. Only for tests / manual-sync flows where the user
   * just clicked "sync now" and expects a fresh hit.
   */
  skipCache?: boolean;
}

export class BlockstreamError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "rate_limited"
      | "network_error"
      | "invalid_response"
      | "not_found"
      | "both_sources_failed",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "BlockstreamError";
  }
}

// Shape of Blockstream / Mempool.space `/address/{addr}` response.
interface EsploraAddressResponse {
  address?: string;
  chain_stats?: {
    funded_txo_sum: number | string;
    spent_txo_sum: number | string;
  };
  mempool_stats?: {
    funded_txo_sum: number | string;
    spent_txo_sum: number | string;
  };
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

function parseAddressResponse(
  address: string,
  data: unknown,
  source: BtcAddressInfo["source"]
): BtcAddressInfo {
  const parsed = data as EsploraAddressResponse;
  if (!parsed || !parsed.chain_stats || !parsed.mempool_stats) {
    throw new BlockstreamError(
      `${source}: malformed address response`,
      "invalid_response"
    );
  }
  const balanceSats = computeBalanceSats({
    chain_stats: parsed.chain_stats,
    mempool_stats: parsed.mempool_stats,
  });
  return {
    address,
    balanceSats,
    balanceBtc: satsToBtcNumber(balanceSats),
    balanceBtcString: satsToBtcString(balanceSats),
    source,
    fetchedAt: new Date(),
  };
}

async function fetchFromSource(
  address: string,
  base: string,
  source: BtcAddressInfo["source"],
  fetchImpl: typeof fetch
): Promise<BtcAddressInfo> {
  const url = `${base}/address/${encodeURIComponent(address)}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, fetchImpl);
  } catch (err: unknown) {
    throw new BlockstreamError(`${source}: network error`, "network_error", err);
  }

  if (res.status === 404) {
    throw new BlockstreamError(`${source}: address not found`, "not_found");
  }
  if (res.status === 429) {
    throw new BlockstreamError(`${source}: rate limited`, "rate_limited");
  }
  if (!res.ok) {
    throw new BlockstreamError(
      `${source}: HTTP ${res.status}`,
      "network_error"
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    throw new BlockstreamError(
      `${source}: invalid JSON response`,
      "invalid_response",
      err
    );
  }

  return parseAddressResponse(address, data, source);
}

/**
 * Fetch current BTC balance for a single address. Tries Blockstream first,
 * falls back to Mempool.space on 5xx / network error / invalid response.
 *
 * The `not_found` case is explicitly NOT treated as failure: Blockstream
 * actually returns a normal response with zero stats for unused addresses.
 * A 404 only happens on brand-new testnet addresses — mainnet addresses
 * always return 200. So if we do see a 404, something is genuinely wrong
 * and we fall through to the fallback rather than silently returning 0.
 */
export async function getBtcBalance(
  address: string,
  opts: BlockstreamFetchOptions = {}
): Promise<BtcAddressInfo> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const primaryBase = opts.primaryBase ?? PRIMARY_BASE;
  const fallbackBase = opts.fallbackBase ?? FALLBACK_BASE;

  if (!opts.skipCache) {
    const cached = cache.get(address);
    if (cached) return cached;
  }

  if (!opts.skipRateLimit) {
    await bucket.waitForToken();
  }

  let primaryError: BlockstreamError | null = null;
  try {
    const result = await fetchFromSource(
      address,
      primaryBase,
      "blockstream",
      fetchImpl
    );
    cache.set(address, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    if (err instanceof BlockstreamError) {
      primaryError = err;
      if (err.code === "rate_limited") {
        bucket.reportRateLimit();
      }
      // Fall through to fallback.
    } else {
      throw err;
    }
  }

  try {
    const result = await fetchFromSource(
      address,
      fallbackBase,
      "mempool.space",
      fetchImpl
    );
    cache.set(address, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    throw new BlockstreamError(
      `Both Blockstream and Mempool.space failed for ${address}`,
      "both_sources_failed",
      { primary: primaryError, fallback: err }
    );
  }
}

/**
 * Fetch current BTC balances for many addresses. Blockstream Esplora has
 * no documented batch endpoint, so we loop with a tiny delay between each
 * request. The token bucket is the real rate limiter; the sleep is just
 * politeness.
 *
 * Returns a Map keyed by address so the caller can easily pair results
 * back with the asset row. Addresses that fail are simply absent from the
 * map — the cron job should handle that by logging + leaving
 * `lastSyncedAt` unchanged for that row.
 */
export async function getBtcBalanceBatch(
  addresses: string[],
  opts: BlockstreamFetchOptions & {
    onError?: (address: string, error: unknown) => void;
  } = {}
): Promise<Map<string, BtcAddressInfo>> {
  const results = new Map<string, BtcAddressInfo>();
  const unique = [...new Set(addresses)];

  for (let i = 0; i < unique.length; i++) {
    const address = unique[i];
    try {
      const info = await getBtcBalance(address, opts);
      results.set(address, info);
    } catch (err) {
      opts.onError?.(address, err);
      // Intentionally continue — one bad address shouldn't poison the batch.
    }

    if (i < unique.length - 1) {
      await new Promise((r) => setTimeout(r, BATCH_POLITENESS_MS));
    }
  }

  return results;
}

/**
 * Clear the in-memory TTL cache. Used by the manual-sync endpoint so that
 * clicking "Sync now" always hits upstream, even if the cron ran a few
 * seconds ago.
 */
export function clearBtcCache() {
  // TtlCache doesn't expose a clear() method, so we just replace the
  // backing map via a fresh instance. Tests reach past this by setting
  // skipCache: true on individual calls.
  (cache as unknown as { store: Map<string, unknown> }).store = new Map();
}
