import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Portfolio, Section } from "@/hooks/use-portfolio";
import { recomputeAggregates } from "@/lib/portfolio-utils";
import { tempId } from "@/lib/temp-id";

function portfolioKey(portfolioId: string) {
  return ["portfolio", portfolioId] as const;
}

export function useCreateSection(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

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
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      const clone = structuredClone(previous);
      const sheet = clone.sheets.find((s) => s.id === data.sheetId);
      if (sheet) {
        const tempSection: Section = {
          id: tempId(),
          sheetId: data.sheetId,
          name: data.name,
          sortOrder: sheet.sections.length,
          createdAt: new Date().toISOString(),
          assets: [],
        };
        sheet.sections.push(tempSection);
      }
      queryClient.setQueryData<Portfolio>(key, clone);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to create section");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUpdateSection(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

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
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      const clone = structuredClone(previous);
      for (const sheet of clone.sheets) {
        const section = sheet.sections.find((s) => s.id === data.id);
        if (section) {
          if (data.name !== undefined) section.name = data.name;
          break;
        }
      }
      queryClient.setQueryData<Portfolio>(key, clone);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to update section");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDeleteSection(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

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
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      const clone = structuredClone(previous);
      for (const sheet of clone.sheets) {
        const idx = sheet.sections.findIndex((s) => s.id === data.id);
        if (idx !== -1) {
          sheet.sections.splice(idx, 1);
          break;
        }
      }
      queryClient.setQueryData<Portfolio>(key, recomputeAggregates(clone));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to delete section");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useReorderSections(portfolioId: string) {
  const queryClient = useQueryClient();
  const key = portfolioKey(portfolioId);

  return useMutation({
    mutationFn: async (data: { items: { id: string; sortOrder: number }[] }) => {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/sections/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error("Failed to reorder sections");
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Portfolio>(key);
      if (!previous) return { previous };

      const clone = structuredClone(previous);
      const orderMap = new Map(data.items.map((i) => [i.id, i.sortOrder]));
      for (const sheet of clone.sheets) {
        for (const section of sheet.sections) {
          const newOrder = orderMap.get(section.id);
          if (newOrder !== undefined) section.sortOrder = newOrder;
        }
        sheet.sections.sort((a, b) => a.sortOrder - b.sortOrder);
      }
      queryClient.setQueryData<Portfolio>(key, clone);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error("Failed to reorder sections");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
