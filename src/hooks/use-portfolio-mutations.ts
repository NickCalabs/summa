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
