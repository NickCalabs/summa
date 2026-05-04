import { describe, it, expect } from "vitest";
import {
  aggregatePortfolioTotals,
  type AggregatableAsset,
} from "@/lib/snapshots-aggregate";

const a = (overrides: Partial<AggregatableAsset>): AggregatableAsset => ({
  id: "x",
  sectionId: "s1",
  parentAssetId: null,
  currency: "USD",
  currentValue: "0",
  ownershipPct: "100",
  type: "investment",
  isCashEquivalent: false,
  isInvestable: false,
  ...overrides,
});

const sheetTypeMap = new Map<string, string>([
  ["assets-sheet", "assets"],
  ["debts-sheet", "debts"],
]);
const sectionSheetMap = new Map<string, string>([
  ["s1", "assets-sheet"],
  ["s-debts", "debts-sheet"],
]);

describe("aggregatePortfolioTotals", () => {
  it("sums standalone leaf assets without double-counting", () => {
    const totals = aggregatePortfolioTotals({
      assetRows: [
        a({ id: "checking", currentValue: "12000", isCashEquivalent: true }),
        a({ id: "stock", currentValue: "8000", isInvestable: true }),
      ],
      sectionSheetMap,
      sheetTypeMap,
      baseCurrency: "USD",
      rates: {},
    });
    expect(totals.totalAssets).toBe(20000);
    expect(totals.cashOnHand).toBe(12000);
    expect(totals.investableTotal).toBe(8000);
    expect(totals.totalDebts).toBe(0);
  });

  it("skips parent containers when children are present (no double-count)", () => {
    // Coinbase parent storing the sum of its children. If we counted both,
    // totalAssets would be 10_000 (5_000 parent + 3_000 USDC + 2_000 BTC).
    const totals = aggregatePortfolioTotals({
      assetRows: [
        a({ id: "coinbase", currentValue: "5000", isInvestable: true }),
        a({
          id: "usdc",
          parentAssetId: "coinbase",
          currentValue: "3000",
          isCashEquivalent: true,
        }),
        a({
          id: "btc",
          parentAssetId: "coinbase",
          currentValue: "2000",
          isInvestable: true,
        }),
      ],
      sectionSheetMap,
      sheetTypeMap,
      baseCurrency: "USD",
      rates: {},
    });
    expect(totals.totalAssets).toBe(5000); // 3000 + 2000, parent skipped
    expect(totals.cashOnHand).toBe(3000);
    expect(totals.investableTotal).toBe(2000);
  });

  it("applies ownershipPct to leaf totals", () => {
    const totals = aggregatePortfolioTotals({
      assetRows: [
        a({ id: "house", currentValue: "500000", ownershipPct: "50" }),
      ],
      sectionSheetMap,
      sheetTypeMap,
      baseCurrency: "USD",
      rates: {},
    });
    expect(totals.totalAssets).toBe(250000);
  });

  it("routes liability-sheet rows into totalDebts", () => {
    const totals = aggregatePortfolioTotals({
      assetRows: [
        a({
          id: "mortgage",
          sectionId: "s-debts",
          type: "loan",
          currentValue: "300000",
        }),
      ],
      sectionSheetMap,
      sheetTypeMap,
      baseCurrency: "USD",
      rates: {},
    });
    expect(totals.totalDebts).toBe(300000);
    expect(totals.totalAssets).toBe(0);
  });

  it("converts non-base currencies via rates", () => {
    // 5000 EUR with rate 0.92 EUR per USD → 5000/0.92 = 5434.78 USD
    const totals = aggregatePortfolioTotals({
      assetRows: [
        a({ id: "eur-cash", currency: "EUR", currentValue: "5000" }),
      ],
      sectionSheetMap,
      sheetTypeMap,
      baseCurrency: "USD",
      rates: { EUR: 0.92 },
    });
    expect(totals.totalAssets).toBeCloseTo(5434.78, 2);
  });
});
