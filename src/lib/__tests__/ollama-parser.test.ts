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

  it("handles a single object response from small models", () => {
    // llama3.2:3b sometimes returns a bare object instead of an array
    const input = JSON.stringify({
      account: "River Bitcoin",
      balance: 0.65,
      currency: "BTC",
      confidence: 0.9,
    });
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe("River Bitcoin");
    expect(result[0].balance).toBe(0.65);
    expect(result[0].currency).toBe("BTC");
  });

  it("handles object with 'results' wrapper key", () => {
    const input = JSON.stringify({
      results: [{ account: "Test", balance: 100, currency: "USD", confidence: 1 }],
    });
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe("Test");
  });

  it("parses balance with embedded currency (e.g. '0.65 BTC')", () => {
    const input = JSON.stringify({
      account: "Bitcoin Wallet",
      balance: "0.65 BTC",
      confidence: 0.9,
    });
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].balance).toBe(0.65);
    expect(result[0].currency).toBe("BTC");
  });

  it("parses balance with currency symbol (e.g. '$1,234.56')", () => {
    const input = JSON.stringify({
      account: "Cash",
      balance: "$1,234.56",
      currency: "USD",
      confidence: 1,
    });
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].balance).toBe(1234.56);
    expect(result[0].currency).toBe("USD");
  });

  it("returns empty array for unrelated object structure", () => {
    const input = JSON.stringify({ foo: "bar", count: 5 });
    const result = parseExtractedBalances(input);
    expect(result).toEqual([]);
  });
});
