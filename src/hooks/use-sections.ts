import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCreateSection(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { sheetId: string; name: string }) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create section");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
    },
  });
}

export function useUpdateSection(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; name?: string }) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update section");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
    },
  });
}

export function useDeleteSection(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string }) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/sections`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to delete section");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
    },
  });
}
