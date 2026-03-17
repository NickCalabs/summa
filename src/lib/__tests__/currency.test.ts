import { describe, it, expect } from "vitest";
import { convertToBase, convertCurrency } from "@/lib/currency";

// Rates: 1 USD = 0.92 EUR, 1 USD = 0.79 GBP
const rates: Record<string, number> = { EUR: 0.92, GBP: 0.79 };

describe("convertToBase", () => {
  it("converts foreign → base (divide)", () => {
    expect(convertToBase(500, "EUR", "USD", rates)).toBeCloseTo(543.48, 2);
    expect(convertToBase(100, "GBP", "USD", rates)).toBeCloseTo(126.58, 2);
  });

  it("returns amount unchanged when same currency", () => {
    expect(convertToBase(500, "USD", "USD", rates)).toBe(500);
  });

  it("returns amount unchanged for unknown currency (graceful fallback)", () => {
    expect(convertToBase(500, "JPY", "USD", rates)).toBe(500);
  });
});

describe("convertCurrency", () => {
  it("converts base → foreign (multiply)", () => {
    expect(convertCurrency(100, "USD", "EUR", rates, "USD")).toBeCloseTo(92, 2);
  });

  it("converts foreign → base (divide)", () => {
    expect(convertCurrency(500, "EUR", "USD", rates, "USD")).toBeCloseTo(543.48, 2);
  });

  it("converts cross-rate foreign → foreign", () => {
    // 500 EUR → USD → GBP = (500 / 0.92) * 0.79 = 429.35
    expect(convertCurrency(500, "EUR", "GBP", rates, "USD")).toBeCloseTo(429.35, 2);
  });

  it("returns amount unchanged when from === to", () => {
    expect(convertCurrency(100, "EUR", "EUR", rates, "USD")).toBe(100);
  });
});
