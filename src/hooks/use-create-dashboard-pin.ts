import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DashboardPin } from "./use-dashboard-pins";

interface CreateInput {
  portfolioId: string;
  label: string;
  assetIds: string[];
}

export function useCreateDashboardPin() {
  const qc = useQueryClient();
  return useMutation<DashboardPin, Error, CreateInput>({
    mutationFn: async ({ portfolioId, label, assetIds }) => {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/dashboard-pins`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, assetIds }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create pin");
      }
      return res.json();
    },
    onSuccess: (_, { portfolioId }) => {
      qc.invalidateQueries({ queryKey: ["dashboard-pins", portfolioId] });
    },
  });
}
