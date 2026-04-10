import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface BrokerageImportRequest {
  portfolioId: string;
  accountName: string;
  sectionId: string;
  positions: {
    symbol: string;
    name: string;
    quantity: number;
    price: number;
    value: number;
  }[];
}

interface BrokerageImportResponse {
  parentAssetId: string;
  holdingsCreated: number;
  totalValue: number;
}

export function useBrokerageImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      payload: BrokerageImportRequest
    ): Promise<BrokerageImportResponse> => {
      const res = await fetch("/api/import/brokerage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Import failed" }));
        throw new Error(err.error ?? "Import failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      toast.success(
        `Imported ${data.holdingsCreated} holdings ($${data.totalValue.toLocaleString()})`
      );
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });
}
