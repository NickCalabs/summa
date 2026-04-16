"use client";

import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  PackageOpenIcon,
  Loader2,
  PlusIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  Link2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "./confirm-dialog";
import { MoneyDisplay } from "./money-display";
import { useUIStore } from "@/stores/ui-store";
import { useCurrency } from "@/contexts/currency-context";
import { useOptionalDisplayCurrency } from "@/contexts/display-currency-context";
import { isAssetStale, isAssetAutoTracked } from "@/lib/portfolio-utils";
import { getCryptoSymbol } from "@/lib/crypto-utils";
import type { Asset, Section } from "@/hooks/use-portfolio";
import {
  useUpdateAsset,
  useArchiveAsset,
  useDeleteAsset,
  useMoveAsset,
  useReorderAssets,
} from "@/hooks/use-assets";

interface AssetTableProps {
  assets: Asset[];
  currency: string;
  btcUsdRate?: number | null;
  portfolioId: string;
  sectionId: string;
  sections: Section[];
  sheetType?: "assets" | "debts";
}

type EditField = "name" | "currentValue";
type EditingCell = { assetId: string; field: EditField };

function InlineInput({
  initialValue,
  onCommit,
  onCancel,
  align = "left",
  inputMode = "text",
}: {
  initialValue: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
  align?: "left" | "right";
  inputMode?: "text" | "decimal" | "numeric";
}) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function commit() {
    onCommit(value.trim());
  }

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        // Tab: allow default — blur fires commit via onBlur
      }}
      inputMode={inputMode}
      className={`w-full bg-background border border-ring rounded px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring ${
        align === "right" ? "text-right tabular-nums" : ""
      }`}
    />
  );
}

export function AssetTable({ assets, btcUsdRate, portfolioId, sectionId, sections, sheetType = "assets" }: AssetTableProps) {
  const openAddFlow = useUIStore((s) => s.openAddFlow);
  const openAccountDetail = useUIStore((s) => s.openAccountDetail);
  const router = useRouter();
  const { baseCurrency, toBase } = useCurrency();
  const dc = useOptionalDisplayCurrency();
  const displayCurrency = dc?.displayCurrency ?? "USD";
  const updateAsset = useUpdateAsset(portfolioId);
  const archiveAsset = useArchiveAsset(portfolioId);
  const deleteAsset = useDeleteAsset(portfolioId);
  const moveAsset = useMoveAsset(portfolioId);
  const reorderAssets = useReorderAssets(portfolioId);

  const valuesMasked = useUIStore((s) => s.valuesMasked);
  const hideDust = useUIStore((s) => s.hideDust);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    new Set()
  );

  const toggleExpand = useCallback((assetId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }, []);

  // Keep a stable ref to assets so commitEdit doesn't need assets in its deps
  const assetsRef = useRef(assets);
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  const sectionTotal = useMemo(
    () =>
      assets
        .filter((a) => !a.isArchived)
        .reduce(
          (sum, a) =>
            sum + toBase(Number(a.currentValue) * (Number(a.ownershipPct ?? 100) / 100), a.currency),
          0
        ),
    [assets, toBase]
  );

  const moveRow = useCallback(
    (assetId: string, direction: -1 | 1) => {
      const topLevel = assets.filter((a) => !a.isArchived);
      const idx = topLevel.findIndex((a) => a.id === assetId);
      if (idx < 0) return;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= topLevel.length) return;
      const reordered = [...topLevel];
      [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
      reorderAssets.mutate({
        items: reordered.map((a, i) => ({ id: a.id, sortOrder: i })),
      });
    },
    [assets, reorderAssets]
  );

  const startEdit = useCallback((assetId: string, field: EditField) => {
    setEditingCell({ assetId, field });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const commitEdit = useCallback(
    (assetId: string, field: EditField, rawValue: string) => {
      setEditingCell(null);
      const asset =
        assetsRef.current.find((a) => a.id === assetId) ??
        assetsRef.current
          .flatMap((a) => a.children ?? [])
          .find((c) => c.id === assetId);
      if (!asset) return;

      if (field === "name") {
        if (rawValue && rawValue !== asset.name) {
          updateAsset.mutate({ id: assetId, name: rawValue });
        }
      } else if (field === "currentValue") {
        const num = parseFloat(rawValue);
        if (isNaN(num) || rawValue === "") return;

        const hasQtyPrice = asset.quantity != null && asset.currentPrice != null;
        if (hasQtyPrice) {
          // Editing quantity in native units — recalculate value
          const newQty = num;
          const price = Number(asset.currentPrice);
          const newValue = (newQty * price).toFixed(2);
          if (newQty !== Number(asset.quantity)) {
            updateAsset.mutate({
              id: assetId,
              quantity: String(newQty),
              currentValue: newValue,
            });
          }
        } else {
          // Manual asset — edit currentValue directly in native currency
          if (num !== Number(asset.currentValue)) {
            updateAsset.mutate({ id: assetId, currentValue: String(num) });
          }
        }
      }
    },
    [updateAsset]
  );

  const columns = useMemo<ColumnDef<Asset>[]>(
    () => [
      {
        accessorKey: "name",
        header: sheetType === "debts" ? "DEBT" : "ASSET",
        cell: ({ row }) => {
          const asset = row.original;
          const isEditing =
            editingCell?.assetId === asset.id && editingCell?.field === "name";
          const stale = isAssetStale(asset);
          const isDisconnected =
            (asset.providerType === "plaid" ||
              asset.providerType === "simplefin") &&
            stale;
          const autoTracked = isAssetAutoTracked(asset.providerType);
          const showSyncBadge = autoTracked && !isDisconnected;
          const creditLimit =
            typeof asset.providerConfig?.creditLimit === "number"
              ? asset.providerConfig.creditLimit
              : null;
          const availableCredit =
            sheetType === "debts" && creditLimit != null
              ? Math.max(0, creditLimit - Number(asset.currentValue))
              : null;

          if (isEditing) {
            return (
              <InlineInput
                initialValue={asset.name}
                onCommit={(v) => commitEdit(asset.id, "name", v)}
                onCancel={cancelEdit}
              />
            );
          }

          const isNameSaving =
            updateAsset.isPending &&
            updateAsset.variables?.id === asset.id &&
            "name" in (updateAsset.variables ?? {});

          const isParent =
            asset.children && asset.children.length > 0 || (asset.childCount ?? 0) > 0;
          const isExpanded = expandedParents.has(asset.id);

          return (
            <div className="select-none flex items-center gap-1.5">
              {isParent && (
                <span
                  className="text-muted-foreground shrink-0 -ml-1 cursor-pointer"
                  onClick={() => toggleExpand(asset.id)}
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="size-4" />
                  ) : (
                    <ChevronRightIcon className="size-4" />
                  )}
                </span>
              )}
              <span
                className={`font-medium cursor-text hover:bg-muted/50 rounded px-1 -mx-1 ${
                  isDisconnected ? "italic text-muted-foreground" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit(asset.id, "name");
                }}
              >
                {asset.name}
              </span>
              {showSyncBadge && (
                <span
                  title="Auto-synced"
                  aria-label="Auto-synced"
                  className="shrink-0 leading-none"
                >
                  <Link2Icon className="size-3 text-muted-foreground/60 -rotate-45" />
                </span>
              )}
              {availableCredit != null && (
                <span
                  className="inline-block shrink-0 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-center text-[10px] leading-tight text-muted-foreground"
                  title={`${creditLimit?.toLocaleString()} ${asset.currency} limit`}
                >
                  <MoneyDisplay
                    amount={toBase(availableCredit, asset.currency)}
                    currency={baseCurrency}
                    btcUsdRate={btcUsdRate}
                    className="block font-medium tabular-nums text-foreground/80"
                  />
                  <span className="block text-[9px] tracking-[0.15em]">
                    AVAILABLE
                  </span>
                </span>
              )}
              {isParent && (
                <span
                  className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(asset.id);
                  }}
                >
                  {asset.children?.length ?? 0} holding
                  {(asset.children?.length ?? 0) !== 1 ? "s" : ""}
                </span>
              )}
              {isNameSaving && (
                <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
              )}
              {isDisconnected && (
                <div className="text-xs text-muted-foreground">
                  (disconnected)
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "currentValue",
        header: () => <div className="text-right">VALUE</div>,
        size: 130,
        cell: ({ row }) => {
          const asset = row.original;
          const isEditing =
            editingCell?.assetId === asset.id &&
            editingCell?.field === "currentValue";
          const ownershipPct = Number(asset.ownershipPct ?? 100);
          const isPartialOwnership = ownershipPct < 100;

          // For crypto assets, the quantity unit is BTC/ETH/etc. even though
          // asset.currency is "USD" (prices stored in USD)
          const cryptoSymbol = getCryptoSymbol(asset.providerConfig);
          const hasQtyPrice = asset.quantity != null && asset.currentPrice != null;
          // The unit the user edits in: crypto symbol for crypto, asset currency otherwise
          const quantityUnit = cryptoSymbol ?? asset.currency;

          if (isEditing) {
            const editValue = hasQtyPrice
              ? String(Number(asset.quantity))
              : String(Number(asset.currentValue));

            return (
              <div className="flex items-center gap-1 justify-end">
                <InlineInput
                  initialValue={editValue}
                  onCommit={(v) => commitEdit(asset.id, "currentValue", v)}
                  onCancel={cancelEdit}
                  align="right"
                  inputMode="decimal"
                />
                <span className="text-xs text-muted-foreground shrink-0">
                  {quantityUnit}
                </span>
              </div>
            );
          }

          const isValueSaving =
            updateAsset.isPending &&
            updateAsset.variables?.id === asset.id &&
            "currentValue" in (updateAsset.variables ?? {});

          // For crypto: the "native" unit is the crypto symbol, not asset.currency
          // For fiat: the native unit is asset.currency
          const effectiveNative = cryptoSymbol ?? asset.currency;
          const effectiveDisplay = displayCurrency === "sats" ? "BTC" : displayCurrency;
          const nativeMatchesDisplay = effectiveNative === effectiveDisplay;

          // For crypto assets, currentValue is already in USD (qty * usd_price)
          // For fiat foreign assets, convert to base
          const usdValue = cryptoSymbol
            ? Number(asset.currentValue)  // already USD
            : toBase(Number(asset.currentValue), asset.currency);

          // Build the quantity subtext (e.g., "0.032 BTC")
          const qtySubtext = hasQtyPrice
            ? `${Number(asset.quantity).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${quantityUnit}`
            : null;

          return (
            <div
              className="text-right tabular-nums cursor-text hover:bg-muted/50 rounded -mx-1 px-1 py-0.5 -my-0.5"
              onClick={() => startEdit(asset.id, "currentValue")}
            >
              <div className="flex items-center justify-end gap-1">
                {isValueSaving && (
                  <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
                )}
                {nativeMatchesDisplay ? (
                  // Native matches display — show primary value only
                  cryptoSymbol && qtySubtext ? (
                    // Crypto asset viewed in its own currency: show qty label
                    <span className="font-medium">
                      {valuesMasked ? `\u2022\u2022\u2022\u2022\u2022\u2022 ${quantityUnit}` : qtySubtext}
                    </span>
                  ) : (
                    <MoneyDisplay
                      amount={Number(asset.currentValue)}
                      currency={asset.currency}
                      className="font-medium"
                    />
                  )
                ) : (
                  // Native differs from display — main converted, subtext native
                  <div>
                    <MoneyDisplay
                      amount={usdValue}
                      currency={baseCurrency}
                      btcUsdRate={btcUsdRate}
                      className="font-medium"
                    />
                    <div className="text-xs text-muted-foreground">
                      {qtySubtext ? (
                        valuesMasked ? `\u2022\u2022\u2022\u2022\u2022\u2022 ${quantityUnit}` : qtySubtext
                      ) : (
                        <MoneyDisplay amount={Number(asset.currentValue)} currency={asset.currency} />
                      )}
                    </div>
                  </div>
                )}
              </div>
              {isPartialOwnership && (
                <div className="text-xs text-muted-foreground">
                  Owned {asset.ownershipPct}%{" · "}
                  <MoneyDisplay
                    amount={usdValue * (ownershipPct / 100)}
                    currency={baseCurrency}
                    btcUsdRate={btcUsdRate}
                  />
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        size: 40,
        cell: ({ row }) => {
          const asset = row.original;
          const otherSections = sections.filter((s) => s.id !== asset.sectionId);
          const nonArchived = assets.filter((a) => !a.isArchived);
          const rowIdx = nonArchived.findIndex((a) => a.id === asset.id);
          const canMoveUp = rowIdx > 0;
          const canMoveDown = rowIdx >= 0 && rowIdx < nonArchived.length - 1;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => openAccountDetail(portfolioId, asset.id)}
                >
                  Open account
                </DropdownMenuItem>
                {canMoveUp && (
                  <DropdownMenuItem onSelect={() => moveRow(asset.id, -1)}>
                    Move Up
                  </DropdownMenuItem>
                )}
                {canMoveDown && (
                  <DropdownMenuItem onSelect={() => moveRow(asset.id, 1)}>
                    Move Down
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => archiveAsset.mutate({ id: asset.id })}
                >
                  Archive
                </DropdownMenuItem>
                {otherSections.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      Move to section
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {otherSections.map((s) => (
                        <DropdownMenuItem
                          key={s.id}
                          onSelect={() =>
                            moveAsset.mutate({ id: asset.id, sectionId: s.id })
                          }
                        >
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteTarget(asset.id)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [
      baseCurrency,
      toBase,
      router,
      editingCell,
      startEdit,
      commitEdit,
      cancelEdit,
      updateAsset.isPending,
      updateAsset.variables,
      sections,
      portfolioId,
      archiveAsset,
      moveAsset,
      moveRow,
      sheetType,
      expandedParents,
      toggleExpand,
      valuesMasked,
    ]
  );

  // When the dust filter is on, hide rows whose current value (converted to
  // base) is under $1. Do the conversion with the same toBase() the render
  // path uses so decisions line up with displayed totals. For parents, also
  // strip dust children so an expanded parent doesn't show a long list of
  // ~$0 wallets.
  const visibleAssets = useMemo(() => {
    if (!hideDust) return assets;
    const THRESHOLD = 1;
    return assets
      .map((asset) => {
        if (asset.children && asset.children.length > 0) {
          const visibleChildren = asset.children.filter(
            (c) => Math.abs(toBase(Number(c.currentValue), c.currency)) >= THRESHOLD
          );
          return { ...asset, children: visibleChildren };
        }
        return asset;
      })
      .filter((asset) => {
        const baseValue = Math.abs(
          toBase(Number(asset.currentValue), asset.currency)
        );
        // Parents keep showing as long as any child survived the filter, even
        // if their computed total rounds under $1 (it won't, typically).
        if (asset.children && asset.children.length > 0) return true;
        return baseValue >= THRESHOLD;
      });
  }, [assets, hideDust, toBase]);

  const table = useReactTable({
    data: visibleAssets,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <PackageOpenIcon className="size-8 text-muted-foreground/40 mb-3" />
        <p className="font-medium text-sm mb-1">No assets yet</p>
        <p className="text-xs text-muted-foreground mb-4">
          Click below to add your first asset to this section
        </p>
        <Button size="sm" variant="outline" onClick={() => openAddFlow(sheetType, sectionId)}>
          <PlusIcon className="size-3.5" data-icon="inline-start" />
          Add Asset
        </Button>
      </div>
    );
  }

  const deleteTargetAsset =
    assets.find((a) => a.id === deleteTarget) ??
    assets.flatMap((a) => a.children ?? []).find((c) => c.id === deleteTarget);

  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="hidden md:table-row border-b border-border">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-left text-nano font-semibold uppercase tracking-upper text-muted-foreground"
                  style={{
                    width: header.column.columnDef.size
                      ? `${header.column.columnDef.size}px`
                      : undefined,
                  }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => {
            const asset = row.original;
            const stale = isAssetStale(asset);
            const isParent =
              (asset.children && asset.children.length > 0) ||
              (asset.childCount ?? 0) > 0;
            const isExpanded = expandedParents.has(asset.id);

            return (
              <React.Fragment key={row.id}>
                <tr
                  className={`border-b border-border transition-colors hover:bg-muted/35 ${
                    stale && asset.providerType !== "plaid"
                      ? "opacity-60"
                      : ""
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5 align-middle">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
                {isParent &&
                  isExpanded &&
                  asset.children?.map((child) => {
                    const ticker =
                      child.providerConfig &&
                      "ticker" in child.providerConfig
                        ? (child.providerConfig.ticker as string)
                        : null;
                    return (
                      <tr
                        key={child.id}
                        className="border-b border-border/60 transition-colors hover:bg-muted/25 bg-muted/5 cursor-pointer"
                        onClick={() =>
                          openAccountDetail(portfolioId, child.id)
                        }
                      >
                        <td className="pl-10 pr-4 py-2 align-middle">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{child.name}</span>
                            {ticker && (
                              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {ticker}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 align-middle text-right tabular-nums">
                          <MoneyDisplay
                            amount={Number(child.currentValue)}
                            currency={baseCurrency}
                            btcUsdRate={btcUsdRate}
                            className="text-sm"
                          />
                        </td>
                        <td className="px-4 py-2 align-middle" />
                      </tr>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-neutral-500 text-white">
            <td className="px-4 py-2.5">
              <button
                type="button"
                onClick={() => openAddFlow(sheetType, sectionId)}
                className="text-nano font-semibold uppercase tracking-upper text-white/70 hover:text-white transition-colors"
              >
                + Add {sheetType === "debts" ? "Debt" : "Asset"}
              </button>
            </td>
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
              <MoneyDisplay amount={sectionTotal} currency={baseCurrency} btcUsdRate={btcUsdRate} />
            </td>
            <td className="px-4 py-2.5" />
          </tr>
        </tfoot>
      </table>
    </div>

    <ConfirmDialog
      open={deleteTarget !== null}
      onOpenChange={(open) => {
        if (!open) setDeleteTarget(null);
      }}
      title="Delete asset"
      description={`Delete "${deleteTargetAsset?.name ?? "this asset"}"? This action cannot be undone.`}
      confirmLabel="Delete"
      variant="destructive"
      isPending={deleteAsset.isPending}
      onConfirm={() => {
        if (deleteTarget) {
          deleteAsset.mutate(
            { id: deleteTarget },
            { onSuccess: () => setDeleteTarget(null) }
          );
        }
      }}
    />
    </>
  );
}

function MoreHorizontalIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}
