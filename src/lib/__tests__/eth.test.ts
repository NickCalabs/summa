import { describe, it, expect } from "vitest";
import {
  isValidEthAddress,
  normalizeEthAddress,
  weiToEthString,
  weiToEthNumber,
  truncateEthQuantity,
  computeEthValueUsd,
  redactEthAddress,
  defaultEthWalletName,
  isStablecoinContract,
  rawToTokenBalance,
} from "@/lib/eth";

describe("isValidEthAddress", () => {
  it("accepts lowercase 0x-prefixed 40-hex addresses", () => {
    expect(isValidEthAddress("0x742d35cc6634c0532925a3b844bc454e4438f44e")).toBe(true);
  });

  it("accepts checksummed (mixed-case) addresses", () => {
    // Vitalik's well-known address (EIP-55 checksum)
    expect(isValidEthAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
  });

  it("accepts all-uppercase hex (some old wallets do this)", () => {
    expect(isValidEthAddress("0x742D35CC6634C0532925A3B844BC454E4438F44E")).toBe(true);
  });

  it("rejects empty / non-strings", () => {
    expect(isValidEthAddress("")).toBe(false);
    expect(isValidEthAddress("  ")).toBe(false);
    expect(isValidEthAddress(null)).toBe(false);
    expect(isValidEthAddress(undefined)).toBe(false);
    expect(isValidEthAddress(42)).toBe(false);
  });

  it("rejects addresses without 0x prefix", () => {
    expect(isValidEthAddress("742d35cc6634c0532925a3b844bc454e4438f44e")).toBe(false);
  });

  it("rejects addresses with wrong length", () => {
    expect(isValidEthAddress("0x742d35cc")).toBe(false);
    expect(isValidEthAddress("0x742d35cc6634c0532925a3b844bc454e4438f44e00")).toBe(false);
  });

  it("rejects Bitcoin addresses", () => {
    expect(isValidEthAddress("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")).toBe(false);
    expect(isValidEthAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe(false);
  });

  it("rejects addresses with non-hex characters", () => {
    expect(isValidEthAddress("0xGGGd35cc6634c0532925a3b844bc454e4438f44e")).toBe(false);
  });
});

describe("normalizeEthAddress", () => {
  it("lowercases and trims", () => {
    expect(normalizeEthAddress("  0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045  "))
      .toBe("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
  });
});

describe("weiToEthString", () => {
  it("converts 1 ETH (1e18 wei) → correct decimal", () => {
    expect(weiToEthString(1_000_000_000_000_000_000n)).toBe(
      "1.000000000000000000"
    );
  });

  it("converts 0 wei → all zeros", () => {
    expect(weiToEthString(0n)).toBe("0.000000000000000000");
  });

  it("converts 1 wei → smallest fractional", () => {
    expect(weiToEthString(1n)).toBe("0.000000000000000001");
  });

  it("converts 1.5 ETH", () => {
    expect(weiToEthString(1_500_000_000_000_000_000n)).toBe(
      "1.500000000000000000"
    );
  });

  it("handles USDC 6-decimal tokens", () => {
    // 1500 USDC = 1500 * 10^6 raw
    expect(weiToEthString(1_500_000_000n, 6)).toBe("1500.000000");
  });

  it("handles huge balances without precision loss", () => {
    const huge = 100_000_000_000_000_000_000_000n; // 100,000 ETH
    const result = weiToEthString(huge);
    expect(result).toBe("100000.000000000000000000");
  });
});

describe("weiToEthNumber", () => {
  it("round-trips common values", () => {
    expect(weiToEthNumber(1_000_000_000_000_000_000n)).toBe(1);
    expect(weiToEthNumber(500_000_000_000_000_000n)).toBe(0.5);
    expect(weiToEthNumber(0n)).toBe(0);
  });
});

describe("truncateEthQuantity", () => {
  it("truncates to 8 decimal places", () => {
    expect(truncateEthQuantity("1.123456789012345678")).toBe("1.12345678");
  });

  it("pads short fractions", () => {
    expect(truncateEthQuantity("1.5")).toBe("1.50000000");
  });

  it("handles whole numbers", () => {
    expect(truncateEthQuantity("100")).toBe("100.00000000");
  });
});

describe("computeEthValueUsd", () => {
  it("computes value = quantity * price", () => {
    // 1 ETH at $3,000 = $3,000.00
    expect(computeEthValueUsd(1_000_000_000_000_000_000n, 3000)).toBe("3000.00");
  });

  it("rounds to 2 decimals", () => {
    // 0.5 ETH at $3,450.50
    const result = computeEthValueUsd(500_000_000_000_000_000n, 3450.5);
    expect(result).toBe("1725.25");
  });

  it("returns '0.00' for empty wallet", () => {
    expect(computeEthValueUsd(0n, 3000)).toBe("0.00");
  });

  it("returns null when price is missing", () => {
    expect(computeEthValueUsd(1_000_000_000_000_000_000n, null)).toBeNull();
  });

  it("returns null when price is invalid", () => {
    expect(computeEthValueUsd(1_000_000_000_000_000_000n, 0)).toBeNull();
    expect(computeEthValueUsd(1_000_000_000_000_000_000n, -1)).toBeNull();
    expect(computeEthValueUsd(1_000_000_000_000_000_000n, NaN)).toBeNull();
  });
});

describe("redactEthAddress", () => {
  it("keeps first 6 and last 4 chars", () => {
    expect(
      redactEthAddress("0x742d35cc6634c0532925a3b844bc454e4438f44e")
    ).toBe("0x742d…f44e");
  });

  it("returns short strings unchanged", () => {
    expect(redactEthAddress("0x742d35")).toBe("0x742d35");
  });
});

describe("defaultEthWalletName", () => {
  it("builds 'ETH Wallet (…last4)' format", () => {
    expect(
      defaultEthWalletName("0x742d35cc6634c0532925a3b844bc454e4438f44e")
    ).toBe("ETH Wallet (…f44e)");
  });
});

describe("isStablecoinContract", () => {
  it("detects USDC", () => {
    expect(
      isStablecoinContract("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")
    ).toBe(true);
  });

  it("detects USDT", () => {
    expect(
      isStablecoinContract("0xdAC17F958D2ee523a2206206994597C13D831ec7")
    ).toBe(true);
  });

  it("detects DAI", () => {
    expect(
      isStablecoinContract("0x6B175474E89094C44Da98b954EedeAC495271d0F")
    ).toBe(true);
  });

  it("rejects non-stablecoins", () => {
    expect(
      isStablecoinContract("0x1f9840a85d5af5bf1d1762f925bdaddc4201f984") // UNI
    ).toBe(false);
  });

  it("handles case insensitivity", () => {
    // Checksummed USDC address
    expect(
      isStablecoinContract("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")
    ).toBe(true);
  });
});

describe("rawToTokenBalance", () => {
  it("converts raw USDC (6 decimals)", () => {
    // 1500 USDC = 1500 * 10^6
    expect(rawToTokenBalance(1_500_000_000n, 6)).toBe("1500.000000");
  });

  it("converts raw ETH-like token (18 decimals)", () => {
    expect(rawToTokenBalance(1_000_000_000_000_000_000n, 18)).toBe(
      "1.000000000000000000"
    );
  });

  it("converts zero balance", () => {
    expect(rawToTokenBalance(0n, 18)).toBe("0.000000000000000000");
  });
});
