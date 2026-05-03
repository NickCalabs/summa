import { useQuery } from "@tanstack/react-query";
import type { RecapResponse } from "@/lib/recap-types";
import { useRecapContext } from "@/contexts/recap-context";

export function useRecap(portfolioId: string) {
  const { report, period, mode } = useRecapContext();

  return useQuery<RecapResponse>({
    queryKey: ["recap", portfolioId, report, period, mode],
    enabled: !!portfolioId,
    queryFn: async () => {
      const params = new URLSearchParams({ report, period, mode });
      const res = await fetch(
        `/api/portfolios/${portfolioId}/recap?${params}`
      );
      if (!res.ok) throw new Error("Failed to fetch recap data");
      return res.json();
    },
  });
}
