"use client";

import { cn } from "@/lib/utils";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import type { RecapChange, RecapMode } from "@/lib/recap-types";

interface RecapCellProps {
  value: number | null;
  change: RecapChange | null;
  showChange: boolean;
  mode: RecapMode;
  currency: string;
  btcUsdRate?: number | null;
}

export function RecapCell({
  value,
  change,
  showChange,
  mode,
  currency,
  btcUsdRate,
}: RecapCellProps) {
  if (value == null) {
    return (
      <td className="px-3 py-2 text-right text-muted-foreground/40">—</td>
    );
  }

  return (
    <td className="px-3 py-2 text-right align-top">
      <div>
        {mode === "allocation" ? (
          <span className="tabular-nums text-sm">
            {value.toFixed(1)}%
          </span>
        ) : (
          <MoneyDisplay
            amount={value}
            currency={currency}
            btcUsdRate={btcUsdRate}
            className="text-sm"
          />
        )}
      </div>
      {showChange && change && (
        <div
          className={cn(
            "text-xs tabular-nums mt-0.5",
            change.absolute > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : change.absolute < 0
                ? "text-red-600 dark:text-red-400"
                : "text-muted-foreground"
          )}
        >
          {change.absolute > 0 ? "+" : ""}
          {mode === "allocation"
            ? `${change.absolute.toFixed(1)}pp`
            : formatCompactChange(change.absolute)}
          {" · "}
          {change.percent > 0 ? "+" : ""}
          {change.percent.toFixed(1)}%
        </div>
      )}
    </td>
  );
}

function formatCompactChange(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
