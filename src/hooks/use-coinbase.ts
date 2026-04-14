import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface CoinbaseConnection {
  id: string;
  label: string;
  errorCode: string | null;
  errorMessage: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface CreateCoinbaseInput {
  apiKey: string;
  apiSecret: string;
  label?: string;
}

export interface CreateCoinbaseResult {
  connection: {
    id: string;
    label: string;
    lastSyncedAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  };
  syncResult: { synced: number; created: number; archived: number } | null;
}

export function useCoinbaseConnections() {
  return useQuery<CoinbaseConnection[]>({
    queryKey: ["coinbase-connections"],
    queryFn: async () => {
      const res = await fetch("/api/coinbase/connections");
      if (!res.ok) throw new Error("Failed to load Coinbase connections");
      return res.json();
    },
  });
}

export function useCreateCoinbaseConnection() {
  const queryClient = useQueryClient();

  return useMutation<CreateCoinbaseResult, Error, CreateCoinbaseInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/coinbase/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to connect Coinbase");
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["coinbase-connections"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      if (data.connection.errorCode) {
        toast.error(data.connection.errorMessage ?? "Initial sync failed");
      } else if (data.syncResult) {
        const { created, synced } = data.syncResult;
        toast.success(
          `Coinbase connected (${created} new, ${synced} synced)`
        );
      } else {
        toast.success("Coinbase connected");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to connect");
    },
  });
}

export function useDisconnectCoinbase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(`/api/coinbase/connections/${connectionId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coinbase-connections"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success("Coinbase disconnected");
    },
    onError: () => toast.error("Failed to disconnect"),
  });
}
