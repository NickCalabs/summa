import { describe, it, expect } from "vitest";
import { parseCryptoHoldings, computeCryptoValue } from "@/lib/providers/plaid";

describe("parseCryptoHoldings", () => {
  const securities = [
    { security_id: "sec_btc", type: "cryptocurrency", ticker_symbol: "BTC", name: "Bitcoin" },
    { security_id: "sec_aapl", type: "equity", ticker_symbol: "AAPL", name: "Apple" },
  ];

  it("maps a crypto holding to its account_id and quantity", () => {
    const holdings = [
      { account_id: "acct_btc", security_id: "sec_btc", quantity: 0.24071935, institution_price: 66936.15 },
    ];
    const result = parseCryptoHoldings(holdings, securities);
    expect(result.get("acct_btc")).toEqual({
      plaidAccountId: "acct_btc",
      quantity: 0.24071935,
      institutionPrice: 66936.15,
    });
  });

  it("ignores non-cryptocurrency securities", () => {
    const holdings = [
      { account_id: "acct_eq", security_id: "sec_aapl", quantity: 10, institution_price: 200 },
    ];
    expect(parseCryptoHoldings(holdings, securities).size).toBe(0);
  });

  it("keeps the largest holding when the winner arrives second", () => {
    const holdings = [
      { account_id: "acct_btc", security_id: "sec_btc", quantity: 0.1, institution_price: 100 },
      { account_id: "acct_btc", security_id: "sec_btc", quantity: 0.24, institution_price: 200 },
    ];
    const h = parseCryptoHoldings(holdings, securities).get("acct_btc");
    expect(h?.quantity).toBe(0.24);
    expect(h?.institutionPrice).toBe(200);
  });

  it("keeps the largest holding when the winner arrives first", () => {
    const holdings = [
      { account_id: "acct_btc", security_id: "sec_btc", quantity: 0.24, institution_price: 200 },
      { account_id: "acct_btc", security_id: "sec_btc", quantity: 0.1, institution_price: 100 },
    ];
    const h = parseCryptoHoldings(holdings, securities).get("acct_btc");
    expect(h?.quantity).toBe(0.24);
    expect(h?.institutionPrice).toBe(200);
  });
});

describe("computeCryptoValue", () => {
  it("multiplies quantity by price and rounds to 2 decimals", () => {
    expect(computeCryptoValue(0.24071935, 66936.15)).toBe("16112.83");
  });
  it("returns null when price is missing", () => {
    expect(computeCryptoValue(0.24, null)).toBeNull();
  });
  it("returns null when quantity is missing", () => {
    expect(computeCryptoValue(null, 66936.15)).toBeNull();
  });
});
