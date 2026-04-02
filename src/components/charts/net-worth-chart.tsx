"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
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
        <AreaChart data={chartData} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-net-worth)" stopOpacity={0.24} />
              <stop offset="75%" stopColor="var(--chart-net-worth)" stopOpacity={0.08} />
              <stop offset="100%" stopColor="var(--chart-net-worth)" stopOpacity={0.01} />
            </linearGradient>
            <filter id="netWorthGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="0 0 0 0 0.384
                        0 0 0 0 0.525
                        0 0 0 0 1
                        0 0 0 0.18 0"
              />
            </filter>
          </defs>
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
            stroke="var(--chart-net-worth)"
            strokeWidth={3}
            fill="url(#netWorthGradient)"
            filter="url(#netWorthGlow)"
            dot={false}
            activeDot={{
              r: 5,
              stroke: "var(--background)",
              strokeWidth: 2,
              fill: "var(--chart-net-worth)",
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
