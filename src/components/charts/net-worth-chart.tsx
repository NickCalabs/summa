"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  Line,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  YAxis,
} from "recharts";
import { usePortfolioSnapshots } from "@/hooks/use-snapshots";
import { formatChartDate } from "@/lib/chart-utils";
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
        <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.34} />
              <stop offset="72%" stopColor="#8b5cf6" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="color-mix(in srgb, var(--border) 78%, transparent)"
            strokeDasharray="0"
          />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            dy={10}
          />
          <Tooltip content={<NetWorthTooltip currency={currency} />} />
          <Area
            type="natural"
            dataKey="netWorth"
            stroke="none"
            fill="url(#netWorthGradient)"
            dot={false}
            activeDot={false}
          />
          <Line
            type="natural"
            dataKey="netWorth"
            stroke="#7c3aed"
            strokeWidth={2.5}
            dot={false}
            activeDot={{
              r: 4,
              stroke: "var(--background)",
              strokeWidth: 2,
              fill: "#7c3aed",
            }}
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
    <div className="rounded-xl border border-border/80 bg-background/95 px-3 py-2 text-sm text-foreground shadow-[0_10px_24px_rgba(15,23,42,0.10)]">
      <p className="text-muted-foreground">{label ? formatChartDate(label) : ""}</p>
      <p className="font-medium">
        {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
          payload[0].value
        )}
      </p>
    </div>
  );
}
