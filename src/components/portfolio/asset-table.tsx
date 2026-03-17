"use client";

import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "./money-display";
import type { Asset } from "@/hooks/use-portfolio";

interface AssetTableProps {
  assets: Asset[];
  sheetTotal: number;
  currency: string;
}

export function AssetTable({ assets, sheetTotal, currency }: AssetTableProps) {
  const columns = useMemo<ColumnDef<Asset>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
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
          const config = row.original as Asset & { providerConfig?: { ticker?: string } };
          return (
            <span className="text-muted-foreground text-xs font-mono">
              {(config as any).providerConfig?.ticker ?? "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
        size: 100,
        cell: ({ row }) => {
          const q = row.original.quantity;
          return (
            <span className="tabular-nums">
              {q != null ? Number(q).toLocaleString() : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "currentPrice",
        header: "Price",
        size: 100,
        cell: ({ row }) => {
          const p = row.original.currentPrice;
          return p != null ? (
            <MoneyDisplay amount={Number(p)} currency={currency} className="tabular-nums" />
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "currentValue",
        header: () => <div className="text-right">Value</div>,
        size: 130,
        cell: ({ row }) => (
          <div className="text-right">
            <MoneyDisplay
              amount={Number(row.original.currentValue)}
              currency={currency}
              className="tabular-nums font-medium"
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
    ],
    [sheetTotal, currency]
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
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr
              key={row.id}
              className={`border-b border-border/30 transition-colors hover:bg-muted/50 ${
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
  );
}
