import { describe, it, expect } from "vitest";
import { computeSeverity } from "@/lib/ai/anomaly";

describe("computeSeverity", () => {
  const base = { assetCurrency: "USD", extractedCurrency: "USD" };

  it("returns ok for small changes", () => {
    const r = computeSeverity({ ...base, currentNum: 1000, newNum: 1100 });
    expect(r.severity).toBe("ok");
    expect(r.warnings).toEqual([]);
  });

  it("returns ok for exact same value", () => {
    const r = computeSeverity({ ...base, currentNum: 500, newNum: 500 });
    expect(r.severity).toBe("ok");
    expect(r.warnings).toEqual([]);
  });

  it("flags warning on >50% change", () => {
    const r = computeSeverity({ ...base, currentNum: 1000, newNum: 1600 });
    expect(r.severity).toBe("warning");
    expect(r.warnings[0]).toMatch(/\+60% change/);
  });

  it("flags warning on -60% change", () => {
    const r = computeSeverity({ ...base, currentNum: 1000, newNum: 400 });
    expect(r.severity).toBe("warning");
    expect(r.warnings[0]).toMatch(/-60% change/);
  });

  it("flags warning on 5x increase", () => {
    const r = computeSeverity({ ...base, currentNum: 100, newNum: 500 });
    expect(r.severity).toBe("warning");
    expect(r.warnings[0]).toMatch(/5\.0x larger/);
  });

  it("flags warning on 5x decrease", () => {
    const r = computeSeverity({ ...base, currentNum: 500, newNum: 100 });
    expect(r.severity).toBe("warning");
    expect(r.warnings[0]).toMatch(/5\.0x smaller/);
  });

  it("flags warning (not danger) on 100x increase — legit case for paychecks/wires", () => {
    const r = computeSeverity({ ...base, currentNum: 100, newNum: 10000 });
    expect(r.severity).toBe("warning");
    expect(r.warnings[0]).toMatch(/100\.0x larger/);
  });

  it("flags warning (not danger) on 100x decrease", () => {
    const r = computeSeverity({ ...base, currentNum: 10000, newNum: 100 });
    expect(r.severity).toBe("warning");
    expect(r.warnings[0]).toMatch(/100\.0x smaller/);
  });

  it("flags danger on 1000x increase (decimal error)", () => {
    const r = computeSeverity({ ...base, currentNum: 100, newNum: 100000 });
    expect(r.severity).toBe("danger");
    expect(r.warnings[0]).toMatch(/decimal error/);
  });

  it("flags danger on 1000x decrease (decimal error)", () => {
    const r = computeSeverity({ ...base, currentNum: 100000, newNum: 100 });
    expect(r.severity).toBe("danger");
    expect(r.warnings[0]).toMatch(/decimal error/);
  });

  it("flags warning when account empties to zero (legit cold-storage move)", () => {
    const r = computeSeverity({ ...base, currentNum: 5000, newNum: 0 });
    expect(r.severity).toBe("warning");
    expect(r.warnings).toContain("Account emptied to zero");
  });

  it("flags warning when account funded from zero", () => {
    const r = computeSeverity({ ...base, currentNum: 0, newNum: 5000 });
    expect(r.severity).toBe("warning");
    expect(r.warnings).toContain("Account funded from zero");
  });

  it("flags danger on sign flip", () => {
    const r = computeSeverity({ ...base, currentNum: 1000, newNum: -1000 });
    expect(r.severity).toBe("danger");
    expect(r.warnings).toContain("Value sign flipped");
  });

  it("flags danger on currency mismatch", () => {
    const r = computeSeverity({
      assetCurrency: "USD",
      extractedCurrency: "BTC",
      currentNum: 1000,
      newNum: 0.65,
    });
    expect(r.severity).toBe("danger");
    expect(r.warnings.some((w) => w.includes("Currency mismatch"))).toBe(true);
  });

  it("treats currency comparison as case-insensitive", () => {
    const r = computeSeverity({
      assetCurrency: "btc",
      extractedCurrency: "BTC",
      currentNum: 1,
      newNum: 1.1,
    });
    expect(r.severity).toBe("ok");
  });

  it("handles zero-to-zero gracefully (no warnings)", () => {
    const r = computeSeverity({ ...base, currentNum: 0, newNum: 0 });
    expect(r.severity).toBe("ok");
    expect(r.warnings).toEqual([]);
  });

  it("combines multiple warnings — currency mismatch wins severity", () => {
    const r = computeSeverity({
      assetCurrency: "USD",
      extractedCurrency: "EUR",
      currentNum: 100,
      newNum: 110,
    });
    expect(r.severity).toBe("danger");
    expect(r.warnings.some((w) => w.includes("Currency"))).toBe(true);
  });
});
