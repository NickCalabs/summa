import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCreateSheet(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; type?: "assets" | "debts" }) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/sheets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create sheet");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
    },
  });
}

export function useUpdateSheet(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; name?: string; type?: "assets" | "debts" }) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/sheets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update sheet");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
    },
  });
}

export function useDeleteSheet(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string }) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/sheets`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to delete sheet");
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
    },
  });
}
