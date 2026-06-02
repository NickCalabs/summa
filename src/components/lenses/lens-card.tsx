"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PinOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { useRecapDrillDown } from "@/hooks/use-recap-drill-down";
import { useUpdateLens } from "@/hooks/use-update-lens";
import { useDisplayCurrency } from "@/contexts/display-currency-context";
import { getFromDate, formatChartDate } from "@/lib/chart-utils";
import { cn } from "@/lib/utils";
import type { Lens } from "@/hooks/use-lenses";

interface LensCardProps {
  lens: Lens;
  currency: string;
  btcUsdRate: number | null;
}

export function LensCard({ lens, currency, btcUsdRate }: LensCardProps) {
  const from = getFromDate("1Y");
  const { data, isLoading } = useRecapDrillDown(
    lens.portfolioId,
    lens.assetIds,
    from
  );
  const dc = useDisplayCurrency();
  const updateLens = useUpdateLens();

  // In BTC mode, use each day's pre-summed BTC amount so the line is stable
  // for BTC-only lenses (no daily wiggle from dividing by today's rate).
  // In USD mode, keep the historical "plot USD; format at render" path —
  // MoneyDisplay does its own conversion for the headline.
  const isBtcMode = dc.displayCurrency !== "USD";
  const satsFactor = dc.displayCurrency === "sats" ? 1e8 : 1;
  // In BTC/sats mode plot the BTC sum directly and drop any day that's missing
  // it. Falling back to the USD value here would mix scales and crush the line
  // toward the floor of the YAxis.
  const chartData = useMemo(() => {
    if (!data?.series) return [];
    if (isBtcMode) {
      return data.series
        .filter((pt) => pt.valueInBtc != null)
        .map((pt) => ({ date: pt.date, value: pt.valueInBtc! * satsFactor }));
    }
    return data.series.map((pt) => ({ date: pt.date, value: pt.value }));
  }, [data, isBtcMode, satsFactor]);
  const skipClientConvert = isBtcMode;

  // Headline always reads from the source-of-truth USD series — MoneyDisplay
  // is the only consumer that should be converting headline numbers.
  const latestUsd =
    data?.series && data.series.length > 0
      ? data.series[data.series.length - 1].value
      : null;
  const earliestUsd =
    data?.series && data.series.length > 1 ? data.series[0].value : null;
  const changeUsd =
    latestUsd != null && earliestUsd != null ? latestUsd - earliestUsd : null;
  const changePct =
    changeUsd != null && earliestUsd && earliestUsd !== 0
      ? (changeUsd / Math.abs(earliestUsd)) * 100
      : null;

  const handleUnpin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateLens.mutate({
      portfolioId: lens.portfolioId,
      lensId: lens.id,
      isPinned: false,
    });
  };

  return (
    <Link
      href={`/portfolio/${lens.portfolioId}/lens/${lens.id}`}
      className="group relative rounded-card border border-border bg-card p-4 space-y-2 block hover:border-foreground/20 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          {lens.color && (
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ backgroundColor: lens.color }}
              aria-hidden
            />
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-medium truncate">{lens.label}</h3>
            {latestUsd != null ? (
              <div className="mt-1 flex items-baseline gap-2">
                <MoneyDisplay
                  amount={latestUsd}
                  currency={currency}
                  btcUsdRate={btcUsdRate}
                  className="text-lg font-semibold"
                />
                {changeUsd != null && (
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      changeUsd > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : changeUsd < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                    )}
                  >
                    {changeUsd > 0 ? "+" : ""}
                    {changePct != null ? `${changePct.toFixed(1)}%` : ""}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">No data yet</p>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleUnpin}
          disabled={updateLens.isPending}
          aria-label="Unpin from dashboard"
        >
          <PinOffIcon className="size-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : chartData.length > 1 ? (
        <div className="h-24 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient
                  id={`lens-grad-${lens.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={lens.color ?? "var(--chart-1)"}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={lens.color ?? "var(--chart-1)"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                content={({ active, payload, label: tipLabel }) => {
                  if (!active || !payload?.[0]) return null;
                  const raw = payload[0].value as number;
                  const display =
                    !skipClientConvert &&
                    btcUsdRate &&
                    dc.displayCurrency !== "USD"
                      ? dc.convert(raw, btcUsdRate)
                      : raw;
                  return (
                    <div className="rounded-lg bg-popover px-2 py-1 text-xs ring-1 ring-border shadow-md">
                      <p className="text-muted-foreground">
                        {formatChartDate(tipLabel as string)}
                      </p>
                      <p className="font-medium tabular-nums">
                        {dc.displayCurrency !== "USD"
                          ? dc.format(display)
                          : `$${display.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={lens.color ?? "var(--chart-1)"}
                fill={`url(#lens-grad-${lens.id})`}
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
          Not enough data
        </div>
      )}
    </Link>
  );
}
