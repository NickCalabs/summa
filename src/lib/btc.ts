/**
 * Bitcoin address helpers — validation, conversion, formatting.
 *
 * Validation is intentionally pattern-only (regex + length), not full
 * base58/bech32 checksum verification. The upstream Blockstream API is the
 * source of truth: if we pass it garbage we treat the 400 as invalid.
 * Pattern validation is just a cheap pre-filter at our API boundary so we
 * don't spam upstream with obvious typos.
 */

const SATS_PER_BTC = 100_000_000;

/**
 * Loose pattern-only validation for a Bitcoin address.
 *
 * Accepts:
 * - P2PKH (legacy): base58, starts with `1`, 25–34 chars
 * - P2SH: base58, starts with `3`, 25–34 chars
 * - Bech32 (segwit): starts with `bc1`, all lowercase, 11–90 chars
 * - Bech32m (taproot): same prefix as segwit in practice, same rule
 *
 * Mixed-case bech32 is explicitly invalid per BIP-173.
 */
export function isValidBtcAddress(address: unknown): address is string {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length === 0) return false;

  // Bech32 / bech32m (segwit and taproot). All lowercase required.
  // Testnet/regtest prefixes (tb1, bcrt1) are intentionally rejected.
  if (/^bc1[02-9ac-hj-np-z]{6,87}$/.test(trimmed)) return true;

  // Legacy base58 (P2PKH `1...`, P2SH `3...`). Exclude 0, O, I, l.
  if (/^[13][1-9A-HJ-NP-Za-km-z]{25,39}$/.test(trimmed)) return true;

  return false;
}

/**
 * Compute confirmed BTC balance from a Blockstream-style address stats object.
 *
 * `chain_stats` represents on-chain (confirmed) UTXOs. `mempool_stats`
 * represents unconfirmed ones. Summa policy: include the mempool delta so
 * the user sees their wallet move the moment they send/receive. This
 * matches what most block explorers show as "balance" by default.
 *
 * Uses BigInt because sat counts on busy addresses can exceed 2^53.
 */
export function computeBalanceSats(stats: {
  chain_stats: { funded_txo_sum: number | string; spent_txo_sum: number | string };
  mempool_stats: { funded_txo_sum: number | string; spent_txo_sum: number | string };
}): bigint {
  const chainFunded = BigInt(stats.chain_stats.funded_txo_sum);
  const chainSpent = BigInt(stats.chain_stats.spent_txo_sum);
  const mempoolFunded = BigInt(stats.mempool_stats.funded_txo_sum);
  const mempoolSpent = BigInt(stats.mempool_stats.spent_txo_sum);
  return chainFunded - chainSpent + mempoolFunded - mempoolSpent;
}

/**
 * Convert a BigInt satoshi balance to a decimal BTC string with fixed 8
 * decimal places (the Drizzle `numeric(20,8)` precision for `quantity`).
 *
 * We deliberately go through strings instead of Number: a 1e15-sat balance
 * (~10M BTC) loses precision in a JS Number.
 */
export function satsToBtcString(sats: bigint): string {
  const negative = sats < 0n;
  const abs = negative ? -sats : sats;
  const divisor = BigInt(SATS_PER_BTC);
  const whole = abs / divisor;
  const fraction = abs % divisor;
  const fractionStr = fraction.toString().padStart(8, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fractionStr}`;
}

/**
 * Convert a satoshi balance to a plain JS number BTC. Use this ONLY for UI
 * display math (sparkline values, chart rendering). For anything that
 * hits the DB, prefer `satsToBtcString`.
 */
export function satsToBtcNumber(sats: bigint): number {
  return Number(sats) / SATS_PER_BTC;
}

/**
 * Compute USD currentValue from a satoshi balance and a BTC/USD spot price.
 *
 * The result is a fixed-2-decimal string suitable for the `current_value`
 * numeric column. If the price is missing/invalid (e.g. CoinGecko flaked
 * during this cron tick), returns null and the caller should skip the
 * price/value update but still refresh the quantity and timestamp.
 */
export function computeCurrentValueUsd(
  sats: bigint,
  btcUsdPrice: number | null
): string | null {
  if (btcUsdPrice == null || !Number.isFinite(btcUsdPrice) || btcUsdPrice <= 0) {
    return null;
  }
  const btc = satsToBtcNumber(sats);
  return (btc * btcUsdPrice).toFixed(2);
}

/**
 * Redact a BTC address for display — keep the first 6 and last 4 chars,
 * middle replaced with an ellipsis. Used by the detail panel so users can
 * visually verify the right wallet without leaking the whole string to
 * screenshots / on-screen observers.
 */
export function redactBtcAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Build a default asset name from a BTC address: "BTC Wallet (…wlh)".
 * Used when the user doesn't provide a custom name in the add-wallet form.
 */
export function defaultBtcWalletName(address: string): string {
  const tail = address.slice(-4);
  return `BTC Wallet (…${tail})`;
}

export const BTC_CONSTANTS = {
  SATS_PER_BTC,
} as const;
