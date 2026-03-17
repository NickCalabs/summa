"use client";

import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { MoreHorizontalIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { MoneyDisplay } from "./money-display";
import { EditableCell } from "./editable-cell";
import { ConfirmDialog } from "./confirm-dialog";
import {
  useUpdateAsset,
  useArchiveAsset,
  useDeleteAsset,
  useMoveAsset,
} from "@/hooks/use-assets";
import { useUIStore } from "@/stores/ui-store";
import type { Asset, Section } from "@/hooks/use-portfolio";

interface AssetTableProps {
  assets: Asset[];
  sheetTotal: number;
  currency: string;
  portfolioId: string;
  sections: Section[];
}

export function AssetTable({
  assets,
  sheetTotal,
  currency,
  portfolioId,
  sections,
}: AssetTableProps) {
  const updateAsset = useUpdateAsset(portfolioId);
  const archiveAsset = useArchiveAsset(portfolioId);
  const deleteAsset = useDeleteAsset(portfolioId);
  const moveAsset = useMoveAsset(portfolioId);
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<Asset>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <button
            className="font-medium text-left hover:underline"
            onClick={() => openDetailPanel(row.original.id)}
          >
            {row.original.name}
          </button>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        size: 80,
        cell: ({ row }) => (
          <Badge variant="secondary" className="text-[10px]">
            {row.original.type}
          </Badge>
        ),
      },
      {
        id: "ticker",
        header: "Ticker",
        size: 80,
        cell: ({ row }) => {
          const config = row.original.providerConfig as
            | { ticker?: string }
            | null;
          return (
            <span className="text-muted-foreground text-xs font-mono">
              {config?.ticker ?? "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
        size: 100,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.quantity}
            onCommit={(quantity) =>
              updateAsset.mutate({ id: row.original.id, quantity })
            }
            type="number"
            formatDisplay={(v) => (
              <span className="tabular-nums">
                {v != null ? Number(v).toLocaleString() : "—"}
              </span>
            )}
          />
        ),
      },
      {
        accessorKey: "currentPrice",
        header: "Price",
        size: 120,
        cell: ({ row }) => {
          const asset = row.original;
          let freshnessBadge: React.ReactNode = null;
          if (asset.providerType === "ticker") {
            const isFresh =
              asset.lastSyncedAt &&
              Date.now() - new Date(asset.lastSyncedAt).getTime() <
                (asset.staleDays || 1) * 86_400_000;
            freshnessBadge = isFresh ? (
              <Badge variant="outline" className="text-[9px] ml-1">
                auto
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[9px] ml-1">
                stale
              </Badge>
            );
          }
          return (
            <span className="flex items-center">
              <EditableCell
                value={asset.currentPrice}
                onCommit={(currentPrice) =>
                  updateAsset.mutate({ id: asset.id, currentPrice })
                }
                type="currency"
                currency={currency}
                formatDisplay={(v) =>
                  v != null ? (
                    <MoneyDisplay
                      amount={Number(v)}
                      currency={currency}
                      className="tabular-nums"
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                }
              />
              {freshnessBadge}
            </span>
          );
        },
      },
      {
        accessorKey: "currentValue",
        header: () => <div className="text-right">Value</div>,
        size: 130,
        cell: ({ row }) => (
          <div className="text-right">
            <EditableCell
              value={row.original.currentValue}
              onCommit={(currentValue, parsedCurrency) => {
                const data: Record<string, string> = {
                  id: row.original.id,
                  currentValue,
                };
                if (parsedCurrency) data.currency = parsedCurrency;
                updateAsset.mutate(data as any);
              }}
              type="currency"
              currency={currency}
              formatDisplay={(v) => (
                <MoneyDisplay
                  amount={Number(v)}
                  currency={currency}
                  className="tabular-nums font-medium"
                />
              )}
            />
          </div>
        ),
      },
      {
        id: "allocation",
        header: () => <div className="text-right">Alloc.</div>,
        size: 70,
        cell: ({ row }) => {
          const value = Number(row.original.currentValue);
          const pct = sheetTotal > 0 ? (value / sheetTotal) * 100 : 0;
          return (
            <div className="text-right tabular-nums text-muted-foreground">
              {pct.toFixed(1)}%
            </div>
          );
        },
        meta: { hideBelow1024: true },
      },
      {
        id: "actions",
        size: 40,
        cell: ({ row }) => {
          const asset = row.original;
          const otherSections = sections.filter(
            (s) => s.id !== asset.sectionId
          );
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover/row:opacity-100"
                  />
                }
              >
                <MoreHorizontalIcon className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => openDetailPanel(asset.id)}
                >
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => archiveAsset.mutate({ id: asset.id })}
                >
                  Archive
                </DropdownMenuItem>
                {otherSections.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {otherSections.map((s) => (
                        <DropdownMenuItem
                          key={s.id}
                          onSelect={() =>
                            moveAsset.mutate({
                              id: asset.id,
                              sectionId: s.id,
                            })
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
      sheetTotal,
      currency,
      sections,
      updateAsset,
      archiveAsset,
      moveAsset,
      openDetailPanel,
    ]
  );

  const table = useReactTable({
    data: assets,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (assets.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No assets yet
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`px-3 py-2 text-left font-medium text-muted-foreground ${
                      (header.column.columnDef.meta as any)?.hideBelow1024
                        ? "hidden lg:table-cell"
                        : ""
                    }`}
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
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className={`group/row border-b border-border/30 transition-colors hover:bg-muted/50 ${
                  i % 2 === 1 ? "bg-muted/20" : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`px-3 py-2 ${
                      (cell.column.columnDef.meta as any)?.hideBelow1024
                        ? "hidden lg:table-cell"
                        : ""
                    }`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete asset"
        description="This asset will be permanently removed. This action cannot be undone."
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
