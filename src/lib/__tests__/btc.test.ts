import { describe, it, expect } from "vitest";
import {
  isValidBtcAddress,
  computeBalanceSats,
  satsToBtcString,
  satsToBtcNumber,
  computeCurrentValueUsd,
  redactBtcAddress,
  defaultBtcWalletName,
} from "@/lib/btc";

describe("isValidBtcAddress", () => {
  it("accepts bech32 (segwit) addresses", () => {
    // Satoshi's pizza address (canonical example)
    expect(isValidBtcAddress("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")).toBe(true);
    // Longer taproot-style bech32m
    expect(
      isValidBtcAddress(
        "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr"
      )
    ).toBe(true);
  });

  it("accepts legacy P2PKH (1...) addresses", () => {
    expect(isValidBtcAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe(true);
  });

  it("accepts P2SH (3...) addresses", () => {
    expect(isValidBtcAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe(true);
  });

  it("rejects empty / non-strings", () => {
    expect(isValidBtcAddress("")).toBe(false);
    expect(isValidBtcAddress("   ")).toBe(false);
    expect(isValidBtcAddress(null)).toBe(false);
    expect(isValidBtcAddress(undefined)).toBe(false);
    expect(isValidBtcAddress(42)).toBe(false);
  });

  it("rejects mixed-case bech32 (BIP-173)", () => {
    expect(isValidBtcAddress("BC1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")).toBe(false);
    expect(isValidBtcAddress("bc1QXY2KGDYGJRSQTZQ2N0YRF2493P83KKFJHX0WLH")).toBe(false);
  });

  it("rejects testnet (tb1, bcrt1) addresses — mainnet-only for v0.2", () => {
    expect(isValidBtcAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx")).toBe(false);
    expect(
      isValidBtcAddress("bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7k9sw5l4")
    ).toBe(false);
  });

  it("rejects ethereum addresses", () => {
    expect(isValidBtcAddress("0x742d35Cc6635C0532925a3b844Bc454e4438f44e")).toBe(false);
  });

  it("rejects obvious garbage", () => {
    expect(isValidBtcAddress("not-an-address")).toBe(false);
    expect(isValidBtcAddress("1")).toBe(false);
    expect(isValidBtcAddress("bc1")).toBe(false);
  });
});

describe("computeBalanceSats", () => {
  it("computes confirmed + mempool balance for a funded address", () => {
    // From a real Blockstream response: 50000 funded, 0 spent, no mempool
    const stats = {
      chain_stats: { funded_txo_sum: 50_000, spent_txo_sum: 0 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
    };
    expect(computeBalanceSats(stats)).toBe(50_000n);
  });

  it("subtracts spent UTXOs", () => {
    const stats = {
      chain_stats: { funded_txo_sum: 100_000, spent_txo_sum: 30_000 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
    };
    expect(computeBalanceSats(stats)).toBe(70_000n);
  });

  it("includes mempool deltas (pending send)", () => {
    // 100k confirmed, pending send of 10k
    const stats = {
      chain_stats: { funded_txo_sum: 100_000, spent_txo_sum: 0 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 10_000 },
    };
    expect(computeBalanceSats(stats)).toBe(90_000n);
  });

  it("handles string-encoded sat counts (some APIs return strings)", () => {
    const stats = {
      chain_stats: { funded_txo_sum: "50000", spent_txo_sum: "0" },
      mempool_stats: { funded_txo_sum: "0", spent_txo_sum: "0" },
    };
    expect(computeBalanceSats(stats)).toBe(50_000n);
  });

  it("handles huge sats without precision loss (beyond 2^53)", () => {
    // ~100 million BTC in sats, well beyond Number.MAX_SAFE_INTEGER
    const huge = "10000000000000000"; // 10^16 sats = 10^8 BTC
    const stats = {
      chain_stats: { funded_txo_sum: huge, spent_txo_sum: "0" },
      mempool_stats: { funded_txo_sum: "0", spent_txo_sum: "0" },
    };
    expect(computeBalanceSats(stats)).toBe(10_000_000_000_000_000n);
  });

  it("returns zero for an empty address", () => {
    const stats = {
      chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
    };
    expect(computeBalanceSats(stats)).toBe(0n);
  });
});

describe("satsToBtcString", () => {
  it("converts 1 BTC (100M sats) → '1.00000000'", () => {
    expect(satsToBtcString(100_000_000n)).toBe("1.00000000");
  });

  it("converts 0 sats → '0.00000000'", () => {
    expect(satsToBtcString(0n)).toBe("0.00000000");
  });

  it("converts 1 sat → '0.00000001'", () => {
    expect(satsToBtcString(1n)).toBe("0.00000001");
  });

  it("converts 50000 sats → '0.00050000'", () => {
    expect(satsToBtcString(50_000n)).toBe("0.00050000");
  });

  it("converts fractional BTC precisely", () => {
    // 1.23456789 BTC = 123_456_789 sats
    expect(satsToBtcString(123_456_789n)).toBe("1.23456789");
  });

  it("handles 21 million BTC cap without precision loss", () => {
    const cap = 21_000_000n * 100_000_000n;
    expect(satsToBtcString(cap)).toBe("21000000.00000000");
  });
});

describe("satsToBtcNumber", () => {
  it("round-trips common values", () => {
    expect(satsToBtcNumber(100_000_000n)).toBe(1);
    expect(satsToBtcNumber(50_000_000n)).toBe(0.5);
    expect(satsToBtcNumber(0n)).toBe(0);
  });
});

describe("computeCurrentValueUsd", () => {
  it("computes value = quantity * price", () => {
    // 0.5 BTC at $60,000 = $30,000.00
    expect(computeCurrentValueUsd(50_000_000n, 60_000)).toBe("30000.00");
  });

  it("rounds to 2 decimals", () => {
    // 0.12345678 BTC at $65,000 = $8024.69 (approximately)
    const result = computeCurrentValueUsd(12_345_678n, 65_000);
    expect(result).toMatch(/^\d+\.\d{2}$/);
    expect(Number(result)).toBeCloseTo(8024.69, 1);
  });

  it("returns '0.00' for empty wallet", () => {
    expect(computeCurrentValueUsd(0n, 65_000)).toBe("0.00");
  });

  it("returns null when price is missing", () => {
    expect(computeCurrentValueUsd(50_000_000n, null)).toBeNull();
  });

  it("returns null when price is invalid", () => {
    expect(computeCurrentValueUsd(50_000_000n, 0)).toBeNull();
    expect(computeCurrentValueUsd(50_000_000n, -1)).toBeNull();
    expect(computeCurrentValueUsd(50_000_000n, NaN)).toBeNull();
  });
});

describe("redactBtcAddress", () => {
  it("keeps first 6 and last 4 chars", () => {
    expect(redactBtcAddress("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")).toBe(
      "bc1qxy…0wlh"
    );
  });

  it("returns short addresses unchanged", () => {
    expect(redactBtcAddress("1A1zP1eP")).toBe("1A1zP1eP");
  });
});

describe("defaultBtcWalletName", () => {
  it("builds 'BTC Wallet (…last4)' format", () => {
    expect(
      defaultBtcWalletName("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
    ).toBe("BTC Wallet (…0wlh)");
  });
});
