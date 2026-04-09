import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Portfolio, Sheet } from "@/hooks/use-portfolio";
import { recomputeAggregates } from "@/lib/portfolio-utils";
import { tempId } from "@/lib/temp-id";

function portfolioKey(portfolioId: string) {
  return ["portfolio", portfolioId] as const;
}

export function useCreateSheet(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

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
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      const tempSheet: Sheet = {
        id: tempId(),
        portfolioId,
        name: data.name,
        type: data.type ?? "assets",
        sortOrder: previous.sheets.length,
        createdAt: new Date().toISOString(),
        sections: [],
      };
      const clone = structuredClone(previous);
      clone.sheets.push(tempSheet);
      queryClient.setQueryData<Portfolio>(key, clone);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to create sheet");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUpdateSheet(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

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
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      const clone = structuredClone(previous);
      const sheet = clone.sheets.find((s) => s.id === data.id);
      if (sheet) {
        if (data.name !== undefined) sheet.name = data.name;
        if (data.type !== undefined) sheet.type = data.type;
      }
      queryClient.setQueryData<Portfolio>(key, recomputeAggregates(clone));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to update sheet");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDeleteSheet(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

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
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      const clone = structuredClone(previous);
      clone.sheets = clone.sheets.filter((s) => s.id !== data.id);
      queryClient.setQueryData<Portfolio>(key, recomputeAggregates(clone));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to delete sheet");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useReorderSheets(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

  return useMutation({
    mutationFn: async (data: { items: { id: string; sortOrder: number }[] }) => {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/sheets/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error("Failed to reorder sheets");
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      const clone = structuredClone(previous);
      const orderMap = new Map(data.items.map((i) => [i.id, i.sortOrder]));
      for (const sheet of clone.sheets) {
        const newOrder = orderMap.get(sheet.id);
        if (newOrder !== undefined) sheet.sortOrder = newOrder;
      }
      clone.sheets.sort((a, b) => a.sortOrder - b.sortOrder);
      queryClient.setQueryData<Portfolio>(key, clone);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to reorder sheets");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
