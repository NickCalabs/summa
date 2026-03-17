import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function usePlaidStatus() {
  return useQuery<{ configured: boolean }>({
    queryKey: ["plaid-status"],
    queryFn: async () => {
      const res = await fetch("/api/plaid/status");
      if (!res.ok) throw new Error("Failed to check Plaid status");
      return res.json();
    },
    staleTime: Infinity,
  });
}

export interface PlaidAccount {
  id: string;
  plaidAccountId: string;
  assetId: string | null;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: string | null;
  availableBalance: string | null;
  isoCurrencyCode: string | null;
  isTracked: boolean;
}

export interface PlaidConnection {
  id: string;
  institutionId: string;
  institutionName: string;
  itemId: string;
  errorCode: string | null;
  errorMessage: string | null;
  errorExpiresAt: string | null;
  lastSyncedAt: string | null;
  consentExpiration: string | null;
  createdAt: string;
  accounts: PlaidAccount[];
}

export function usePlaidConnections() {
  return useQuery<PlaidConnection[]>({
    queryKey: ["plaid-connections"],
    queryFn: async () => {
      const res = await fetch("/api/plaid/connections");
      if (!res.ok) throw new Error("Failed to fetch connections");
      return res.json();
    },
  });
}

export function useCreateLinkToken() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create link token");
      return res.json() as Promise<{ linkToken: string }>;
    },
    onError: () => {
      toast.error("Failed to create Plaid link token");
    },
  });
}

export function useExchangeToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      publicToken: string;
      institutionId: string;
      institutionName: string;
    }) => {
      const res = await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to exchange token");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plaid-connections"] });
      toast.success("Bank connected successfully");
    },
    onError: () => {
      toast.error("Failed to connect bank");
    },
  });
}

export function useLinkPlaidAccounts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      connectionId: string;
      accounts: { plaidAccountId: string; sectionId: string }[];
    }) => {
      const res = await fetch(
        `/api/plaid/connections/${data.connectionId}/accounts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accounts: data.accounts }),
        }
      );
      if (!res.ok) throw new Error("Failed to link accounts");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plaid-connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success("Accounts linked");
    },
    onError: () => {
      toast.error("Failed to link accounts");
    },
  });
}

export function useSyncPlaidConnection() {
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
      queryClient.invalidateQueries({ queryKey: ["plaid-connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success("Balances synced");
    },
    onError: () => {
      toast.error("Failed to sync balances");
    },
  });
}

export function useDisconnectPlaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(`/api/plaid/connections/${connectionId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plaid-connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success("Bank disconnected");
    },
    onError: () => {
      toast.error("Failed to disconnect bank");
    },
  });
}
