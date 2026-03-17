import { useQuery } from "@tanstack/react-query";

interface PortfolioSummary {
  id: string;
  name: string;
  currency: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  sectionId: string;
  name: string;
  type: string;
  sortOrder: number;
  currency: string;
  quantity: string | null;
  costBasis: string | null;
  currentValue: string;
  currentPrice: string | null;
  isInvestable: boolean;
  isCashEquivalent: boolean;
  providerType: string;
  ownershipPct: string;
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Section {
  id: string;
  sheetId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  assets: Asset[];
}

export interface Sheet {
  id: string;
  portfolioId: string;
  name: string;
  type: "assets" | "debts";
  sortOrder: number;
  createdAt: string;
  sections: Section[];
}

export interface Aggregates {
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
  cashOnHand: number;
}

export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  currency: string;
  startDate: string | null;
  createdAt: string;
  updatedAt: string;
  sheets: Sheet[];
  aggregates: Aggregates;
}

export function usePortfolio(id: string) {
  return useQuery<Portfolio>({
    queryKey: ["portfolio", id],
    queryFn: async () => {
      const res = await fetch(`/api/portfolios/${id}`);
      if (!res.ok) throw new Error("Failed to fetch portfolio");
      return res.json();
    },
  });
}

export function usePortfolios() {
  return useQuery<PortfolioSummary[]>({
    queryKey: ["portfolios"],
    queryFn: async () => {
      const res = await fetch("/api/portfolios");
      if (!res.ok) throw new Error("Failed to fetch portfolios");
      return res.json();
    },
  });
}
