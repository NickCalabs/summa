import { describe, it, expect } from "vitest";
import { parseExtractedBalances } from "@/lib/ai/ollama";

describe("parseExtractedBalances", () => {
  it("parses a clean JSON array", () => {
    const input = JSON.stringify([
      { account: "Bitcoin", balance: 0.65, currency: "BTC", confidence: 0.95 },
      { account: "Cash", balance: 1234.56, currency: "USD", confidence: 1.0 },
    ]);
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(2);
    expect(result[0].account).toBe("Bitcoin");
    expect(result[0].balance).toBe(0.65);
    expect(result[0].currency).toBe("BTC");
    expect(result[1].account).toBe("Cash");
    expect(result[1].balance).toBe(1234.56);
  });

  it("handles JSON wrapped in an object with 'balances' key", () => {
    const input = JSON.stringify({
      balances: [
        { account: "Savings", balance: 5000, currency: "USD", confidence: 0.9 },
      ],
    });
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe("Savings");
  });

  it("handles object with 'accounts' key", () => {
    const input = JSON.stringify({
      accounts: [
        { account: "BTC Wallet", balance: 1.5, currency: "BTC", confidence: 1 },
      ],
    });
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe("BTC Wallet");
  });

  it("handles object with 'data' key", () => {
    const input = JSON.stringify({
      data: [
        { account: "Checking", balance: 500, currency: "USD", confidence: 0.8 },
      ],
    });
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
  });

  it("strips Qwen thinking tags before parsing", () => {
    const input = `<think>Let me analyze this document...</think>${JSON.stringify([
      { account: "Test", balance: 100, currency: "USD", confidence: 1 },
    ])}`;
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe("Test");
  });

  it("defaults missing fields gracefully", () => {
    const input = JSON.stringify([{ name: "Account", amount: 42 }]);
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe("Account");
    expect(result[0].balance).toBe(42);
    expect(result[0].currency).toBe("USD");
    expect(result[0].confidence).toBe(0.5);
  });

  it("returns empty array for empty JSON array", () => {
    const result = parseExtractedBalances("[]");
    expect(result).toEqual([]);
  });

  it("throws on unparseable content", () => {
    expect(() => parseExtractedBalances("not json at all")).toThrow();
  });
});
