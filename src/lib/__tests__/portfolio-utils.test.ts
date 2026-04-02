import { describe, expect, it } from "vitest";
import type { Portfolio } from "@/hooks/use-portfolio";
import {
  findLinkedAssetForDebt,
  getAccountDetailKind,
} from "@/lib/portfolio-utils";

const basePortfolio: Portfolio = {
  id: "p1",
  userId: "u1",
  name: "Test",
  currency: "USD",
  startDate: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  rates: {},
  ratesBase: "USD",
  aggregates: { totalAssets: 0, totalDebts: 0, netWorth: 0, cashOnHand: 0 },
  sheets: [
    {
      id: "assets-sheet",
      portfolioId: "p1",
      name: "Assets",
      type: "assets",
      sortOrder: 0,
      createdAt: "2026-01-01",
      sections: [
        {
          id: "assets-section",
          sheetId: "assets-sheet",
          name: "Property",
          sortOrder: 0,
          createdAt: "2026-01-01",
          assets: [
            {
              id: "house",
              sectionId: "assets-section",
              name: "Primary Home",
              type: "real_estate",
              sortOrder: 0,
              currency: "USD",
              quantity: null,
              costBasis: null,
              currentValue: "500000",
              currentPrice: null,
              isInvestable: false,
              isCashEquivalent: false,
              providerType: "manual",
              providerConfig: null,
              staleDays: null,
              lastSyncedAt: null,
              ownershipPct: "50",
              linkedDebtId: "mortgage",
              notes: null,
              isArchived: false,
              createdAt: "2026-01-01",
              updatedAt: "2026-01-01",
            },
          ],
        },
      ],
    },
    {
      id: "debts-sheet",
      portfolioId: "p1",
      name: "Debts",
      type: "debts",
      sortOrder: 1,
      createdAt: "2026-01-01",
      sections: [
        {
          id: "debts-section",
          sheetId: "debts-sheet",
          name: "Loans",
          sortOrder: 0,
          createdAt: "2026-01-01",
          assets: [
            {
              id: "mortgage",
              sectionId: "debts-section",
              name: "Mortgage",
              type: "loan",
              sortOrder: 0,
              currency: "USD",
              quantity: null,
              costBasis: null,
              currentValue: "250000",
              currentPrice: null,
              isInvestable: false,
              isCashEquivalent: false,
              providerType: "manual",
              providerConfig: null,
              staleDays: null,
              lastSyncedAt: null,
              ownershipPct: "50",
              notes: null,
              isArchived: false,
              createdAt: "2026-01-01",
              updatedAt: "2026-01-01",
            },
          ],
        },
      ],
    },
  ],
};

describe("getAccountDetailKind", () => {
  it("classifies debt accounts from the sheet type", () => {
    const asset = basePortfolio.sheets[1].sections[0].assets[0];
    expect(getAccountDetailKind({ type: "debts" }, asset)).toBe("debt");
  });

  it("classifies cash-like asset accounts", () => {
    expect(
      getAccountDetailKind(
        { type: "assets" },
        {
          type: "cash",
          isCashEquivalent: true,
          providerType: "manual",
          quantity: null,
          currentPrice: null,
          costBasis: null,
        }
      )
    ).toBe("cash");
  });

  it("classifies investment accounts as brokerage", () => {
    expect(
      getAccountDetailKind(
        { type: "assets" },
        {
          type: "investment",
          isCashEquivalent: false,
          providerType: "plaid",
          quantity: null,
          currentPrice: null,
          costBasis: null,
        }
      )
    ).toBe("brokerage");
  });
});

describe("findLinkedAssetForDebt", () => {
  it("finds the asset pointing at a debt", () => {
    const linked = findLinkedAssetForDebt(basePortfolio, "mortgage");
    expect(linked?.asset.id).toBe("house");
    expect(linked?.section.name).toBe("Property");
  });
});
