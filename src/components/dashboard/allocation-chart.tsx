"use client";

import { useMemo } from "react";
import type { Portfolio } from "@/hooks/use-portfolio";
import { DONUT_COLORS, formatCompactCurrency } from "@/lib/chart-utils";
import { ChartEmpty } from "@/components/charts/chart-empty";
import { cn } from "@/lib/utils";

interface AllocationChartProps {
  portfolio: Portfolio;
}

interface SheetTotal {
  name: string;
  total: number;
  color: string;
}

export function AllocationChart({ portfolio }: AllocationChartProps) {
  const { assetSheets, debtSheets } = useMemo(() => {
    const assets: SheetTotal[] = [];
    const debts: SheetTotal[] = [];

    portfolio.sheets.forEach((sheet, i) => {
      let total = 0;
      for (const section of sheet.sections) {
        for (const asset of section.assets) {
          if (!asset.isArchived) {
            total += Number(asset.currentValue);
          }
        }
      }
      if (total === 0) return;

      const entry: SheetTotal = {
        name: sheet.name,
        total,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      };

      if (sheet.type === "assets") assets.push(entry);
      else debts.push(entry);
    });

    return { assetSheets: assets, debtSheets: debts };
  }, [portfolio.sheets]);

  if (assetSheets.length === 0 && debtSheets.length === 0) {
    return (
      <div className="h-[160px]">
        <ChartEmpty />
      </div>
    );
  }

  const { currency } = portfolio;

  return (
    <div className="space-y-6">
      {assetSheets.length > 0 && (
        <StackedBar label="Assets" items={assetSheets} currency={currency} />
      )}
      {debtSheets.length > 0 && (
        <StackedBar label="Debts" items={debtSheets} currency={currency} />
      )}
    </div>
  );
}

function StackedBar({
  label,
  items,
  currency,
}: {
  label: string;
  items: SheetTotal[];
  currency: string;
}) {
  const total = items.reduce((sum, s) => sum + s.total, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">
          {formatCompactCurrency(total, currency)}
        </span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-8 w-full overflow-hidden rounded-md">
        {items.map((item) => {
          const pct = (item.total / total) * 100;
          return (
            <div
              key={item.name}
              className={cn(
                "relative h-full transition-all",
                "first:rounded-l-md last:rounded-r-md"
              )}
              style={{ width: `${pct}%`, backgroundColor: item.color }}
              title={`${item.name}: ${formatCompactCurrency(item.total, currency)}`}
            >
              {pct > 12 && (
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-white drop-shadow-sm truncate px-1">
                  {item.name}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {items.map((item) => (
          <span
            key={item.name}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="inline-block size-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: item.color }}
            />
            {item.name}: {formatCompactCurrency(item.total, currency)}
          </span>
        ))}
      </div>
    </div>
  );
}
