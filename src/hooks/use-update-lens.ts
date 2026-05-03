import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lens } from "./use-lenses";

interface UpdateInput {
  portfolioId: string;
  lensId: string;
  label?: string;
  description?: string | null;
  color?: string | null;
  isPinned?: boolean;
  assetIds?: string[];
}

export function useUpdateLens() {
  const qc = useQueryClient();
  return useMutation<Lens, Error, UpdateInput>({
    mutationFn: async ({ portfolioId, lensId, ...body }) => {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/lenses/${lensId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update lens");
      }
      return res.json();
    },
    onSuccess: (_, { portfolioId }) => {
      qc.invalidateQueries({ queryKey: ["lenses", portfolioId] });
    },
  });
}
