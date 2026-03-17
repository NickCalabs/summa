"use client";

import React, { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { PackageOpenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "./money-display";
import { useUIStore } from "@/stores/ui-store";
import { useCurrency } from "@/contexts/currency-context";
import { isAssetStale } from "@/lib/portfolio-utils";
import type { Asset } from "@/hooks/use-portfolio";

interface AssetTableProps {
  assets: Asset[];
  currency: string;
  portfolioId: string;
}

export function AssetTable({ assets }: AssetTableProps) {
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);
  const { baseCurrency, toBase } = useCurrency();

  const sectionTotal = useMemo(
    () =>
      assets
        .filter((a) => !a.isArchived)
        .reduce((sum, a) => sum + toBase(Number(a.currentValue), a.currency), 0),
    [assets, toBase]
  );

  const columns = useMemo<ColumnDef<Asset>[]>(
    () => [
      {
        accessorKey: "name",
        header: "ASSET",
        cell: ({ row }) => {
          const asset = row.original;
          const stale = isAssetStale(asset);
          const isDisconnected = asset.providerType === "plaid" && stale;
          return (
            <div
              className="cursor-pointer"
              onClick={() => openDetailPanel(asset.id)}
            >
              <span className={`font-medium ${isDisconnected ? "italic text-muted-foreground" : ""}`}>
                {asset.name}
              </span>
              {isDisconnected && (
                <div className="text-xs text-muted-foreground">(disconnected)</div>
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
          const isForeign = asset.currency !== baseCurrency;
          return (
            <div className="text-right tabular-nums">
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
          );
        },
      },
      {
        id: "detail",
        size: 40,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => openDetailPanel(row.original.id)}
          >
            <LinesIcon />
          </Button>
        ),
      },
    ],
    [baseCurrency, toBase, openDetailPanel]
  );

  const table = useReactTable({
    data: assets,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <PackageOpenIcon className="size-10 text-muted-foreground/50 mb-3" />
        <p className="font-medium text-sm">Add your first asset</p>
        <p className="text-xs text-muted-foreground mt-1">
          Click the &quot;Add&quot; button above to start tracking
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border/50">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 py-2 text-left font-medium text-muted-foreground text-xs tracking-wide"
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
                className={`border-b border-border/30 transition-colors hover:bg-muted/50 ${
                  i % 2 === 1 ? "bg-muted/20" : ""
                } ${stale && row.original.providerType !== "plaid" ? "opacity-60" : ""}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 border-t border-border/50">
            <td className="px-3 py-2" />
            <td className="px-3 py-2 text-right tabular-nums font-medium">
              <MoneyDisplay amount={sectionTotal} currency={baseCurrency} />
            </td>
            <td className="px-3 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function LinesIcon() {
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
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
