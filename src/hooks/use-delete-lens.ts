import { useMutation, useQueryClient } from "@tanstack/react-query";

interface DeleteInput {
  portfolioId: string;
  lensId: string;
}

export function useDeleteLens() {
  const qc = useQueryClient();
  return useMutation<void, Error, DeleteInput>({
    mutationFn: async ({ portfolioId, lensId }) => {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/lenses/${lensId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete lens");
      }
    },
    onSuccess: (_, { portfolioId }) => {
      qc.invalidateQueries({ queryKey: ["lenses", portfolioId] });
    },
  });
}
