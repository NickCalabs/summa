import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface SimpleFINAccount {
  id: string;
  simplefinAccountId: string;
  assetId: string | null;
  connectionName: string | null;
  institutionName: string | null;
  accountName: string;
  currency: string;
  balance: string | null;
  availableBalance: string | null;
  balanceDate: string | null;
  isTracked: boolean;
}

export interface SimpleFINConnection {
  id: string;
  serverUrl: string;
  label: string;
  errorCode: string | null;
  errorMessage: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  accounts: SimpleFINAccount[];
}

interface CreateSimpleFINConnectionResult {
  connection: {
    id: string;
    serverUrl: string;
    label: string;
  };
  accounts: SimpleFINAccount[];
  warnings?: string[];
}

interface SyncSimpleFINConnectionResult {
  synced: number;
  warnings?: string[];
}

function notifyWarnings(warnings: string[] | undefined) {
  if (!warnings || warnings.length === 0) return;
  toast.warning(warnings[0]);
}

export function useSimpleFINConnections() {
  return useQuery<SimpleFINConnection[]>({
    queryKey: ["simplefin-connections"],
    queryFn: async () => {
      const res = await fetch("/api/simplefin/connections");
      if (!res.ok) throw new Error("Failed to fetch SimpleFIN connections");
      return res.json();
    },
  });
}

export function useCreateSimpleFINConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { setupToken?: string; accessUrl?: string }) => {
      const res = await fetch("/api/simplefin/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to connect SimpleFIN");
      }

      return body as CreateSimpleFINConnectionResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["simplefin-connections"] });
      toast.success("SimpleFIN connected");
      notifyWarnings(data.warnings);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to connect SimpleFIN");
    },
  });
}

export function useLinkSimpleFINAccounts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      connectionId: string;
      portfolioId: string;
      accounts: { simplefinAccountId: string; sectionId?: string }[];
    }) => {
      const res = await fetch(
        `/api/simplefin/connections/${data.connectionId}/accounts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            portfolioId: data.portfolioId,
            accounts: data.accounts,
          }),
        }
      );

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to link SimpleFIN accounts");
      }

      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["simplefin-connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success("SimpleFIN accounts linked");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to link SimpleFIN accounts");
    },
  });
}

export function useSyncSimpleFINConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(`/api/simplefin/connections/${connectionId}/sync`, {
        method: "POST",
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to sync SimpleFIN balances");
      }

      return body as SyncSimpleFINConnectionResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["simplefin-connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success("SimpleFIN balances synced");
      notifyWarnings(data.warnings);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to sync SimpleFIN balances");
    },
  });
}

export function useRelinkSimpleFINAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      accountId: string;
      action: "unlink" | "relink";
      assetId?: string;
    }) => {
      const res = await fetch(`/api/simplefin/accounts/${data.accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          data.action === "unlink"
            ? { action: "unlink" }
            : { action: "relink", assetId: data.assetId }
        ),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to update account link");
      }
      return body;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["simplefin-connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success(
        variables.action === "unlink"
          ? "Account unlinked"
          : "Account relinked"
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update account link"
      );
    },
  });
}

export function useDisconnectSimpleFIN() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(`/api/simplefin/connections/${connectionId}`, {
        method: "DELETE",
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to disconnect SimpleFIN");
      }

      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["simplefin-connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success("SimpleFIN disconnected");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect SimpleFIN");
    },
  });
}
