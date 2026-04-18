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
import { useDisplayCurrency } from "@/contexts/display-currency-context";
import { formatChartDate } from "@/lib/chart-utils";
import { ChartEmpty } from "./chart-empty";
import { Skeleton } from "@/components/ui/skeleton";

interface AssetsDebtsChartProps {
  portfolioId: string;
  from?: string;
  currency: string;
  todayAssets?: number;
  todayDebts?: number;
  todayBtcUsdRate?: number | null;
}

export function AssetsDebtsChart({
  portfolioId,
  from,
  currency,
  todayAssets,
  todayDebts,
  todayBtcUsdRate,
}: AssetsDebtsChartProps) {
  const { data: snapshots, isLoading } = usePortfolioSnapshots(portfolioId, from);
  const { displayCurrency, convert, formatCompact: dcFormatCompact } = useDisplayCurrency();

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
          assets: convert(Number(s.totalAssets), rate),
          debts: convert(Number(s.totalDebts), rate),
        };
      });

    if (todayAssets != null && todayDebts != null) {
      const today = new Date().toISOString().slice(0, 10);
      const todayPoint = {
        date: today,
        assets: convert(todayAssets, todayBtcUsdRate ?? null),
        debts: convert(todayDebts, todayBtcUsdRate ?? null),
      };
      if (data.length > 0 && data[data.length - 1].date === today) {
        data[data.length - 1] = todayPoint;
      } else {
        data.push(todayPoint);
      }
    }

    return data;
  }, [snapshots, displayCurrency, convert, todayAssets, todayDebts, todayBtcUsdRate]);

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
            <linearGradient id="assetsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22C55E" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="debtsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
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
            tickFormatter={(v) => dcFormatCompact(v)}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={70}
          />
          <Tooltip content={<AssetsDebtsTooltip />} />
          <Area
            type="linear"
            dataKey="assets"
            stroke="#22C55E"
            strokeWidth={2}
            fill="url(#assetsGradient)"
          />
          <Area
            type="linear"
            dataKey="debts"
            stroke="#EF4444"
            strokeWidth={2}
            fill="url(#debtsGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function AssetsDebtsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  const { format: dcFormat } = useDisplayCurrency();
  if (!active || !payload?.length) return null;
  const fmt = (v: number) => dcFormat(v);
  return (
    <div className="rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md border">
      <p className="text-muted-foreground">{label ? formatChartDate(label) : ""}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="font-medium" style={{ color: p.color }}>
          {p.dataKey === "assets" ? "Assets" : "Debts"}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}
