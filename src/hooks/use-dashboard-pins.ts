import { useQuery } from "@tanstack/react-query";

export interface DashboardPin {
  id: string;
  portfolioId: string;
  label: string;
  assetIds: string[];
  sortOrder: number;
  createdAt: string;
}

export function useDashboardPins(portfolioId: string) {
  return useQuery<DashboardPin[]>({
    queryKey: ["dashboard-pins", portfolioId],
    enabled: !!portfolioId,
    queryFn: async () => {
      const res = await fetch(`/api/portfolios/${portfolioId}/dashboard-pins`);
      if (!res.ok) throw new Error("Failed to fetch dashboard pins");
      return res.json();
    },
  });
}
