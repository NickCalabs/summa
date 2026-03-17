"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Portfolio } from "@/hooks/use-portfolio";
import { DONUT_COLORS, formatCompactCurrency } from "@/lib/chart-utils";
import { ChartEmpty } from "@/components/charts/chart-empty";

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
    <div className="space-y-4">
      {assetSheets.length > 0 && (
        <HorizontalBar
          label="Assets"
          items={assetSheets}
          currency={currency}
        />
      )}
      {debtSheets.length > 0 && (
        <HorizontalBar
          label="Debts"
          items={debtSheets}
          currency={currency}
        />
      )}
    </div>
  );
}

function HorizontalBar({
  label,
  items,
  currency,
}: {
  label: string;
  items: SheetTotal[];
  currency: string;
}) {
  const total = items.reduce((sum, s) => sum + s.total, 0);

  // Build a single data row with each sheet as a separate key
  const dataRow: Record<string, number | string> = { name: label };
  for (const item of items) {
    dataRow[item.name] = item.total;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">
          {formatCompactCurrency(total, currency)}
        </span>
      </div>
      <div className="h-[48px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[dataRow]}
            layout="vertical"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              content={<AllocationTooltip items={items} currency={currency} />}
            />
            {items.map((item) => (
              <Bar
                key={item.name}
                dataKey={item.name}
                stackId="stack"
                radius={0}
              >
                <Cell fill={item.color} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
        {items.map((item) => (
          <span key={item.name} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            {item.name}: {formatCompactCurrency(item.total, currency)}
          </span>
        ))}
      </div>
    </div>
  );
}

function AllocationTooltip({
  active,
  payload,
  items,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  items: SheetTotal[];
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md border space-y-1">
      {payload.map((entry) => {
        const item = items.find((i) => i.name === entry.dataKey);
        return (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: item?.color }}
            />
            <span>{entry.dataKey}:</span>
            <span className="font-medium">
              {formatCompactCurrency(entry.value, currency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
