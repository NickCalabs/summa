"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecapDrillDown } from "@/hooks/use-recap-drill-down";
import { useDisplayCurrency } from "@/contexts/display-currency-context";
import {
  getFromDate,
  formatChartDate,
  formatCompactDisplayCurrency,
  type DateRangeKey,
} from "@/lib/chart-utils";

interface LensChartProps {
  portfolioId: string;
  assetIds: string[];
  currency: string;
  btcUsdRate: number | null;
  range?: DateRangeKey;
}

export function LensChart({
  portfolioId,
  assetIds,
  btcUsdRate,
  range = "1Y",
}: LensChartProps) {
  const from = getFromDate(range);
  const { data, isLoading } = useRecapDrillDown(portfolioId, assetIds, from);
  const dc = useDisplayCurrency();

  const chartData = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((pt) => {
      let val = pt.value;
      if (btcUsdRate && dc.displayCurrency !== "USD") {
        val = dc.convert(val, btcUsdRate);
      }
      return { date: pt.date, value: val };
    });
  }, [data, btcUsdRate, dc]);

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (chartData.length <= 1) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
        Not enough data to display a chart.
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="lensGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v: number) =>
              formatCompactDisplayCurrency(
                v,
                dc.displayCurrency,
                dc.formatCompact
              )
            }
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip
            content={({ active, payload, label: tipLabel }) => {
              if (!active || !payload?.[0]) return null;
              const v = payload[0].value as number;
              return (
                <div className="rounded-lg bg-popover px-3 py-2 text-sm ring-1 ring-border shadow-md">
                  <p className="text-muted-foreground text-xs">
                    {formatChartDate(tipLabel as string)}
                  </p>
                  <p className="font-medium tabular-nums">
                    {dc.displayCurrency !== "USD"
                      ? dc.format(v)
                      : `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--chart-1)"
            fill="url(#lensGrad)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
