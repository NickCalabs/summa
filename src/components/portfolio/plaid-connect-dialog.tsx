"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
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
  LinkIcon,
} from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import {
  usePlaidConnections,
  useCreateLinkToken,
  useExchangeToken,
  useLinkPlaidAccounts,
  useSyncPlaidConnection,
  useReconnectLinkToken,
  useDisconnectPlaid,
  type PlaidConnection,
  type PlaidAccount,
} from "@/hooks/use-plaid";
import { usePlaidLink } from "react-plaid-link";
import type { Section, Sheet } from "@/hooks/use-portfolio";
import { isLiabilityAccount } from "@/lib/providers/plaid";

// Error codes that require re-authentication via Plaid Link update mode
const REAUTH_ERROR_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "INVALID_ACCESS_TOKEN",
  "INVALID_CREDENTIALS",
  "MFA_NOT_SUPPORTED",
  "OAUTH_STATE_ID_ALREADY_PROCESSED",
  "PENDING_EXPIRATION",
]);

interface PlaidConnectDialogProps {
  sheets: Sheet[];
}

// Returns the best default section ID for a given Plaid account type.
// credit/loan → first section in a debts sheet; everything else → first section in an assets sheet.
function getDefaultSectionId(accountType: string, sheets: Sheet[]): string {
  const isDebt = accountType === "credit" || accountType === "loan";
  const targetType = isDebt ? "debts" : "assets";
  const targetSheets = sheets.filter((s) => s.type === targetType);
  const fallback = sheets.flatMap((s) => s.sections)[0]?.id ?? "";
  return targetSheets[0]?.sections[0]?.id ?? fallback;
}

export function PlaidConnectDialog({ sheets }: PlaidConnectDialogProps) {
  const open = useUIStore((s) => s.plaidDialogOpen);
  const closePlaidDialog = useUIStore((s) => s.closePlaidDialog);

  const { data: connections, isLoading } = usePlaidConnections();
  const createLinkToken = useCreateLinkToken();
  const exchangeToken = useExchangeToken();
  const syncConnection = useSyncPlaidConnection();
  const reconnectLinkToken = useReconnectLinkToken();
  const disconnectPlaid = useDisconnectPlaid();

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [newConnection, setNewConnection] = useState<PlaidConnection | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: string; name: string } | null>(null);
  const [reconnectState, setReconnectState] = useState<{
    connectionId: string;
    linkToken: string;
  } | null>(null);

  async function handleConnectBank() {
    const result = await createLinkToken.mutateAsync();
    setLinkToken(result.linkToken);
  }

  async function handleReconnect(connectionId: string) {
    const result = await reconnectLinkToken.mutateAsync(connectionId);
    setReconnectState({ connectionId, linkToken: result.linkToken });
  }

  return (
    <>
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
                      sheets={sheets}
                      onSync={() => syncConnection.mutate(conn.id)}
                      onDisconnect={() => setDisconnectTarget({ id: conn.id, name: conn.institutionName })}
                      onReconnect={() => handleReconnect(conn.id)}
                      isSyncing={syncConnection.isPending}
                      isReconnecting={reconnectLinkToken.isPending}
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
              sheets={sheets}
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

        {/* New connection flow */}
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
                      errorExpiresAt: null,
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

        {/* Reconnect (update mode) flow */}
        {reconnectState && (
          <PlaidLinkOpener
            linkToken={reconnectState.linkToken}
            onSuccess={() => {
              const connectionId = reconnectState.connectionId;
              setReconnectState(null);
              syncConnection.mutate(connectionId);
            }}
            onExit={() => setReconnectState(null)}
          />
        )}
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={disconnectTarget !== null}
      onOpenChange={(open) => { if (!open) setDisconnectTarget(null); }}
      title={`Disconnect ${disconnectTarget?.name ?? "bank"}?`}
      description="Synced transactions will not be deleted, but no new data will sync from this bank account."
      confirmLabel="Disconnect"
      variant="destructive"
      isPending={disconnectPlaid.isPending}
      onConfirm={() => {
        if (disconnectTarget) {
          disconnectPlaid.mutate(disconnectTarget.id, {
            onSuccess: () => setDisconnectTarget(null),
          });
        }
      }}
    />
    </>
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

  const hasOpened = useRef(false);

  useEffect(() => {
    if (ready && !hasOpened.current) {
      hasOpened.current = true;
      open();
    }
  }, [ready, open]);

  return null;
}

function ConnectionCard({
  connection,
  sheets,
  onSync,
  onDisconnect,
  onReconnect,
  isSyncing,
  isReconnecting,
}: {
  connection: PlaidConnection;
  sheets: Sheet[];
  onSync: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  isSyncing: boolean;
  isReconnecting: boolean;
}) {
  const hasError = !!connection.errorCode;
  const [relinkAccountId, setRelinkAccountId] = useState<string | null>(null);

  const relinkAccount = relinkAccountId
    ? connection.accounts.find((a) => a.plaidAccountId === relinkAccountId) ?? null
    : null;
  const needsReauth =
    !!connection.errorCode && REAUTH_ERROR_CODES.has(connection.errorCode);

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
              {needsReauth ? "Reconnect Required" : "Error"}
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

      {needsReauth && (
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs"
          onClick={onReconnect}
          disabled={isReconnecting}
        >
          {isReconnecting ? (
            <Loader2Icon className="size-3 mr-1.5 animate-spin" />
          ) : (
            <LinkIcon className="size-3 mr-1.5" />
          )}
          Reconnect Bank
        </Button>
      )}

      {hasError && connection.errorExpiresAt && !needsReauth && (
        <p className="text-xs text-muted-foreground">
          Auto-retry at {new Date(connection.errorExpiresAt).toLocaleString()}
        </p>
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
            <div key={a.id} className="flex justify-between items-center">
              <span>
                {a.name}
                {a.mask ? ` (...${a.mask})` : ""}
              </span>
              {a.isTracked ? (
                <span className="tabular-nums">Tracked</span>
              ) : relinkAccountId === a.plaidAccountId ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setRelinkAccountId(null)}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setRelinkAccountId(a.plaidAccountId)}
                >
                  Link
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {relinkAccount && (
        <AccountSelector
          connection={{ ...connection, accounts: [relinkAccount] }}
          sheets={sheets}
          onDone={() => setRelinkAccountId(null)}
        />
      )}
    </div>
  );
}

function AccountSelector({
  connection,
  sheets,
  onDone,
}: {
  connection: PlaidConnection;
  sheets: Sheet[];
  onDone: () => void;
}) {
  const linkAccounts = useLinkPlaidAccounts();

  // Bug 3: pre-check all untracked accounts with smart section defaults
  const [selected, setSelected] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const account of connection.accounts) {
      if (!account.isTracked) {
        map.set(account.plaidAccountId, getDefaultSectionId(account.type, sheets));
      }
    }
    return map;
  });

  const assetsSections = sheets
    .filter((s) => s.type === "assets")
    .flatMap((s) => s.sections);
  const debtsSections = sheets
    .filter((s) => s.type === "debts")
    .flatMap((s) => s.sections);

  function sectionsForAccount(accountType: string): Section[] {
    return isLiabilityAccount(accountType) ? debtsSections : assetsSections;
  }

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

  const hasDebtsSheet = debtsSections.length > 0;

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <h4 className="text-sm font-medium">
        Select accounts to track from {connection.institutionName}
      </h4>

      {!hasDebtsSheet && connection.accounts.some((a) => isLiabilityAccount(a.type)) && (
        <p className="text-xs text-amber-500">
          Create a &quot;Debts&quot; sheet first to track credit cards and loans.
        </p>
      )}

      <div className="space-y-2">
        {connection.accounts.map((account) => {
          const isSelected = selected.has(account.plaidAccountId);
          const availableSections = sectionsForAccount(account.type);
          const defaultSection = availableSections[0]?.id ?? "";
          const sectionId =
            selected.get(account.plaidAccountId) ?? defaultSection;
          const isLiability = isLiabilityAccount(account.type);
          const noTargetSheet = isLiability && debtsSections.length === 0;

          return (
            <div
              key={account.id}
              className="flex items-center gap-3 text-sm"
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={noTargetSheet}
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
                {isLiability && (
                  <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                    debt
                  </Badge>
                )}
              </span>
              {account.currentBalance != null && (
                <span className="tabular-nums text-muted-foreground">
                  {Number(account.currentBalance).toLocaleString(undefined, {
                    style: "currency",
                    currency: account.isoCurrencyCode ?? "USD",
                  })}
                </span>
              )}
              {isSelected && availableSections.length > 1 && (
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
                    {availableSections.find((s) => s.id === sectionId)?.name ??
                      "Section"}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuRadioGroup
                      value={sectionId}
                      onValueChange={(v) =>
                        toggleAccount(account.plaidAccountId, v)
                      }
                    >
                      {availableSections.map((s) => (
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
          disabled={linkAccounts.isPending || selected.size === 0}
        >
          {linkAccounts.isPending
            ? "Linking..."
            : `Link ${selected.size} Account${selected.size !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}
