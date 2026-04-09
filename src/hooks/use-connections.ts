import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type ConnectionStatus = "ok" | "stale" | "error" | "never" | "unconfigured";

export interface WalletConnection {
  id: string;
  name: string;
  chain: string;
  address: string;
  lastSyncedAt: string | null;
  status: ConnectionStatus;
  error: string | null;
  currentValue: string;
}

export interface PlaidConnectionSummary {
  id: string;
  institutionName: string;
  lastSyncedAt: string | null;
  status: ConnectionStatus;
  errorCode: string | null;
  errorMessage: string | null;
  accountCount: number;
}

export interface SimpleFINConnectionSummary {
  id: string;
  label: string;
  serverUrl: string;
  lastSyncedAt: string | null;
  status: ConnectionStatus;
  errorCode: string | null;
  errorMessage: string | null;
  accountCount: number;
}

export interface PriceFeedStatus {
  name: "yahoo" | "coingecko" | "frankfurter";
  lastFetchAt: string | null;
  status: ConnectionStatus;
}

export interface ConnectionsData {
  wallets: WalletConnection[];
  plaid: PlaidConnectionSummary[];
  simplefin: SimpleFINConnectionSummary[];
  priceFeeds: PriceFeedStatus[];
  providerStatus: {
    plaid: boolean;
    etherscan: boolean;
    helius: boolean;
  };
}

export function useConnections() {
  return useQuery<ConnectionsData>({
    queryKey: ["connections"],
    queryFn: async () => {
      const res = await fetch("/api/connections");
      if (!res.ok) throw new Error("Failed to fetch connections");
      return res.json();
    },
    refetchInterval: 60_000,
  });
}

export function useSyncAll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/connections/sync", { method: "POST" });
      if (res.status === 409) {
        throw new Error("Sync already in progress");
      }
      if (!res.ok) throw new Error("Failed to sync");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["plaid-connections"] });
      queryClient.invalidateQueries({ queryKey: ["simplefin-connections"] });
      toast.success("All connections synced");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to sync"
      );
    },
  });
}

export function useSyncWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assetId: string) => {
      const res = await fetch(`/api/connections/wallet/${assetId}/sync`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to sync wallet");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success("Wallet synced");
    },
    onError: () => {
      toast.error("Failed to sync wallet");
    },
  });
}

export function useSyncPlaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(
        `/api/plaid/connections/${connectionId}/sync`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Failed to sync");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["plaid-connections"] });
      toast.success("Bank synced");
    },
    onError: () => {
      toast.error("Failed to sync bank");
    },
  });
}

export function useSyncSimpleFIN() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(
        `/api/simplefin/connections/${connectionId}/sync`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Failed to sync");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["simplefin-connections"] });
      toast.success("SimpleFIN synced");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to sync"
      );
    },
  });
}
