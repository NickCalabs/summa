import { describe, it, expect } from "vitest";
import { computePlaidTakeover, isCryptoTakeover } from "@/lib/plaid-relink";

const cryptoAccount = {
  connectionId: "conn1",
  plaidAccountId: "acct_btc",
  type: "investment",
  currentBalance: "16112.83",
};
const cashAccount = {
  connectionId: "conn1",
  plaidAccountId: "acct_usd",
  type: "depository",
  currentBalance: "1730.41",
};

describe("isCryptoTakeover", () => {
  it("is true only for investment account + crypto asset", () => {
    expect(isCryptoTakeover("investment", "crypto")).toBe(true);
    expect(isCryptoTakeover("depository", "crypto")).toBe(false);
    expect(isCryptoTakeover("investment", "cash")).toBe(false);
  });
});

describe("computePlaidTakeover — crypto", () => {
  const targetCrypto = {
    type: "crypto",
    currentPrice: "66936.15",
    quantity: "0.23788197",
    providerConfig: { source: "coingecko", ticker: "bitcoin", exchange: "crypto" },
  };

  it("sets quantity from the holding and merges providerConfig (keeps source/ticker)", () => {
    const patch = computePlaidTakeover(cryptoAccount, targetCrypto, 0.24071935);
    expect(patch.providerType).toBe("plaid");
    expect(patch.providerConfig).toEqual({
      source: "coingecko",
      ticker: "bitcoin",
      exchange: "crypto",
      connectionId: "conn1",
      plaidAccountId: "acct_btc",
    });
    expect(patch.quantity).toBe("0.24071935");
    expect(patch.currentValue).toBe("16112.83");
  });

  it("does NOT overwrite quantity when the holding is missing", () => {
    const patch = computePlaidTakeover(cryptoAccount, targetCrypto, null);
    expect(patch.quantity).toBeUndefined();
    expect(patch.currentValue).toBeUndefined();
    expect(patch.providerType).toBe("plaid");
  });
});

describe("computePlaidTakeover — cash", () => {
  it("sets USD currentValue from the balance and a clean providerConfig", () => {
    const patch = computePlaidTakeover(cashAccount, { type: "cash", currentPrice: null, quantity: null, providerConfig: {} }, null);
    expect(patch.providerType).toBe("plaid");
    expect(patch.providerConfig).toEqual({ connectionId: "conn1", plaidAccountId: "acct_usd" });
    expect(patch.currentValue).toBe("1730.41");
    expect(patch.quantity).toBeUndefined();
  });
});
