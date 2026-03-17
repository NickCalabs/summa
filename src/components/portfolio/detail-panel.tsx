"use client";

import { useState, useEffect, useMemo } from "react";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { useAssetSnapshots } from "@/hooks/use-snapshots";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoneyDisplay } from "./money-display";
import { ConfirmDialog } from "./confirm-dialog";
import { useUIStore } from "@/stores/ui-store";
import {
  useUpdateAsset,
  useArchiveAsset,
  useDeleteAsset,
} from "@/hooks/use-assets";
import { useSyncPlaidConnection } from "@/hooks/use-plaid";
import {
  useAssetTransactions,
  useCreateTransaction,
  type Transaction,
} from "@/hooks/use-transactions";
import { findAssetInTree } from "@/lib/portfolio-utils";
import { parseCurrencyInput, formatNumberForInput } from "@/lib/currency";
import { useCurrency } from "@/contexts/currency-context";
import type { Portfolio } from "@/hooks/use-portfolio";

const PROVIDER_TYPES = [
  "manual",
  "ticker",
  "wallet",
  "plaid",
  "zillow",
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  manual: "Manual",
  ticker: "Ticker",
  wallet: "Wallet",
  plaid: "Plaid",
  zillow: "Zillow",
};

interface DetailPanelProps {
  portfolioId: string;
  portfolio: Portfolio;
}

export function DetailPanel({ portfolioId, portfolio }: DetailPanelProps) {
  const detailPanelAssetId = useUIStore((s) => s.detailPanelAssetId);
  const closeDetailPanel = useUIStore((s) => s.closeDetailPanel);

  const updateAsset = useUpdateAsset(portfolioId);
  const archiveAsset = useArchiveAsset(portfolioId);
  const deleteAsset = useDeleteAsset(portfolioId);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const open = detailPanelAssetId !== null;
  const asset = open
    ? findAssetInTree(portfolio, detailPanelAssetId!)
    : undefined;

  // Auto-close if asset no longer exists
  useEffect(() => {
    if (open && !asset) {
      closeDetailPanel();
    }
  }, [open, asset, closeDetailPanel]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) closeDetailPanel();
  }

  if (!asset) {
    return (
      <>
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetContent className="w-full sm:max-w-[480px]">
            <SheetHeader>
              <SheetTitle>Asset not found</SheetTitle>
              <SheetDescription>
                This asset may have been deleted.
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
        <ConfirmDialog
          open={false}
          onOpenChange={() => {}}
          title=""
          description=""
          onConfirm={() => {}}
        />
      </>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="sm:max-w-[480px] overflow-y-auto">
          <PanelHeader
            asset={asset}
            updateAsset={updateAsset}
          />

          <div className="flex-1 px-4">
            <Tabs defaultValue="value">
              <TabsList variant="line" className="w-full">
                <TabsTrigger value="value">Value</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="value" className="pt-4 space-y-4">
                <ValueTab
                  asset={asset}
                  currency={portfolio.currency}
                  updateAsset={updateAsset}
                />
              </TabsContent>

              <TabsContent value="transactions" className="pt-4 space-y-4">
                <TransactionsTab assetId={asset.id} currency={asset.currency} />
              </TabsContent>

              <TabsContent value="notes" className="pt-4">
                <NotesTab
                  asset={asset}
                  updateAsset={updateAsset}
                />
              </TabsContent>

              <TabsContent value="settings" className="pt-4 space-y-4">
                <SettingsTab
                  asset={asset}
                  updateAsset={updateAsset}
                  archiveAsset={archiveAsset}
                  closeDetailPanel={closeDetailPanel}
                  onDeleteClick={() => setDeleteOpen(true)}
                />
              </TabsContent>
            </Tabs>
          </div>

          <SheetFooter className="text-xs text-muted-foreground">
            Created {new Date(asset.createdAt).toLocaleDateString()} · Updated{" "}
            {new Date(asset.updatedAt).toLocaleDateString()}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete asset"
        description="This asset will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteAsset.isPending}
        onConfirm={() => {
          if (asset) {
            deleteAsset.mutate(
              { id: asset.id },
              {
                onSuccess: () => {
                  setDeleteOpen(false);
                  closeDetailPanel();
                },
              }
            );
          }
        }}
      />
    </>
  );
}

// --- Sub-components ---

function PanelHeader({
  asset,
  updateAsset,
}: {
  asset: NonNullable<ReturnType<typeof findAssetInTree>>;
  updateAsset: ReturnType<typeof useUpdateAsset>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  function startEditing() {
    setEditValue(asset.name);
    setIsEditing(true);
  }

  function commitName() {
    const name = editValue.trim();
    if (name && name !== asset.name) {
      updateAsset.mutate({ id: asset.id, name });
    }
    setIsEditing(false);
  }

  return (
    <SheetHeader>
      {isEditing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commitName();
          }}
        >
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsEditing(false);
            }}
            className="text-base font-medium"
            autoFocus
          />
        </form>
      ) : (
        <SheetTitle className="cursor-pointer" onClick={startEditing}>
          {asset.name}
        </SheetTitle>
      )}
      <SheetDescription render={<div />}>
        <div className="flex gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {asset.type}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {asset.providerType}
          </Badge>
        </div>
      </SheetDescription>
    </SheetHeader>
  );
}

function ValueTab({
  asset,
  currency,
  updateAsset,
}: {
  asset: NonNullable<ReturnType<typeof findAssetInTree>>;
  currency: string;
  updateAsset: ReturnType<typeof useUpdateAsset>;
}) {
  const [manualValue, setManualValue] = useState("");
  const { baseCurrency, toBase } = useCurrency();
  const isForeign = asset.currency !== baseCurrency;

  const hasQtyPrice =
    asset.quantity != null && asset.currentPrice != null;

  function handleValueUpdate(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseCurrencyInput(manualValue, currency);
    if (parsed.amount !== 0 || manualValue.trim() === "0") {
      updateAsset.mutate({ id: asset.id, currentValue: parsed.amount.toString() });
      setManualValue("");
    }
  }

  return (
    <>
      {isForeign ? (
        <>
          <MoneyDisplay
            amount={toBase(Number(asset.currentValue), asset.currency)}
            currency={baseCurrency}
            className="text-3xl font-bold"
          />
          <p className="text-sm text-muted-foreground tabular-nums">
            <MoneyDisplay
              amount={Number(asset.currentValue)}
              currency={asset.currency}
            />
          </p>
        </>
      ) : (
        <MoneyDisplay
          amount={Number(asset.currentValue)}
          currency={baseCurrency}
          className="text-3xl font-bold"
        />
      )}

      {hasQtyPrice && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {Number(asset.quantity).toLocaleString()} x{" "}
          <MoneyDisplay
            amount={Number(asset.currentPrice)}
            currency={asset.currency}
          />
        </p>
      )}

      <AssetSparkline assetId={asset.id} />

      <form onSubmit={handleValueUpdate} className="flex gap-2">
        <Input
          placeholder="Update value..."
          value={manualValue}
          onChange={(e) => setManualValue(e.target.value)}
          type="text"
          inputMode="decimal"
          className="flex-1"
        />
        <Button type="submit" size="sm">
          Update
        </Button>
      </form>
    </>
  );
}

function NotesTab({
  asset,
  updateAsset,
}: {
  asset: NonNullable<ReturnType<typeof findAssetInTree>>;
  updateAsset: ReturnType<typeof useUpdateAsset>;
}) {
  const [notes, setNotes] = useState(asset.notes ?? "");

  // Sync when asset changes externally
  useEffect(() => {
    setNotes(asset.notes ?? "");
  }, [asset.notes]);

  function handleBlur() {
    const trimmed = notes.trim();
    const current = asset.notes?.trim() ?? "";
    if (trimmed !== current) {
      updateAsset.mutate({ id: asset.id, notes: trimmed || null } as any);
    }
  }

  return (
    <Textarea
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      onBlur={handleBlur}
      placeholder="Add notes about this asset..."
      className="min-h-[120px]"
    />
  );
}

function SettingsTab({
  asset,
  updateAsset,
  archiveAsset,
  closeDetailPanel,
  onDeleteClick,
}: {
  asset: NonNullable<ReturnType<typeof findAssetInTree>>;
  updateAsset: ReturnType<typeof useUpdateAsset>;
  archiveAsset: ReturnType<typeof useArchiveAsset>;
  closeDetailPanel: () => void;
  onDeleteClick: () => void;
}) {
  const config = asset.providerConfig as Record<string, unknown> | null;

  return (
    <>
      <SettingRow label="Provider type">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="w-full justify-start" />
            }
          >
            {PROVIDER_LABELS[asset.providerType] ?? asset.providerType}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            <DropdownMenuRadioGroup
              value={asset.providerType}
              onValueChange={(v) =>
                updateAsset.mutate({ id: asset.id, providerType: v })
              }
            >
              {PROVIDER_TYPES.map((pt) => (
                <DropdownMenuRadioItem key={pt} value={pt}>
                  {PROVIDER_LABELS[pt]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingRow>

      {asset.providerType === "ticker" && (
        <SettingRow label="Ticker symbol">
          <BlurCommitInput
            value={(config?.ticker as string) ?? ""}
            onCommit={(ticker) =>
              updateAsset.mutate({
                id: asset.id,
                providerConfig: { ...config, ticker },
              } as any)
            }
            placeholder="e.g. AAPL"
          />
        </SettingRow>
      )}

      {asset.providerType === "plaid" && (
        <PlaidAssetSettings
          asset={asset}
          updateAsset={updateAsset}
        />
      )}

      <SettingRow label="Ownership %">
        <BlurCommitInput
          value={formatNumberForInput(asset.ownershipPct)}
          onCommit={(v) =>
            updateAsset.mutate({ id: asset.id, ownershipPct: v })
          }
          placeholder="100"
          inputMode="decimal"
        />
      </SettingRow>

      <SettingRow label="Stale days">
        <BlurCommitInput
          value={asset.staleDays != null ? String(asset.staleDays) : ""}
          onCommit={(v) => {
            const num = parseInt(v, 10);
            updateAsset.mutate({
              id: asset.id,
              staleDays: isNaN(num) ? null : num,
            } as any);
          }}
          placeholder="e.g. 30"
          inputMode="numeric"
        />
      </SettingRow>

      <SettingRow label="Cash equivalent">
        <Button
          variant={asset.isCashEquivalent ? "default" : "outline"}
          size="sm"
          onClick={() =>
            updateAsset.mutate({
              id: asset.id,
              isCashEquivalent: !asset.isCashEquivalent,
            })
          }
        >
          {asset.isCashEquivalent ? "Yes" : "No"}
        </Button>
      </SettingRow>

      <SettingRow label="Investable">
        <Button
          variant={asset.isInvestable ? "default" : "outline"}
          size="sm"
          onClick={() =>
            updateAsset.mutate({
              id: asset.id,
              isInvestable: !asset.isInvestable,
            })
          }
        >
          {asset.isInvestable ? "Yes" : "No"}
        </Button>
      </SettingRow>

      <SettingRow label="Cost basis">
        <BlurCommitInput
          value={formatNumberForInput(asset.costBasis)}
          onCommit={(v) => {
            const parsed = parseCurrencyInput(v);
            updateAsset.mutate({
              id: asset.id,
              costBasis: parsed.amount ? parsed.amount.toString() : null,
            } as any);
          }}
          placeholder="0.00"
          inputMode="decimal"
        />
      </SettingRow>

      <div className="border-t pt-4 space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            archiveAsset.mutate({ id: asset.id });
            closeDetailPanel();
          }}
        >
          Archive
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={onDeleteClick}
        >
          Delete
        </Button>
      </div>
    </>
  );
}

function PlaidAssetSettings({
  asset,
  updateAsset,
}: {
  asset: NonNullable<ReturnType<typeof findAssetInTree>>;
  updateAsset: ReturnType<typeof useUpdateAsset>;
}) {
  const syncConnection = useSyncPlaidConnection();
  const connectionId = (asset.providerConfig as any)?.connectionId;

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
      <p className="text-xs font-medium text-muted-foreground">
        Synced via Plaid
      </p>
      {asset.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Last synced: {new Date(asset.lastSyncedAt).toLocaleString()}
        </p>
      )}
      <div className="flex gap-2">
        {connectionId && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => syncConnection.mutate(connectionId)}
            disabled={syncConnection.isPending}
          >
            {syncConnection.isPending ? "Syncing..." : "Sync Now"}
          </Button>
        )}
        <Button
          variant="outline"
          size="xs"
          onClick={() =>
            updateAsset.mutate({
              id: asset.id,
              providerType: "manual",
              providerConfig: {},
            } as any)
          }
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-muted-foreground shrink-0">{label}</label>
      <div className="w-40">{children}</div>
    </div>
  );
}

function AssetSparkline({ assetId }: { assetId: string }) {
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  }, []);

  const { data: snapshots, isLoading } = useAssetSnapshots(assetId, from);

  const chartData = useMemo(() => {
    if (!snapshots) return [];
    return [...snapshots].reverse().map((s) => ({ date: s.date, value: Number(s.value) }));
  }, [snapshots]);

  if (isLoading) return <Skeleton className="h-24" />;

  if (chartData.length < 2) {
    return (
      <div className="h-24 rounded-lg border border-dashed border-border/50 flex items-center justify-center text-xs text-muted-foreground">
        Not enough data
      </div>
    );
  }

  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--chart-net-worth)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  buy: "Buy",
  sell: "Sell",
  deposit: "Deposit",
  withdraw: "Withdraw",
};

function TransactionsTab({
  assetId,
  currency,
}: {
  assetId: string;
  currency: string;
}) {
  const { data: txns, isLoading } = useAssetTransactions(assetId);
  const createTransaction = useCreateTransaction(assetId);

  const [type, setType] = useState<"buy" | "sell" | "deposit" | "withdraw">("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [total, setTotal] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!total || !date) return;

    createTransaction.mutate(
      {
        type,
        quantity: quantity || undefined,
        price: price || undefined,
        total,
        date,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          setQuantity("");
          setPrice("");
          setTotal("");
          setNotes("");
          setDate(new Date().toISOString().split("T")[0]);
        },
      }
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3 border rounded-lg p-3 bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground">Add transaction</p>

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" className="w-full justify-start" />
                }
              >
                {TRANSACTION_TYPE_LABELS[type]}
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-40">
                <DropdownMenuRadioGroup
                  value={type}
                  onValueChange={(v) => setType(v as typeof type)}
                >
                  {(["buy", "sell", "deposit", "withdraw"] as const).map((t) => (
                    <DropdownMenuRadioItem key={t} value={t}>
                      {TRANSACTION_TYPE_LABELS[t]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Input
            placeholder="Quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            className="h-8 text-sm"
          />
          <Input
            placeholder="Price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="h-8 text-sm"
          />
          <Input
            placeholder="Total *"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            inputMode="decimal"
            required
            className="h-8 text-sm"
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="h-8 text-sm"
          />
          <Input
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="col-span-2 h-8 text-sm"
          />
        </div>

        <Button
          type="submit"
          size="sm"
          className="w-full"
          disabled={createTransaction.isPending}
        >
          {createTransaction.isPending ? "Adding..." : "Add"}
        </Button>
      </form>

      {isLoading ? (
        <Skeleton className="h-20" />
      ) : !txns || txns.length === 0 ? (
        <div className="h-20 rounded-lg border border-dashed border-border/50 flex items-center justify-center text-xs text-muted-foreground">
          No transactions yet
        </div>
      ) : (
        <div className="space-y-1">
          {txns.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}

function TransactionRow({
  tx,
  currency,
}: {
  tx: Transaction;
  currency: string;
}) {
  const isBuy = tx.type === "buy" || tx.type === "deposit";

  return (
    <div className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/50">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <Badge
            variant={isBuy ? "default" : "secondary"}
            className="text-[10px] px-1.5 py-0"
          >
            {TRANSACTION_TYPE_LABELS[tx.type]}
          </Badge>
          <span className="text-xs text-muted-foreground">{tx.date}</span>
        </div>
        {tx.quantity && tx.price && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {Number(tx.quantity).toLocaleString()} ×{" "}
            {Number(tx.price).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 8,
            })}{" "}
            {currency}
          </span>
        )}
        {tx.notes && (
          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
            {tx.notes}
          </span>
        )}
      </div>
      <span
        className={`tabular-nums font-medium text-sm ${isBuy ? "text-green-600" : "text-red-500"}`}
      >
        {isBuy ? "+" : "-"}
        {Number(tx.total).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}{" "}
        {currency}
      </span>
    </div>
  );
}

function BlurCommitInput({
  value: initialValue,
  onCommit,
  placeholder,
  inputMode,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  function handleBlur() {
    if (value.trim() !== initialValue) {
      onCommit(value.trim());
    }
  }

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      inputMode={inputMode}
      className="h-7 text-sm"
    />
  );
}
