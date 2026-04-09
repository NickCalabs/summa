import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface RefreshResponse {
  asset: {
    id: string;
    quantity: string | null;
    currentValue: string;
    currentPrice: string | null;
    lastSyncedAt: string | null;
  };
  summary: {
    totalWallets: number;
    updated: number;
    failed: number;
    priceAvailable: boolean;
  };
}

/**
 * Manual "Sync now" mutation for a wallet asset. Calls the
 * `/api/assets/:id/refresh` endpoint (which reuses the same code path as
 * the cron) and then invalidates the portfolio query so the refreshed
 * row re-renders.
 *
 * Extracted into its own hook per project convention: TanStack Query
 * mutations live in dedicated hook files, not inline in components.
 */
export function useWalletRefresh(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assetId: string): Promise<RefreshResponse> => {
      const res = await fetch(`/api/assets/${assetId}/refresh`, {
        method: "POST",
      });
      if (!res.ok) {
        let message = "Failed to refresh wallet";
        try {
          const body = await res.json();
          if (typeof body?.error === "string" && body.error.length > 0) {
            message = body.error;
          }
        } catch {
          // Non-JSON — stick with the generic message.
        }
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
      if (data.summary.updated > 0) {
        toast.success("Wallet synced");
      } else {
        toast.error("Wallet sync didn't complete — try again in a moment");
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof Error && err.message ? err.message : "Failed to refresh wallet"
      );
    },
  });
}
