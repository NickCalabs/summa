/**
 * Ethereum address helpers — validation, conversion, formatting, and the
 * stablecoin contract allowlist.
 *
 * Validation is intentionally pattern-only (0x prefix + 40 hex chars). Full
 * EIP-55 checksum enforcement is deliberately *not* required: Etherscan and
 * most wallets accept both all-lowercase and checksummed forms, and
 * insisting on the checksum would reject the addresses most users
 * copy/paste from plain-text sources. We do, however, accept checksummed
 * addresses and normalize everywhere for comparison.
 */

const WEI_PER_ETH = 1_000_000_000_000_000_000n; // 1e18

/**
 * Loose pattern-only validation for an Ethereum address.
 *
 * Accepts any 0x-prefixed 40-character hex string, all lowercase OR a
 * properly mixed-case EIP-55 checksummed variant. We do *not* verify the
 * checksum here — the upstream Etherscan API is the source of truth. This
 * is just a cheap pre-filter so we don't spam the provider with garbage.
 */
export function isValidEthAddress(address: unknown): address is string {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  // 0x + exactly 40 hex chars. Case-insensitive to allow checksummed
  // addresses; we reject only clearly-wrong shapes.
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed);
}

/**
 * Normalize an ETH address to lowercase for storage and comparison. We
 * store lowercase in `providerConfig.address` so that equality checks
 * (cron picking up this row, dedup across wallets) are trivial.
 */
export function normalizeEthAddress(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Convert a BigInt wei balance to a decimal ETH string with fixed 18
 * decimal places. Uses string math so we never lose precision on
 * high-balance wallets (Number.MAX_SAFE_INTEGER is ~9.007 ETH worth of
 * wei, so anything past ~9 ETH would corrupt if we used Number).
 *
 * The Drizzle `quantity` column is `numeric(20,8)` — only 8 fractional
 * digits. We truncate (don't round) to 8 digits when storing, which is
 * still more precision than any realistic retail wallet cares about.
 */
export function weiToEthString(wei: bigint, decimals: number = 18): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const fraction = abs % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fractionStr}`;
}

/**
 * Convert a BigInt wei balance to a plain JS number of ETH. Use ONLY for
 * UI math (chart values, display formatting). Never for DB writes or
 * anywhere that leaks into snapshots.
 */
export function weiToEthNumber(wei: bigint, decimals: number = 18): number {
  // Go via the string form to avoid Number precision loss on huge balances.
  return Number(weiToEthString(wei, decimals));
}

/**
 * Truncate an ETH-decimal string to the Drizzle `numeric(20,8)` scale. We
 * truncate rather than round so we never *inflate* a balance by fractional
 * rounding — users would notice "I have 0.99999999 ETH but Summa shows
 * 1.00000000". Truncating errs on the side of slight undercount.
 */
export function truncateEthQuantity(decimalStr: string): string {
  const [whole, fraction = ""] = decimalStr.split(".");
  const truncated = fraction.slice(0, 8).padEnd(8, "0");
  return `${whole}.${truncated}`;
}

/**
 * Compute USD currentValue from an ETH balance and an ETH/USD spot price.
 *
 * Returns a fixed-2-decimal string suitable for the `current_value`
 * numeric column. If the price is missing/invalid, returns null and the
 * caller should skip the price/value update but still refresh the quantity
 * and timestamp — same contract as `computeCurrentValueUsd` in btc.ts.
 */
export function computeEthValueUsd(
  weiBalance: bigint,
  ethUsdPrice: number | null
): string | null {
  if (ethUsdPrice == null || !Number.isFinite(ethUsdPrice) || ethUsdPrice <= 0) {
    return null;
  }
  const eth = weiToEthNumber(weiBalance);
  return (eth * ethUsdPrice).toFixed(2);
}

/**
 * Redact an ETH address for display — keep the first 6 and last 4 chars,
 * middle replaced with an ellipsis. Matches the BTC redaction style so
 * the detail panel feels consistent across chains.
 */
export function redactEthAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Build a default asset name from an ETH address: "ETH Wallet (…abcd)".
 */
export function defaultEthWalletName(address: string): string {
  const tail = address.slice(-4);
  return `ETH Wallet (…${tail})`;
}

/**
 * Mainnet stablecoin contract addresses. When a token's contract appears
 * in this set, we mark the holding as a stablecoin so the detail panel
 * can show a badge (and future work can treat it as cash-equivalent for
 * allocation charts).
 *
 * All addresses are lowercase for case-insensitive comparison. DO NOT add
 * non-mainnet (L2 or testnet) contracts to this set — they have different
 * deployment addresses.
 */
export const STABLECOIN_ADDRESSES = new Set<string>([
  // USDC — Circle
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  // USDT — Tether
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
  // DAI — MakerDAO
  "0x6b175474e89094c44da98b954eedeac495271d0f",
  // FRAX — Frax Finance
  "0x853d955acef822db058eb8505911ed77f175b99e",
  // LUSD — Liquity
  "0x5f98805a4e8be255a32880fdec7f6728c6568ba0",
  // TUSD — TrueUSD
  "0x0000000000085d4780b73119b644ae5ecd22b376",
  // GUSD — Gemini Dollar
  "0x056fd409e1d7a124bd7017459dfea2f387b6d5cd",
  // USDP — Paxos
  "0x8e870d67f660d95d5be530380d0ec0bd388289e1",
]);

/**
 * Is this contract a known stablecoin? Accepts either lowercase or
 * checksummed addresses (we normalize on lookup).
 */
export function isStablecoinContract(contractAddress: string): boolean {
  return STABLECOIN_ADDRESSES.has(contractAddress.trim().toLowerCase());
}

/**
 * Compute ERC-20 token balance string from raw on-chain bigint value and
 * the token's decimals. Different tokens use different decimal
 * precisions: USDC/USDT use 6, most others use 18. We truncate to 8
 * fractional digits for DB storage regardless, but we *display* the full
 * precision in the detail panel.
 */
export function rawToTokenBalance(rawBalance: bigint, decimals: number): string {
  return weiToEthString(rawBalance, decimals);
}

export const ETH_CONSTANTS = {
  WEI_PER_ETH,
} as const;
