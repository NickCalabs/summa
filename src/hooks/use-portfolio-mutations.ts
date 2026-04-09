import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Portfolio } from "@/hooks/use-portfolio";

export function useUpdatePortfolio(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await fetch(`/api/portfolios/${portfolioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update portfolio");
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({
        queryKey: ["portfolio", portfolioId],
      });
      const previous = queryClient.getQueryData<Portfolio>([
        "portfolio",
        portfolioId,
      ]);
      if (previous) {
        queryClient.setQueryData<Portfolio>(["portfolio", portfolioId], {
          ...previous,
          name: data.name,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["portfolio", portfolioId],
          context.previous
        );
      }
      toast.error("Failed to update portfolio");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
    },
  });
}

export function useSyncPortfolio(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portfolios/${portfolioId}/sync`, {
        method: "POST",
      });
      if (!res.ok) {
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            `Slow down — try again in ${body.retryAfter ?? "a few"} seconds`
          );
        }
        throw new Error("Sync failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      toast.success("Synced");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
