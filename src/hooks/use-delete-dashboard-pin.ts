import { useMutation, useQueryClient } from "@tanstack/react-query";

interface DeleteInput {
  portfolioId: string;
  pinId: string;
}

export function useDeleteDashboardPin() {
  const qc = useQueryClient();
  return useMutation<void, Error, DeleteInput>({
    mutationFn: async ({ portfolioId, pinId }) => {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/dashboard-pins/${pinId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete pin");
      }
    },
    onSuccess: (_, { portfolioId }) => {
      qc.invalidateQueries({ queryKey: ["dashboard-pins", portfolioId] });
    },
  });
}
