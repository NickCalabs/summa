import { useQuery } from "@tanstack/react-query";

export interface Lens {
  id: string;
  portfolioId: string;
  label: string;
  description: string | null;
  color: string | null;
  isPinned: boolean;
  assetIds: string[];
  sortOrder: number;
  createdAt: string;
}

export function useLenses(portfolioId: string) {
  return useQuery<Lens[]>({
    queryKey: ["lenses", portfolioId],
    enabled: !!portfolioId,
    queryFn: async () => {
      const res = await fetch(`/api/portfolios/${portfolioId}/lenses`);
      if (!res.ok) throw new Error("Failed to fetch lenses");
      return res.json();
    },
  });
}
