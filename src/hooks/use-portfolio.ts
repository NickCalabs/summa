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
  providerConfig: Record<string, unknown> | null;
  staleDays: number | null;
  lastSyncedAt: string | null;
  ownershipPct: string;
  taxStatus?: "taxable" | "tax_deferred" | "tax_free" | null;
  linkedDebtId?: string | null;
  metadata?: Record<string, unknown> | null;
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
  rates: Record<string, number>;
  ratesBase: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function usePortfolio(
  id: string,
  opts: { refetchInterval?: number | false } = {}
) {
  return useQuery<Portfolio>({
    queryKey: ["portfolio", id],
    enabled: !!id,
    refetchInterval: opts.refetchInterval,
    // Don't poll when the tab is hidden — saves API hits and battery
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const res = await fetch(`/api/portfolios/${id}`);
      if (!res.ok) throw new ApiError("Failed to fetch portfolio", res.status);
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
