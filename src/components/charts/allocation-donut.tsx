"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { DONUT_COLORS } from "@/lib/chart-utils";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { useUIStore } from "@/stores/ui-store";
import { ChartEmpty } from "./chart-empty";
import type { Portfolio } from "@/hooks/use-portfolio";

interface AllocationDonutProps {
  portfolio: Portfolio;
}

interface SliceEntry {
  name: string;
  value: number;
  sheetId: string;
}

export function AllocationDonut({ portfolio }: AllocationDonutProps) {
  const data = useMemo(() => {
    const entries: SliceEntry[] = [];
    for (const sheet of portfolio.sheets) {
      let total = 0;
      for (const section of sheet.sections) {
        for (const asset of section.assets) {
          if (!asset.isArchived) {
            total += Math.abs(Number(asset.currentValue));
          }
        }
      }
      if (total > 0) {
        entries.push({ name: sheet.name, value: total, sheetId: sheet.id });
      }
    }
    return entries;
  }, [portfolio.sheets]);

  if (data.length === 0) {
    return (
      <div className="h-[200px] md:h-[300px]">
        <ChartEmpty />
      </div>
    );
  }

  const grandTotal = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="h-[200px] md:h-[300px] relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="100%"
            paddingAngle={2}
            label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
            onClick={(_, index) => {
              const entry = data[index];
              if (entry) {
                useUIStore.getState().setActiveSheet(entry.sheetId);
              }
            }}
            className="cursor-pointer"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip currency={portfolio.currency} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <MoneyDisplay
          amount={grandTotal}
          currency={portfolio.currency}
          className="text-sm font-medium"
        />
      </div>
    </div>
  );
}

function DonutTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md border">
      <p className="text-muted-foreground">{name}</p>
      <p className="font-medium">
        {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value)}
      </p>
    </div>
  );
}
