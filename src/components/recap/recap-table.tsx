"use client";

import { useState, useCallback } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRecapContext } from "@/contexts/recap-context";
import { RecapCell } from "./recap-cell";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import type { RecapResponse, RecapGroupRow } from "@/lib/recap-types";

interface RecapTableProps {
  data: RecapResponse;
  btcUsdRate?: number | null;
}

export function RecapTable({ data, btcUsdRate }: RecapTableProps) {
  const { showChange, mode, openDrillDown } = useRecapContext();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(data.groups.filter((g) => g.key.startsWith("section:")).map((g) => g.key))
  );

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const topLevel = data.groups.filter((g) => g.parentKey === null);
  const childrenOf = (parentKey: string) =>
    data.groups.filter((g) => g.parentKey === parentKey);

  const formatColumnDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year:
        d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  };

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-sm border-collapse min-w-[600px]">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 z-10 bg-background px-4 py-2 text-left font-medium text-muted-foreground w-[200px] min-w-[200px]" />
            {data.columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap"
              >
                {formatColumnDate(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topLevel.map((group) => (
            <GroupRows
              key={group.key}
              group={group}
              childGroups={childrenOf(group.key)}
              expanded={expanded.has(group.key)}
              onToggle={() => toggleExpand(group.key)}
              onDrillDown={openDrillDown}
              columns={data.columns}
              showChange={showChange}
              mode={mode}
              currency={data.currency}
              btcUsdRate={btcUsdRate}
              depth={0}
            />
          ))}

          {/* Totals row */}
          <tr className="border-t-2 border-border font-semibold">
            <td className="sticky left-0 z-10 bg-background px-4 py-2 text-left">
              Net Total
            </td>
            {data.columns.map((col) => (
              <td key={col} className="px-3 py-2 text-right">
                {data.totals[col] != null ? (
                  <MoneyDisplay
                    amount={data.totals[col]}
                    currency={data.currency}
                    btcUsdRate={btcUsdRate}
                    className="text-sm font-semibold"
                  />
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  childGroups,
  expanded,
  onToggle,
  onDrillDown,
  columns,
  showChange,
  mode,
  currency,
  btcUsdRate,
  depth,
}: {
  group: RecapGroupRow;
  childGroups: RecapGroupRow[];
  expanded: boolean;
  onToggle: () => void;
  onDrillDown: (key: string, assetIds: string[], label: string) => void;
  columns: string[];
  showChange: boolean;
  mode: string;
  currency: string;
  btcUsdRate?: number | null;
  depth: number;
}) {
  const hasChildren = group.expandable && childGroups.length > 0;
  const isChild = depth > 0;

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/50 transition-colors hover:bg-muted/30",
          isChild && "bg-muted/10"
        )}
      >
        <td
          className={cn(
            "sticky left-0 z-10 bg-background px-4 py-2",
            isChild && "bg-muted/10"
          )}
          style={{ paddingLeft: `${16 + depth * 20}px` }}
        >
          <div className="flex items-center gap-1.5">
            {hasChildren && (
              <button
                onClick={onToggle}
                className="p-0.5 rounded hover:bg-muted"
              >
                <ChevronRightIcon
                  className={cn(
                    "size-3.5 transition-transform",
                    expanded && "rotate-90"
                  )}
                />
              </button>
            )}
            {!hasChildren && depth === 0 && (
              <span className="w-4" />
            )}
            <button
              onClick={() =>
                group.assetIds.length > 0 &&
                onDrillDown(group.key, group.assetIds, group.label)
              }
              disabled={group.assetIds.length === 0}
              className={cn(
                "text-left text-sm truncate max-w-[160px]",
                group.assetIds.length > 0 &&
                  "hover:underline cursor-pointer",
                isChild
                  ? "text-muted-foreground"
                  : "font-medium"
              )}
            >
              {group.label}
            </button>
          </div>
        </td>

        {columns.map((col) => (
          <RecapCell
            key={col}
            value={group.values[col] ?? null}
            change={group.changes[col] ?? null}
            showChange={showChange}
            mode={mode as "totals" | "allocation"}
            currency={currency}
            btcUsdRate={btcUsdRate}
          />
        ))}
      </tr>

      {hasChildren &&
        expanded &&
        childGroups.map((child) => (
          <GroupRows
            key={child.key}
            group={child}
            childGroups={[]}
            expanded={false}
            onToggle={() => {}}
            onDrillDown={onDrillDown}
            columns={columns}
            showChange={showChange}
            mode={mode}
            currency={currency}
            btcUsdRate={btcUsdRate}
            depth={depth + 1}
          />
        ))}
    </>
  );
}
