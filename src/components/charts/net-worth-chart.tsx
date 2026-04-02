"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { usePortfolioSnapshots } from "@/hooks/use-snapshots";
import { formatChartDate, formatCompactCurrency } from "@/lib/chart-utils";
import { ChartEmpty } from "./chart-empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface NetWorthChartProps {
  portfolioId: string;
  from?: string;
  currency: string;
  className?: string;
  heightClassName?: string;
}

export function NetWorthChart({
  portfolioId,
  from,
  currency,
  className,
  heightClassName,
}: NetWorthChartProps) {
  const { data: snapshots, isLoading } = usePortfolioSnapshots(portfolioId, from);

  const chartData = useMemo(() => {
    if (!snapshots) return [];
    return [...snapshots]
      .reverse()
      .map((s) => ({ date: s.date, netWorth: Number(s.netWorth) }));
  }, [snapshots]);

  const containerClassName = cn(
    "h-[220px] w-full md:h-[320px]",
    heightClassName,
    className
  );

  if (isLoading) return <Skeleton className={containerClassName} />;
  if (chartData.length < 2) {
    return (
      <div className={containerClassName}>
        <ChartEmpty />
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-net-worth)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--chart-net-worth)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 6" />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v) => formatCompactCurrency(v, currency)}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={70}
          />
          <Tooltip content={<NetWorthTooltip currency={currency} />} />
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="var(--chart-net-worth)"
            strokeWidth={2.2}
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
    <div className="rounded-xl border border-border/80 bg-background/95 px-3 py-2 text-sm text-foreground shadow-lg">
      <p className="text-muted-foreground">{label ? formatChartDate(label) : ""}</p>
      <p className="font-medium">
        {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
          payload[0].value
        )}
      </p>
    </div>
  );
}
