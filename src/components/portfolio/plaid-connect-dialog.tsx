"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCwIcon,
  Trash2Icon,
  BuildingIcon,
  AlertTriangleIcon,
  Loader2Icon,
} from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import {
  usePlaidConnections,
  useCreateLinkToken,
  useExchangeToken,
  useLinkPlaidAccounts,
  useSyncPlaidConnection,
  useDisconnectPlaid,
  type PlaidConnection,
  type PlaidAccount,
} from "@/hooks/use-plaid";
import { usePlaidLink } from "react-plaid-link";
import type { Section } from "@/hooks/use-portfolio";

interface PlaidConnectDialogProps {
  sections: Section[];
}

export function PlaidConnectDialog({ sections }: PlaidConnectDialogProps) {
  const open = useUIStore((s) => s.plaidDialogOpen);
  const closePlaidDialog = useUIStore((s) => s.closePlaidDialog);

  const { data: connections, isLoading } = usePlaidConnections();
  const createLinkToken = useCreateLinkToken();
  const exchangeToken = useExchangeToken();
  const syncConnection = useSyncPlaidConnection();
  const disconnectPlaid = useDisconnectPlaid();

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [newConnection, setNewConnection] = useState<PlaidConnection | null>(null);

  async function handleConnectBank() {
    const result = await createLinkToken.mutateAsync();
    setLinkToken(result.linkToken);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closePlaidDialog()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bank Connections</DialogTitle>
          <DialogDescription>
            Connect your bank accounts to automatically sync balances.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {connections && connections.length > 0 ? (
                <div className="space-y-3">
                  {connections.map((conn) => (
                    <ConnectionCard
                      key={conn.id}
                      connection={conn}
                      onSync={() => syncConnection.mutate(conn.id)}
                      onDisconnect={() => disconnectPlaid.mutate(conn.id)}
                      isSyncing={syncConnection.isPending}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No bank connections yet.
                </div>
              )}
            </>
          )}

          {/* Account selection for newly connected bank */}
          {newConnection && (
            <AccountSelector
              connection={newConnection}
              sections={sections}
              onDone={() => setNewConnection(null)}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closePlaidDialog}>
            Close
          </Button>
          <Button
            onClick={handleConnectBank}
            disabled={createLinkToken.isPending}
          >
            {createLinkToken.isPending ? "Loading..." : "Connect New Bank"}
          </Button>
        </DialogFooter>

        {linkToken && (
          <PlaidLinkOpener
            linkToken={linkToken}
            onSuccess={(publicToken, metadata) => {
              setLinkToken(null);
              exchangeToken.mutate(
                {
                  publicToken,
                  institutionId: metadata.institution?.institution_id ?? "",
                  institutionName: metadata.institution?.name ?? "Unknown Bank",
                },
                {
                  onSuccess: (data: any) => {
                    // Show account selection
                    setNewConnection({
                      id: data.connection.id,
                      institutionId: "",
                      institutionName: data.connection.institutionName,
                      itemId: data.connection.itemId,
                      errorCode: null,
                      errorMessage: null,
                      lastSyncedAt: null,
                      consentExpiration: null,
                      createdAt: new Date().toISOString(),
                      accounts: data.accounts,
                    });
                  },
                }
              );
            }}
            onExit={() => setLinkToken(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlaidLinkOpener({
  linkToken,
  onSuccess,
  onExit,
}: {
  linkToken: string;
  onSuccess: (publicToken: string, metadata: any) => void;
  onExit: () => void;
}) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  // Auto-open when ready
  const openRef = useCallback(() => {
    if (ready) open();
  }, [ready, open]);

  // Trigger open
  if (ready) {
    setTimeout(openRef, 0);
  }

  return null;
}

function ConnectionCard({
  connection,
  onSync,
  onDisconnect,
  isSyncing,
}: {
  connection: PlaidConnection;
  onSync: () => void;
  onDisconnect: () => void;
  isSyncing: boolean;
}) {
  const hasError = !!connection.errorCode;

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BuildingIcon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">
            {connection.institutionName}
          </span>
          {hasError && (
            <Badge variant="destructive" className="text-[10px]">
              <AlertTriangleIcon className="size-3 mr-1" />
              {connection.errorCode === "PENDING_EXPIRATION"
                ? "Expiring"
                : "Error"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onSync}
            disabled={isSyncing}
            title="Sync now"
          >
            <RefreshCwIcon
              className={`size-3.5 ${isSyncing ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDisconnect}
            title="Disconnect"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      </div>

      {hasError && connection.errorMessage && (
        <p className="text-xs text-destructive">{connection.errorMessage}</p>
      )}

      {connection.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Last synced:{" "}
          {new Date(connection.lastSyncedAt).toLocaleString()}
        </p>
      )}

      {connection.accounts.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {connection.accounts.map((a) => (
            <div key={a.id} className="flex justify-between">
              <span>
                {a.name}
                {a.mask ? ` (...${a.mask})` : ""}
              </span>
              <span className="tabular-nums">
                {a.isTracked ? "Tracked" : "Not tracked"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountSelector({
  connection,
  sections,
  onDone,
}: {
  connection: PlaidConnection;
  sections: Section[];
  onDone: () => void;
}) {
  const linkAccounts = useLinkPlaidAccounts();
  const [selected, setSelected] = useState<
    Map<string, string>
  >(new Map());

  function toggleAccount(plaidAccountId: string, sectionId: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(plaidAccountId)) {
        next.delete(plaidAccountId);
      } else {
        next.set(plaidAccountId, sectionId);
      }
      return next;
    });
  }

  function handleConfirm() {
    const accounts = Array.from(selected.entries()).map(
      ([plaidAccountId, sectionId]) => ({ plaidAccountId, sectionId })
    );
    if (accounts.length === 0) {
      onDone();
      return;
    }
    linkAccounts.mutate(
      { connectionId: connection.id, accounts },
      { onSuccess: () => onDone() }
    );
  }

  const defaultSection = sections[0]?.id ?? "";

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <h4 className="text-sm font-medium">
        Select accounts to track from {connection.institutionName}
      </h4>
      <div className="space-y-2">
        {connection.accounts.map((account) => {
          const isSelected = selected.has(account.plaidAccountId);
          const sectionId =
            selected.get(account.plaidAccountId) ?? defaultSection;

          return (
            <div
              key={account.id}
              className="flex items-center gap-3 text-sm"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() =>
                  toggleAccount(account.plaidAccountId, sectionId)
                }
                className="rounded"
              />
              <span className="flex-1">
                {account.name}
                {account.mask ? ` (...${account.mask})` : ""}
                <span className="text-muted-foreground ml-1">
                  {account.type}
                  {account.subtype ? `/${account.subtype}` : ""}
                </span>
              </span>
              {account.currentBalance != null && (
                <span className="tabular-nums text-muted-foreground">
                  {Number(account.currentBalance).toLocaleString(undefined, {
                    style: "currency",
                    currency: account.isoCurrencyCode ?? "USD",
                  })}
                </span>
              )}
              {isSelected && sections.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="xs"
                        className="text-xs"
                      />
                    }
                  >
                    {sections.find((s) => s.id === sectionId)?.name ??
                      "Section"}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuRadioGroup
                      value={sectionId}
                      onValueChange={(v) =>
                        toggleAccount(account.plaidAccountId, v)
                      }
                    >
                      {sections.map((s) => (
                        <DropdownMenuRadioItem key={s.id} value={s.id}>
                          {s.name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>
          Skip
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={linkAccounts.isPending}
        >
          {linkAccounts.isPending
            ? "Linking..."
            : `Link ${selected.size} Account${selected.size !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}
