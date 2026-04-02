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
import { PackageOpenIcon, Loader2, PlusIcon } from "lucide-react";
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
import { isAssetStale } from "@/lib/portfolio-utils";
import type { Asset, Section } from "@/hooks/use-portfolio";
import {
  useUpdateAsset,
  useArchiveAsset,
  useDeleteAsset,
  useMoveAsset,
} from "@/hooks/use-assets";

interface AssetTableProps {
  assets: Asset[];
  currency: string;
  portfolioId: string;
  sectionId: string;
  sections: Section[];
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

export function AssetTable({ assets, portfolioId, sectionId, sections }: AssetTableProps) {
  const openAddAssetDialog = useUIStore((s) => s.openAddAssetDialog);
  const router = useRouter();
  const { baseCurrency, toBase } = useCurrency();
  const updateAsset = useUpdateAsset(portfolioId);
  const archiveAsset = useArchiveAsset(portfolioId);
  const deleteAsset = useDeleteAsset(portfolioId);
  const moveAsset = useMoveAsset(portfolioId);

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Keep a stable ref to assets so commitEdit doesn't need assets in its deps
  const assetsRef = useRef(assets);
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  const sectionTotal = useMemo(
    () =>
      assets
        .filter((a) => !a.isArchived)
        .reduce((sum, a) => sum + toBase(Number(a.currentValue), a.currency), 0),
    [assets, toBase]
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
      const asset = assetsRef.current.find((a) => a.id === assetId);
      if (!asset) return;

      if (field === "name") {
        if (rawValue && rawValue !== asset.name) {
          updateAsset.mutate({ id: assetId, name: rawValue });
        }
      } else if (field === "currentValue") {
        const num = parseFloat(rawValue);
        if (!isNaN(num) && rawValue !== "" && num !== Number(asset.currentValue)) {
          updateAsset.mutate({ id: assetId, currentValue: String(num) });
        }
      }
    },
    [updateAsset]
  );

  const columns = useMemo<ColumnDef<Asset>[]>(
    () => [
      {
        accessorKey: "name",
        header: "ASSET",
        cell: ({ row }) => {
          const asset = row.original;
          const isEditing =
            editingCell?.assetId === asset.id && editingCell?.field === "name";
          const stale = isAssetStale(asset);
          const isDisconnected = asset.providerType === "plaid" && stale;

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

          return (
            <div
              className="select-none flex items-center gap-1.5"
              onClick={() => {
                if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
                clickTimerRef.current = setTimeout(
                  () => router.push(`/portfolio/${portfolioId}/asset/${asset.id}`),
                  200
                );
              }}
              onDoubleClick={() => {
                if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
                startEdit(asset.id, "name");
              }}
            >
              <span
                className={`font-medium cursor-pointer ${
                  isDisconnected ? "italic text-muted-foreground" : ""
                }`}
              >
                {asset.name}
              </span>
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
          const isForeign = asset.currency !== baseCurrency;
          const ownershipPct = Number(asset.ownershipPct ?? 100);
          const isPartialOwnership = ownershipPct < 100;

          if (isEditing) {
            return (
              <InlineInput
                initialValue={String(Number(asset.currentValue))}
                onCommit={(v) => commitEdit(asset.id, "currentValue", v)}
                onCancel={cancelEdit}
                align="right"
                inputMode="decimal"
              />
            );
          }

          const isValueSaving =
            updateAsset.isPending &&
            updateAsset.variables?.id === asset.id &&
            "currentValue" in (updateAsset.variables ?? {});


          return (
            <div
              className="text-right tabular-nums cursor-text hover:bg-muted/50 rounded -mx-1 px-1 py-0.5 -my-0.5"
              onClick={() => startEdit(asset.id, "currentValue")}
            >
              <div className="flex items-center justify-end gap-1">
                {isValueSaving && (
                  <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
                )}
                {isForeign ? (
                  <>
                    <MoneyDisplay
                      amount={toBase(Number(asset.currentValue), asset.currency)}
                      currency={baseCurrency}
                      className="font-medium"
                    />
                    <div className="text-xs text-muted-foreground">
                      <MoneyDisplay
                        amount={Number(asset.currentValue)}
                        currency={asset.currency}
                      />
                    </div>
                  </>
                ) : (
                  <MoneyDisplay
                    amount={Number(asset.currentValue)}
                    currency={baseCurrency}
                    className="font-medium"
                  />
                )}
              </div>
              {isPartialOwnership && (
                <div className="text-xs text-muted-foreground">
                  Owned {asset.ownershipPct}%{" · "}
                  <MoneyDisplay
                    amount={
                      toBase(Number(asset.currentValue), asset.currency) *
                      (ownershipPct / 100)
                    }
                    currency={baseCurrency}
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
                  onSelect={() => router.push(`/portfolio/${portfolioId}/asset/${asset.id}`)}
                >
                  Open account
                </DropdownMenuItem>
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
    ]
  );

  const table = useReactTable({
    data: assets,
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
        <Button size="sm" variant="outline" onClick={() => openAddAssetDialog(sectionId)}>
          <PlusIcon className="size-3.5" data-icon="inline-start" />
          Add Asset
        </Button>
      </div>
    );
  }

  const deleteTargetAsset = assets.find((a) => a.id === deleteTarget);

  return (
    <>
    <div className="overflow-x-auto border border-border/60 bg-background">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border/40">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-6 py-6 text-left text-[11px] font-medium tracking-[0.18em] text-muted-foreground"
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
            const stale = isAssetStale(row.original);
            return (
              <tr
                key={row.id}
                className={`border-b border-border/30 transition-colors hover:bg-muted/35 ${
                  i % 2 === 1 ? "bg-muted/10" : ""
                } ${
                  stale && row.original.providerType !== "plaid"
                    ? "opacity-60"
                    : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-3.5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border/50 bg-[#6a6a6a] text-white">
            <td className="px-6 py-3" />
            <td className="px-6 py-3 text-right font-medium tabular-nums">
              <MoneyDisplay amount={sectionTotal} currency={baseCurrency} />
            </td>
            <td className="px-6 py-3" />
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
