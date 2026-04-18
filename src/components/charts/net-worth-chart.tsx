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
import { useDisplayCurrency } from "@/contexts/display-currency-context";
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
  /** Live net worth — appended/overwrites today's snapshot so the chart's
   *  last point matches the header aggregate instead of lagging behind the
   *  last midnight-UTC snapshot. */
  todayNetWorth?: number;
  todayInvestable?: number;
  todayBtcUsdRate?: number | null;
}

export function NetWorthChart({
  portfolioId,
  from,
  currency,
  className,
  heightClassName,
  todayNetWorth,
  todayInvestable,
  todayBtcUsdRate,
}: NetWorthChartProps) {
  const { data: snapshots, isLoading } = usePortfolioSnapshots(portfolioId, from);
  const { displayCurrency, convert } = useDisplayCurrency();

  const chartData = useMemo(() => {
    if (!snapshots) return [];
    const data = [...snapshots]
      .reverse()
      .filter((s) => {
        if (displayCurrency === "USD") return true;
        return s.btcUsdRate != null;
      })
      .map((s) => {
        const rate = s.btcUsdRate ? Number(s.btcUsdRate) : null;
        return {
          date: s.date,
          netWorth: convert(Number(s.netWorth), rate),
          investable:
            s.investableTotal != null
              ? convert(Number(s.investableTotal), rate)
              : null,
        };
      });

    if (todayNetWorth != null) {
      const today = new Date().toISOString().slice(0, 10);
      const todayPoint = {
        date: today,
        netWorth: convert(todayNetWorth, todayBtcUsdRate ?? null),
        investable:
          todayInvestable != null
            ? convert(todayInvestable, todayBtcUsdRate ?? null)
            : null,
      };
      if (data.length > 0 && data[data.length - 1].date === today) {
        data[data.length - 1] = todayPoint;
      } else {
        data.push(todayPoint);
      }
    }

    return data;
  }, [snapshots, displayCurrency, convert, todayNetWorth, todayInvestable, todayBtcUsdRate]);

  const hasInvestable = chartData.some((d) => d.investable != null);

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
            <linearGradient id="investableGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.18} />
              <stop offset="72%" stopColor="#a78bfa" stopOpacity={0.06} />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.01} />
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
          <Tooltip content={<NetWorthTooltip hasInvestable={hasInvestable} />} />
          <Area
            type="linear"
            dataKey="netWorth"
            stroke="none"
            fill="url(#netWorthGradient)"
            dot={false}
            activeDot={false}
          />
          <Line
            type="linear"
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
          {hasInvestable && (
            <>
              <Area
                type="linear"
                dataKey="investable"
                stroke="none"
                fill="url(#investableGradient)"
                dot={false}
                activeDot={false}
                connectNulls
              />
              <Line
                type="linear"
                dataKey="investable"
                stroke="#a78bfa"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
                activeDot={{
                  r: 3,
                  stroke: "var(--background)",
                  strokeWidth: 2,
                  fill: "#a78bfa",
                }}
              />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function NetWorthTooltip({
  active,
  payload,
  label,
  hasInvestable,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
  hasInvestable: boolean;
}) {
  const { format: dcFormat } = useDisplayCurrency();
  if (!active || !payload?.length) return null;

  const fmt = (v: number) => dcFormat(v);

  const netWorthEntry = payload.find((p) => p.dataKey === "netWorth");
  const investableEntry = payload.find(
    (p) => p.dataKey === "investable" && p.value != null
  );

  return (
    <div className="rounded-xl border border-border/80 bg-background/95 px-3 py-2 text-sm text-foreground shadow-[0_10px_24px_rgba(15,23,42,0.10)]">
      <p className="text-muted-foreground">{label ? formatChartDate(label) : ""}</p>
      {netWorthEntry && (
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-[#7c3aed]" />
          <span className="font-medium">{fmt(netWorthEntry.value)}</span>
        </div>
      )}
      {hasInvestable && investableEntry && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-[#a78bfa]" />
          <span>{fmt(investableEntry.value)}</span>
        </div>
      )}
    </div>
  );
}
