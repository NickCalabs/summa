import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface Transaction {
  id: string;
  assetId: string;
  type: "buy" | "sell" | "deposit" | "withdraw";
  quantity: string | null;
  price: string | null;
  total: string;
  date: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useAssetTransactions(assetId: string | null) {
  return useQuery<Transaction[]>({
    queryKey: ["asset-transactions", assetId],
    enabled: !!assetId,
    queryFn: async () => {
      const res = await fetch(`/api/assets/${assetId}/transactions`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
  });
}

export function useCreateTransaction(assetId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      type: "buy" | "sell" | "deposit" | "withdraw";
      quantity?: string;
      price?: string;
      total: string;
      date: string;
      notes?: string;
    }) => {
      const res = await fetch(`/api/assets/${assetId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create transaction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["asset-transactions", assetId],
      });
      toast.success("Transaction added");
    },
    onError: () => {
      toast.error("Failed to add transaction");
    },
  });
}
