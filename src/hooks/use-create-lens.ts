import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lens } from "./use-lenses";

interface CreateInput {
  portfolioId: string;
  label: string;
  assetIds: string[];
  description?: string | null;
  color?: string | null;
  isPinned?: boolean;
}

export function useCreateLens() {
  const qc = useQueryClient();
  return useMutation<Lens, Error, CreateInput>({
    mutationFn: async ({ portfolioId, ...body }) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/lenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create lens");
      }
      return res.json();
    },
    onSuccess: (_, { portfolioId }) => {
      qc.invalidateQueries({ queryKey: ["lenses", portfolioId] });
    },
  });
}
