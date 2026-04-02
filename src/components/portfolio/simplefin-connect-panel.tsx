"use client";

import { useMemo, useState } from "react";
import { Building2Icon, Loader2Icon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { MoneyDisplay } from "./money-display";
import {
  useCreateSimpleFINConnection,
  useDisconnectSimpleFIN,
  useLinkSimpleFINAccounts,
  useSimpleFINConnections,
  useSyncSimpleFINConnection,
  type SimpleFINConnection,
} from "@/hooks/use-simplefin";
import type { Section, Sheet } from "@/hooks/use-portfolio";

const SIMPLEFIN_BRIDGE_CREATE_URL = "https://bridge.simplefin.org/simplefin/create";

function getAllSections(sheets: Sheet[]): Section[] {
  return sheets.flatMap((sheet) => sheet.sections);
}

function getDefaultSectionId(sheets: Sheet[]): string {
  return getAllSections(sheets)[0]?.id ?? "";
}

export function SimpleFINConnectPanel({ sheets }: { sheets: Sheet[] }) {
  const { data: connections, isLoading } = useSimpleFINConnections();
  const createConnection = useCreateSimpleFINConnection();
  const syncConnection = useSyncSimpleFINConnection();
  const disconnectSimpleFIN = useDisconnectSimpleFIN();

  const [credential, setCredential] = useState("");
  const [newConnection, setNewConnection] = useState<SimpleFINConnection | null>(null);
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
            Open the SimpleFIN Bridge, copy the setup token or access URL, then paste it here to import accounts.
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
          connection={newConnection}
          sheets={sheets}
          defaultSelectedIds={newConnection.accounts.map((account) => account.simplefinAccountId)}
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
                sheets={sheets}
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
  sheets,
  onSync,
  onDisconnect,
  isSyncing,
}: {
  connection: SimpleFINConnection;
  sheets: Sheet[];
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
            <RefreshCwIcon className={`size-3.5 ${isSyncing ? "animate-spin" : ""}`} />
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
        <div className="text-xs text-muted-foreground space-y-1">
          {connection.accounts.map((account) => (
            <div key={account.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate">
                {account.institutionName ? `${account.institutionName} - ` : ""}
                {account.accountName}
              </span>
              {account.isTracked ? (
                <span className="tabular-nums">Tracked</span>
              ) : relinkAccountId === account.simplefinAccountId ? (
                <Button variant="ghost" size="xs" onClick={() => setRelinkAccountId(null)}>
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setRelinkAccountId(account.simplefinAccountId)}
                >
                  Link
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {relinkAccount && (
        <SimpleFINAccountSelector
          connection={{ ...connection, accounts: [relinkAccount] }}
          sheets={sheets}
          defaultSelectedIds={[relinkAccount.simplefinAccountId]}
          onDone={() => setRelinkAccountId(null)}
        />
      )}
    </div>
  );
}

function SimpleFINAccountSelector({
  connection,
  sheets,
  defaultSelectedIds,
  onDone,
}: {
  connection: SimpleFINConnection;
  sheets: Sheet[];
  defaultSelectedIds?: string[];
  onDone: () => void;
}) {
  const linkAccounts = useLinkSimpleFINAccounts();
  const sections = useMemo(() => getAllSections(sheets), [sheets]);
  const defaultSectionId = getDefaultSectionId(sheets);
  const hasSections = sections.length > 0;

  const [selected, setSelected] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    for (const accountId of defaultSelectedIds ?? []) {
      if (defaultSectionId) {
        initial.set(accountId, defaultSectionId);
      }
    }
    return initial;
  });

  function toggleAccount(simplefinAccountId: string, sectionId: string) {
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(simplefinAccountId)) {
        next.delete(simplefinAccountId);
      } else {
        next.set(simplefinAccountId, sectionId);
      }
      return next;
    });
  }

  function setSection(simplefinAccountId: string, sectionId: string) {
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(simplefinAccountId)) {
        next.set(simplefinAccountId, sectionId);
      }
      return next;
    });
  }

  function handleConfirm() {
    const accounts = Array.from(selected.entries()).map(
      ([simplefinAccountId, sectionId]) => ({ simplefinAccountId, sectionId })
    );
    if (accounts.length === 0) {
      onDone();
      return;
    }

    linkAccounts.mutate(
      {
        connectionId: connection.id,
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
        Phase one keeps this manual: pick the accounts you want and choose the right section so we do not auto-create duplicates.
      </p>

      <div className="space-y-2">
        {connection.accounts.map((account) => {
          const isSelected = selected.has(account.simplefinAccountId);
          const sectionId = selected.get(account.simplefinAccountId) ?? defaultSectionId;

          return (
            <div key={account.id} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={isSelected}
                disabled={!hasSections}
                onChange={() => toggleAccount(account.simplefinAccountId, sectionId)}
                className="rounded"
              />

              <div className="flex-1 min-w-0">
                <div className="truncate">
                  {account.institutionName ? `${account.institutionName} - ` : ""}
                  {account.accountName}
                </div>
                {(account.connectionName || account.balanceDate) && (
                  <div className="text-xs text-muted-foreground truncate">
                    {account.connectionName ?? "SimpleFIN"}
                    {account.balanceDate
                      ? ` • ${new Date(account.balanceDate).toLocaleDateString()}`
                      : ""}
                  </div>
                )}
              </div>

              {account.balance != null && (
                <MoneyDisplay
                  amount={Number(account.balance)}
                  currency={account.currency}
                  className="tabular-nums text-muted-foreground"
                />
              )}

              {isSelected && sections.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="outline" size="xs" className="text-xs" />
                    }
                  >
                    {sections.find((section) => section.id === sectionId)?.name ??
                      "Section"}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuRadioGroup
                      value={sectionId}
                      onValueChange={(value) =>
                        setSection(account.simplefinAccountId, value)
                      }
                    >
                      {sections.map((section) => (
                        <DropdownMenuRadioItem key={section.id} value={section.id}>
                          {section.name}
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
          disabled={linkAccounts.isPending || selected.size === 0 || !hasSections}
        >
          {linkAccounts.isPending
            ? "Linking..."
            : `Link ${selected.size} Account${selected.size !== 1 ? "s" : ""}`}
        </Button>
      </div>

      {!hasSections && (
        <p className="text-xs text-muted-foreground">
          Add a section to this portfolio before linking imported accounts.
        </p>
      )}
    </div>
  );
}
