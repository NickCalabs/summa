import { describe, it, expect } from "vitest";
import { mostRecentOnOrBefore, planAssetSnapshots, filterExistingAssetSnapshots, portfolioDatesToCreate } from "@/lib/kubera-history/plan";

const btcRows = [
  { date: "2025-01-01", usd: 100, qty: 1, price: 100 },
  { date: "2025-03-01", usd: 300, qty: 3, price: 100 },
];
const cashRows = [
  { date: "2025-02-01", usd: 50, qty: null, price: null },
];

describe("mostRecentOnOrBefore", () => {
  it("returns the latest row on or before the date, or null before the first", () => {
    expect(mostRecentOnOrBefore(btcRows, "2025-02-15")?.usd).toBe(100);
    expect(mostRecentOnOrBefore(btcRows, "2025-03-01")?.usd).toBe(300);
    expect(mostRecentOnOrBefore(btcRows, "2024-12-31")).toBeNull();
  });
});

describe("planAssetSnapshots", () => {
  it("carries forward each asset across the union of dates, within its active range", () => {
    const planned = planAssetSnapshots([
      { assetId: "btc", rows: btcRows, cutoff: null },
      { assetId: "cash", rows: cashRows, cutoff: null },
    ]);
    const byKey = new Map(planned.map((p) => [`${p.assetId}@${p.date}`, p]));
    expect(byKey.get("btc@2025-01-01")?.usd).toBe(100);
    expect(byKey.get("btc@2025-02-01")?.usd).toBe(100); // carried forward
    expect(byKey.get("btc@2025-03-01")?.usd).toBe(300);
    expect(byKey.has("cash@2025-01-01")).toBe(false);    // before cash existed
    expect(byKey.get("cash@2025-02-01")?.usd).toBe(50);
    expect(byKey.get("cash@2025-03-01")?.usd).toBe(50);  // carried forward
  });

  it("excludes dates on/after an asset's cutoff (Summa-era boundary)", () => {
    const planned = planAssetSnapshots([
      { assetId: "btc", rows: btcRows, cutoff: "2025-03-01" },
    ]);
    const dates = planned.map((p) => p.date);
    expect(dates).toContain("2025-01-01");
    expect(dates).not.toContain("2025-03-01"); // cutoff is exclusive
  });
});

describe("insert-only filters", () => {
  it("drops planned asset snapshots whose (assetId,date) already exists", () => {
    const planned = [
      { assetId: "btc", date: "2025-01-01", usd: 100, qty: 1, price: 100 },
      { assetId: "btc", date: "2025-02-01", usd: 100, qty: 1, price: 100 },
    ];
    const existing = new Set(["btc@2025-02-01"]);
    const kept = filterExistingAssetSnapshots(planned, existing);
    expect(kept.map((p) => p.date)).toEqual(["2025-01-01"]);
  });

  it("only creates portfolio snapshots for union dates before the global cutoff and not already present", () => {
    const dates = portfolioDatesToCreate(
      ["2025-01-01", "2025-02-01", "2025-03-01"],
      "2025-03-01",                 // globalCutoff (earliest existing portfolio_snapshot)
      new Set(["2025-01-01"])       // existing portfolio_snapshot dates
    );
    expect(dates).toEqual(["2025-02-01"]); // 01 exists, 03 is >= cutoff
  });
});
