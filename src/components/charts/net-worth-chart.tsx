"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { usePortfolioSnapshots } from "@/hooks/use-snapshots";
import { formatChartDate, formatCompactCurrency } from "@/lib/chart-utils";
import { ChartEmpty } from "./chart-empty";
import { Skeleton } from "@/components/ui/skeleton";

interface NetWorthChartProps {
  portfolioId: string;
  from?: string;
  currency: string;
}

export function NetWorthChart({ portfolioId, from, currency }: NetWorthChartProps) {
  const { data: snapshots, isLoading } = usePortfolioSnapshots(portfolioId, from);

  const chartData = useMemo(() => {
    if (!snapshots) return [];
    return [...snapshots]
      .reverse()
      .map((s) => ({ date: s.date, netWorth: Number(s.netWorth) }));
  }, [snapshots]);

  if (isLoading) return <Skeleton className="h-[200px] md:h-[300px] w-full" />;
  if (chartData.length < 2) {
    return (
      <div className="h-[200px] md:h-[300px]">
        <ChartEmpty />
      </div>
    );
  }

  return (
    <div className="h-[200px] md:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v) => formatCompactCurrency(v, currency)}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={70}
          />
          <Tooltip content={<NetWorthTooltip currency={currency} />} />
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="#3B82F6"
            strokeWidth={2}
            fill="url(#netWorthGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function NetWorthTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md border">
      <p className="text-muted-foreground">{label ? formatChartDate(label) : ""}</p>
      <p className="font-medium">
        {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
          payload[0].value
        )}
      </p>
    </div>
  );
}
