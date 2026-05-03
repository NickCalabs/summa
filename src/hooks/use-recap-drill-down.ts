import { useQuery } from "@tanstack/react-query";

interface DrillDownPoint {
  date: string;
  value: number;
}

interface DrillDownResponse {
  series: DrillDownPoint[];
}

export function useRecapDrillDown(
  portfolioId: string,
  assetIds: string[],
  from?: string
) {
  const key = assetIds.join(",");

  return useQuery<DrillDownResponse>({
    queryKey: ["recap-drill-down", portfolioId, key, from],
    enabled: !!portfolioId && assetIds.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ assetIds: key });
      if (from) params.set("from", from);
      const res = await fetch(
        `/api/portfolios/${portfolioId}/recap/drill-down?${params}`
      );
      if (!res.ok) throw new Error("Failed to fetch drill-down data");
      return res.json();
    },
  });
}
