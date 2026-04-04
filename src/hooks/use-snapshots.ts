import { useQuery } from "@tanstack/react-query";

export interface PortfolioSnapshot {
  id: string;
  portfolioId: string;
  date: string;
  totalAssets: string;
  totalDebts: string;
  netWorth: string;
  cashOnHand: string;
  investableTotal: string | null;
  createdAt: string;
}

export interface AssetSnapshot {
  id: string;
  assetId: string;
  date: string;
  value: string;
  valueInBase: string;
  price: string | null;
  quantity: string | null;
  source: string;
  createdAt: string;
}

export function usePortfolioSnapshots(
  portfolioId: string,
  from?: string,
  to?: string
) {
  return useQuery<PortfolioSnapshot[]>({
    queryKey: ["portfolio-snapshots", portfolioId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const res = await fetch(
        `/api/portfolios/${portfolioId}/snapshots${qs ? `?${qs}` : ""}`
      );
      if (!res.ok) throw new Error("Failed to fetch portfolio snapshots");
      return res.json();
    },
  });
}

export function useAssetSnapshots(
  assetId: string | null,
  from?: string,
  to?: string
) {
  return useQuery<AssetSnapshot[]>({
    queryKey: ["asset-snapshots", assetId, from, to],
    enabled: !!assetId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const res = await fetch(
        `/api/assets/${assetId}/snapshots${qs ? `?${qs}` : ""}`
      );
      if (!res.ok) throw new Error("Failed to fetch asset snapshots");
      return res.json();
    },
  });
}
