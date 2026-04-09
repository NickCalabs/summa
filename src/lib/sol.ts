/**
 * Solana address helpers — validation, conversion, formatting, and the
 * SPL stablecoin mint allowlist.
 *
 * Validation checks base58 charset and length (32-44 characters). We do
 * NOT attempt full Ed25519 public-key validation — the Helius RPC is the
 * source of truth. This is a cheap pre-filter so we don't spam the
 * provider with garbage.
 */

const LAMPORTS_PER_SOL = 1_000_000_000n; // 1e9

/**
 * Base58 character set used by Solana addresses (Bitcoin alphabet — no 0,
 * O, I, l).
 */
const BASE58_CHARS =
  /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;

/**
 * Loose validation for a Solana address.
 *
 * Accepts any 32-44 character string composed entirely of base58
 * characters. Real Solana addresses are 32-byte Ed25519 pubkeys encoded
 * as base58, which yields 32-44 characters.
 */
export function isValidSolAddress(address: unknown): address is string {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return false;
  return BASE58_CHARS.test(trimmed);
}

/**
 * Normalize a SOL address for storage. Solana addresses are
 * case-sensitive (base58), so we just trim whitespace — no lowercasing.
 */
export function normalizeSolAddress(address: string): string {
  return address.trim();
}

/**
 * Convert a BigInt lamport balance to a decimal SOL string with fixed 9
 * decimal places. Uses string math to avoid precision loss.
 *
 * The Drizzle `quantity` column is `numeric(20,8)` — only 8 fractional
 * digits. We truncate (don't round) to 8 digits when storing.
 */
export function lamportsToSolString(lamports: bigint): string {
  const negative = lamports < 0n;
  const abs = negative ? -lamports : lamports;
  const whole = abs / LAMPORTS_PER_SOL;
  const fraction = abs % LAMPORTS_PER_SOL;
  const fractionStr = fraction.toString().padStart(9, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fractionStr}`;
}

/**
 * Convert lamports to a plain JS number. Use ONLY for UI math / display
 * formatting. Never for DB writes.
 */
export function lamportsToSolNumber(lamports: bigint): number {
  return Number(lamportsToSolString(lamports));
}

/**
 * Truncate a SOL-decimal string to `numeric(20,8)` scale. Truncate
 * rather than round to avoid inflating balances.
 */
export function truncateSolQuantity(decimalStr: string): string {
  const [whole, fraction = ""] = decimalStr.split(".");
  const truncated = fraction.slice(0, 8).padEnd(8, "0");
  return `${whole}.${truncated}`;
}

/**
 * Compute USD value from a lamport balance and a SOL/USD spot price.
 * Returns a fixed-2-decimal string suitable for the `current_value`
 * column. Returns null if the price is missing/invalid.
 */
export function computeSolValueUsd(
  lamports: bigint,
  solUsdPrice: number | null
): string | null {
  if (solUsdPrice == null || !Number.isFinite(solUsdPrice) || solUsdPrice <= 0) {
    return null;
  }
  const sol = lamportsToSolNumber(lamports);
  return (sol * solUsdPrice).toFixed(2);
}

/**
 * Redact a SOL address for display — keep the first 4 and last 4 chars.
 */
export function redactSolAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Build a default asset name from a SOL address: "SOL Wallet (…abcd)".
 */
export function defaultSolWalletName(address: string): string {
  const tail = address.slice(-4);
  return `SOL Wallet (…${tail})`;
}

/**
 * Known SPL stablecoin mint addresses on Solana mainnet. When a token's
 * mint appears in this set, we mark it as a stablecoin.
 *
 * Solana addresses are case-sensitive (base58), so we store them
 * verbatim — no lowercasing.
 */
export const STABLECOIN_MINTS = new Set<string>([
  // USDC — Circle (native SPL)
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  // USDT — Tether (native SPL)
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  // USDC.eth — Wormhole bridged
  "A9mUU4qviSctJVPJdBJWkb28deg915LYJKrzQ19ji3FM",
]);

/**
 * Is this mint a known stablecoin?
 */
export function isStablecoinMint(mint: string): boolean {
  return STABLECOIN_MINTS.has(mint.trim());
}

export const SOL_CONSTANTS = {
  LAMPORTS_PER_SOL,
} as const;
