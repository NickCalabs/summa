"use client";

import { useMemo, useState } from "react";
import {
  Building2Icon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { MoneyDisplay } from "./money-display";
import {
  useCreateSimpleFINConnection,
  useDisconnectSimpleFIN,
  useLinkSimpleFINAccounts,
  useSimpleFINConnections,
  useSyncSimpleFINConnection,
  type SimpleFINAccount,
  type SimpleFINConnection,
} from "@/hooks/use-simplefin";
import {
  getInstitutionSectionName,
  inferSimpleFINAssetType,
  inferSimpleFINSheetType,
} from "@/lib/provider-account-grouping";

const SIMPLEFIN_BRIDGE_CREATE_URL = "https://bridge.simplefin.org/simplefin/create";

function getAccountTarget(connection: SimpleFINConnection, account: SimpleFINAccount) {
  const sheetType = inferSimpleFINSheetType({
    accountName: account.accountName,
    balance: account.balance,
  });

  return {
    institution: getInstitutionSectionName(
      account.institutionName ?? connection.label
    ),
    sheetType,
    assetType: inferSimpleFINAssetType({
      accountName: account.accountName,
      balance: account.balance,
    }),
  };
}

function groupAccountsByInstitution(connection: SimpleFINConnection) {
  const groups = new Map<string, SimpleFINAccount[]>();

  for (const account of connection.accounts) {
    const institution = getInstitutionSectionName(
      account.institutionName ?? connection.label
    );
    const list = groups.get(institution) ?? [];
    list.push(account);
    groups.set(institution, list);
  }

  return [...groups.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([institution, accounts]) => ({ institution, accounts }));
}

export function SimpleFINConnectPanel({
  portfolioId,
}: {
  portfolioId: string;
}) {
  const { data: connections, isLoading } = useSimpleFINConnections();
  const createConnection = useCreateSimpleFINConnection();
  const syncConnection = useSyncSimpleFINConnection();
  const disconnectSimpleFIN = useDisconnectSimpleFIN();

  const [credential, setCredential] = useState("");
  const [newConnection, setNewConnection] = useState<SimpleFINConnection | null>(
    null
  );
  const [disconnectTarget, setDisconnectTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const hasInput = credential.trim().length > 0;

  async function handleConnect() {
    const value = credential.trim();
    if (!value) return;

    const payload = value.startsWith("https://")
      ? { accessUrl: value }
      : { setupToken: value };

    try {
      const result = await createConnection.mutateAsync(payload);
      setCredential("");
      setNewConnection({
        ...result.connection,
        errorCode: null,
        errorMessage: null,
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
        accounts: result.accounts,
      });
    } catch {
      // Toast handling lives in the mutation hook.
    }
  }

  return (
    <>
      <div className="border rounded-lg p-3 space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2Icon className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">SimpleFIN</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Open the SimpleFIN Bridge, copy the setup token or access URL, then
            paste it here to import accounts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={SIMPLEFIN_BRIDGE_CREATE_URL}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Open SimpleFIN Bridge
          </a>
        </div>

        <Textarea
          value={credential}
          onChange={(event) => setCredential(event.target.value)}
          placeholder="Paste a SimpleFIN setup token or access URL"
          className="min-h-24 text-xs"
        />

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={!hasInput || createConnection.isPending}
          >
            {createConnection.isPending ? "Connecting..." : "Connect SimpleFIN"}
          </Button>
        </div>
      </div>

      {newConnection && (
        <SimpleFINAccountSelector
          portfolioId={portfolioId}
          connection={newConnection}
          defaultSelectedIds={newConnection.accounts.map(
            (account) => account.simplefinAccountId
          )}
          onDone={() => setNewConnection(null)}
        />
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Existing SimpleFIN connections</h3>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : connections && connections.length > 0 ? (
          <div className="space-y-3">
            {connections.map((connection) => (
              <SimpleFINConnectionCard
                key={connection.id}
                connection={connection}
                portfolioId={portfolioId}
                onSync={() => syncConnection.mutate(connection.id)}
                onDisconnect={() =>
                  setDisconnectTarget({ id: connection.id, name: connection.label })
                }
                isSyncing={syncConnection.isPending}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No SimpleFIN connections yet.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDisconnectTarget(null);
        }}
        title={`Disconnect ${disconnectTarget?.name ?? "SimpleFIN"}?`}
        description="Linked assets will remain in Summa, but future SimpleFIN balance syncs will stop."
        confirmLabel="Disconnect"
        variant="destructive"
        isPending={disconnectSimpleFIN.isPending}
        onConfirm={() => {
          if (!disconnectTarget) return;
          disconnectSimpleFIN.mutate(disconnectTarget.id, {
            onSuccess: () => setDisconnectTarget(null),
          });
        }}
      />
    </>
  );
}

function SimpleFINConnectionCard({
  connection,
  portfolioId,
  onSync,
  onDisconnect,
  isSyncing,
}: {
  connection: SimpleFINConnection;
  portfolioId: string;
  onSync: () => void;
  onDisconnect: () => void;
  isSyncing: boolean;
}) {
  const [relinkAccountId, setRelinkAccountId] = useState<string | null>(null);

  const relinkAccount = relinkAccountId
    ? connection.accounts.find(
        (account) => account.simplefinAccountId === relinkAccountId
      ) ?? null
    : null;

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Building2Icon className="size-4 text-muted-foreground" />
            <span className="font-medium text-sm">{connection.label}</span>
            {connection.errorMessage && (
              <Badge variant="destructive" className="text-[10px]">
                Needs attention
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {connection.serverUrl}
          </p>
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

      {connection.errorMessage && (
        <p className="text-xs text-destructive">{connection.errorMessage}</p>
      )}

      {connection.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Last synced: {new Date(connection.lastSyncedAt).toLocaleString()}
        </p>
      )}

      {connection.accounts.length > 0 && (
        <div className="space-y-2">
          {groupAccountsByInstitution(connection).map((group) => (
            <div key={group.institution}>
              <div className="flex items-center gap-2 py-1">
                <Building2Icon className="size-3 text-muted-foreground/60" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {group.institution}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.accounts.map((account) => {
                  const target = getAccountTarget(connection, account);
                  return (
                    <div
                      key={account.id}
                      className="flex items-center justify-between gap-3 text-sm py-1"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {account.accountName}
                      </span>
                      {account.balance != null && (
                        <MoneyDisplay
                          amount={Math.abs(Number(account.balance))}
                          currency={account.currency}
                          className="tabular-nums text-sm font-medium shrink-0"
                        />
                      )}
                      {account.isTracked ? (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {target.sheetType === "debts" ? "Debt" : "Tracked"}
                        </Badge>
                      ) : relinkAccountId === account.simplefinAccountId ? (
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
                          onClick={() =>
                            setRelinkAccountId(account.simplefinAccountId)
                          }
                        >
                          Link
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {relinkAccount && (
        <SimpleFINAccountSelector
          portfolioId={portfolioId}
          connection={{ ...connection, accounts: [relinkAccount] }}
          defaultSelectedIds={[relinkAccount.simplefinAccountId]}
          onDone={() => setRelinkAccountId(null)}
        />
      )}
    </div>
  );
}

function SimpleFINAccountSelector({
  portfolioId,
  connection,
  defaultSelectedIds,
  onDone,
}: {
  portfolioId: string;
  connection: SimpleFINConnection;
  defaultSelectedIds?: string[];
  onDone: () => void;
}) {
  const linkAccounts = useLinkSimpleFINAccounts();
  const groupedAccounts = useMemo(
    () => groupAccountsByInstitution(connection),
    [connection]
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultSelectedIds ?? [])
  );

  function toggleAccount(simplefinAccountId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(simplefinAccountId)) {
        next.delete(simplefinAccountId);
      } else {
        next.add(simplefinAccountId);
      }
      return next;
    });
  }

  function toggleInstitution(accounts: SimpleFINAccount[]) {
    setSelected((previous) => {
      const next = new Set(previous);
      const ids = accounts.map((a) => a.simplefinAccountId);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }

  const selectedTotal = useMemo(() => {
    let total = 0;
    for (const account of connection.accounts) {
      if (selected.has(account.simplefinAccountId) && account.balance != null) {
        total += Math.abs(Number(account.balance));
      }
    }
    return total;
  }, [connection.accounts, selected]);

  function handleConfirm() {
    const accounts = Array.from(selected.values()).map((simplefinAccountId) => ({
      simplefinAccountId,
    }));

    if (accounts.length === 0) {
      onDone();
      return;
    }

    linkAccounts.mutate(
      {
        connectionId: connection.id,
        portfolioId,
        accounts,
      },
      {
        onSuccess: () => onDone(),
      }
    );
  }

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <h4 className="text-sm font-medium">
        Select accounts to track from {connection.label}
      </h4>

      <p className="text-xs text-muted-foreground">
        Accounts are grouped automatically by institution. Checking and savings
        stay in assets, while cards and loans are routed to debts.
      </p>

      <div className="space-y-2">
        {groupedAccounts.map((group) => {
          const groupIds = group.accounts.map((a) => a.simplefinAccountId);
          const allGroupSelected = groupIds.every((id) => selected.has(id));

          return (
            <div key={group.institution} className="rounded-md border border-border/60">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/30">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2Icon className="size-3.5 text-muted-foreground" />
                    <span className="font-medium text-sm">{group.institution}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {group.accounts.length} account{group.accounts.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => toggleInstitution(group.accounts)}
                  className="text-xs"
                >
                  {allGroupSelected ? "Deselect all" : "Select all"}
                </Button>
              </div>

              <div className="divide-y divide-border/40">
                {group.accounts.map((account) => {
                  const isSelected = selected.has(account.simplefinAccountId);
                  const target = getAccountTarget(connection, account);

                  return (
                    <div key={account.id} className="flex items-center gap-3 p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAccount(account.simplefinAccountId)}
                        className="rounded"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{account.accountName}</div>
                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                          <span>
                            {target.sheetType === "debts" ? "Debts" : "Assets"}
                          </span>
                          <span>·</span>
                          <span>{target.assetType}</span>
                          {account.balanceDate ? (
                            <>
                              <span>·</span>
                              <span>
                                {new Date(account.balanceDate).toLocaleDateString()}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {target.sheetType === "debts" && (
                        <Badge variant="destructive" className="text-[10px] shrink-0">
                          Debt
                        </Badge>
                      )}

                      {account.balance != null && (
                        <MoneyDisplay
                          amount={Math.abs(Number(account.balance))}
                          currency={account.currency}
                          className="tabular-nums text-sm font-semibold shrink-0"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        {selected.size > 0 && (
          <p className="text-xs text-muted-foreground">
            Selected total:{" "}
            <MoneyDisplay
              amount={selectedTotal}
              currency="USD"
              className="font-semibold text-foreground"
            />
          </p>
        )}
        <div className="flex-1" />
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
