import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { format, subDays } from "date-fns";
import { getChangeFromSnapshots, computeInvestableTotal } from "@/lib/snapshot-utils";
import type { PortfolioSnapshot } from "@/hooks/use-snapshots";
import type { Portfolio } from "@/hooks/use-portfolio";

function makeSnapshot(
  date: string,
  overrides: Partial<PortfolioSnapshot> = {}
): PortfolioSnapshot {
  return {
    id: "snap-" + date,
    portfolioId: "p1",
    date,
    totalAssets: "10000",
    totalDebts: "2000",
    netWorth: "8000",
    cashOnHand: "3000",
    investableTotal: null,
    createdAt: date,
    ...overrides,
  };
}

function dateStr(daysAgo: number): string {
  return format(subDays(new Date(), daysAgo), "yyyy-MM-dd");
}

describe("getChangeFromSnapshots", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for empty snapshots", () => {
    expect(getChangeFromSnapshots([], "netWorth", 1)).toBeNull();
  });

  it("returns null for single snapshot", () => {
    expect(getChangeFromSnapshots([makeSnapshot(dateStr(0))], "netWorth", 1)).toBeNull();
  });

  it("computes correct 1-day change", () => {
    const snapshots = [
      makeSnapshot(dateStr(0), { netWorth: "10000" }),
      makeSnapshot(dateStr(1), { netWorth: "9500" }),
    ];
    const result = getChangeFromSnapshots(snapshots, "netWorth", 1);
    expect(result).not.toBeNull();
    expect(result!.absoluteChange).toBe(500);
    expect(result!.percentChange).toBeCloseTo(5.26, 1);
  });

  it("computes correct 1-year change", () => {
    const snapshots = [
      makeSnapshot(dateStr(0), { totalAssets: "20000" }),
      makeSnapshot(dateStr(365), { totalAssets: "15000" }),
    ];
    const result = getChangeFromSnapshots(snapshots, "totalAssets", 365);
    expect(result).not.toBeNull();
    expect(result!.absoluteChange).toBe(5000);
    expect(result!.percentChange).toBeCloseTo(33.33, 1);
  });

  it("picks the closest snapshot within tolerance", () => {
    const snapshots = [
      makeSnapshot(dateStr(0), { netWorth: "10000" }),
      makeSnapshot(dateStr(3), { netWorth: "9000" }), // 3 days ago (close to target of 1)
      makeSnapshot(dateStr(30), { netWorth: "7000" }),
    ];
    const result = getChangeFromSnapshots(snapshots, "netWorth", 1);
    expect(result).not.toBeNull();
    expect(result!.absoluteChange).toBe(1000); // 10000 - 9000
  });

  it("returns null when no snapshot within tolerance", () => {
    const snapshots = [
      makeSnapshot(dateStr(0), { netWorth: "10000" }),
      makeSnapshot(dateStr(30), { netWorth: "9000" }), // 30 days ago, tolerance for daysAgo=1 is ±3
    ];
    const result = getChangeFromSnapshots(snapshots, "netWorth", 1);
    expect(result).toBeNull();
  });

  it("handles zero previous value without NaN/Infinity", () => {
    const snapshots = [
      makeSnapshot(dateStr(0), { netWorth: "5000" }),
      makeSnapshot(dateStr(1), { netWorth: "0" }),
    ];
    const result = getChangeFromSnapshots(snapshots, "netWorth", 1);
    expect(result).not.toBeNull();
    expect(result!.absoluteChange).toBe(5000);
    expect(result!.percentChange).toBe(0);
    expect(Number.isFinite(result!.percentChange)).toBe(true);
  });
});

describe("computeInvestableTotal", () => {
  const basePortfolio: Portfolio = {
    id: "p1",
    userId: "u1",
    name: "Test",
    currency: "USD",
    startDate: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    rates: { EUR: 0.92 },
    ratesBase: "USD",
    aggregates: { totalAssets: 0, totalDebts: 0, netWorth: 0, cashOnHand: 0 },
    sheets: [],
  };

  it("sums only investable, non-archived assets", () => {
    const portfolio: Portfolio = {
      ...basePortfolio,
      sheets: [
        {
          id: "s1",
          portfolioId: "p1",
          name: "Investments",
          type: "assets",
          sortOrder: 0,
          createdAt: "2026-01-01",
          sections: [
            {
              id: "sec1",
              sheetId: "s1",
              name: "Stocks",
              sortOrder: 0,
              createdAt: "2026-01-01",
              assets: [
                {
                  id: "a1", sectionId: "sec1", name: "AAPL", type: "stock",
                  sortOrder: 0, currency: "USD", quantity: "10", costBasis: "1000",
                  currentValue: "5000", currentPrice: "500", isInvestable: true,
                  isCashEquivalent: false, providerType: "manual", providerConfig: null,
                  staleDays: null, lastSyncedAt: null, ownershipPct: "100",
                  notes: null, isArchived: false, createdAt: "2026-01-01", updatedAt: "2026-01-01",
                },
                {
                  id: "a2", sectionId: "sec1", name: "Old Fund", type: "fund",
                  sortOrder: 1, currency: "USD", quantity: null, costBasis: null,
                  currentValue: "3000", currentPrice: null, isInvestable: true,
                  isCashEquivalent: false, providerType: "manual", providerConfig: null,
                  staleDays: null, lastSyncedAt: null, ownershipPct: "100",
                  notes: null, isArchived: true, createdAt: "2026-01-01", updatedAt: "2026-01-01",
                },
                {
                  id: "a3", sectionId: "sec1", name: "House", type: "property",
                  sortOrder: 2, currency: "USD", quantity: null, costBasis: null,
                  currentValue: "200000", currentPrice: null, isInvestable: false,
                  isCashEquivalent: false, providerType: "manual", providerConfig: null,
                  staleDays: null, lastSyncedAt: null, ownershipPct: "100",
                  notes: null, isArchived: false, createdAt: "2026-01-01", updatedAt: "2026-01-01",
                },
              ],
            },
          ],
        },
      ],
    };
    expect(computeInvestableTotal(portfolio)).toBe(5000); // only a1
  });

  it("converts cross-currency assets using rates", () => {
    const portfolio: Portfolio = {
      ...basePortfolio,
      sheets: [
        {
          id: "s1",
          portfolioId: "p1",
          name: "Assets",
          type: "assets",
          sortOrder: 0,
          createdAt: "2026-01-01",
          sections: [
            {
              id: "sec1",
              sheetId: "s1",
              name: "Stocks",
              sortOrder: 0,
              createdAt: "2026-01-01",
              assets: [
                {
                  id: "a1", sectionId: "sec1", name: "EU Stock", type: "stock",
                  sortOrder: 0, currency: "EUR", quantity: "10", costBasis: "1000",
                  currentValue: "920", currentPrice: "92", isInvestable: true,
                  isCashEquivalent: false, providerType: "manual", providerConfig: null,
                  staleDays: null, lastSyncedAt: null, ownershipPct: "100",
                  notes: null, isArchived: false, createdAt: "2026-01-01", updatedAt: "2026-01-01",
                },
              ],
            },
          ],
        },
      ],
    };
    // 920 EUR / 0.92 = 1000 USD
    expect(computeInvestableTotal(portfolio)).toBe(1000);
  });

  it("ignores misplaced liability balances inside asset sheets", () => {
    const portfolio: Portfolio = {
      ...basePortfolio,
      sheets: [
        {
          id: "s1",
          portfolioId: "p1",
          name: "Assets",
          type: "assets",
          sortOrder: 0,
          createdAt: "2026-01-01",
          sections: [
            {
              id: "sec1",
              sheetId: "s1",
              name: "Accounts",
              sortOrder: 0,
              createdAt: "2026-01-01",
              assets: [
                {
                  id: "a1", sectionId: "sec1", name: "Brokerage", type: "investment",
                  sortOrder: 0, currency: "USD", quantity: null, costBasis: null,
                  currentValue: "5000", currentPrice: null, isInvestable: true,
                  isCashEquivalent: false, providerType: "manual", providerConfig: null,
                  staleDays: null, lastSyncedAt: null, ownershipPct: "100",
                  notes: null, isArchived: false, createdAt: "2026-01-01", updatedAt: "2026-01-01",
                  taxStatus: null, linkedDebtId: null, metadata: null,
                },
                {
                  id: "a2", sectionId: "sec1", name: "Card", type: "credit_card",
                  sortOrder: 1, currency: "USD", quantity: null, costBasis: null,
                  currentValue: "1200", currentPrice: null, isInvestable: true,
                  isCashEquivalent: false, providerType: "manual", providerConfig: null,
                  staleDays: null, lastSyncedAt: null, ownershipPct: "100",
                  notes: null, isArchived: false, createdAt: "2026-01-01", updatedAt: "2026-01-01",
                  taxStatus: null, linkedDebtId: null, metadata: null,
                },
              ],
            },
          ],
        },
      ],
    };

    expect(computeInvestableTotal(portfolio)).toBe(5000);
  });
});
