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
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { useRecapDrillDown } from "@/hooks/use-recap-drill-down";
import { useDeleteLens } from "@/hooks/use-delete-lens";
import { useDisplayCurrency } from "@/contexts/display-currency-context";
import { getFromDate, formatChartDate } from "@/lib/chart-utils";
import { cn } from "@/lib/utils";
import type { Lens } from "@/hooks/use-lenses";

interface DashboardPinCardProps {
  pin: Lens;
  currency: string;
  btcUsdRate: number | null;
}

export function DashboardPinCard({
  pin,
  currency,
  btcUsdRate,
}: DashboardPinCardProps) {
  const from = getFromDate("1Y");
  const { data, isLoading } = useRecapDrillDown(pin.portfolioId, pin.assetIds, from);
  const dc = useDisplayCurrency();
  const deletePin = useDeleteLens();

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

  const latest = chartData.length > 0 ? chartData[chartData.length - 1].value : null;
  const earliest = chartData.length > 1 ? chartData[0].value : null;
  const change = latest != null && earliest != null ? latest - earliest : null;
  const changePct =
    change != null && earliest && earliest !== 0
      ? (change / Math.abs(earliest)) * 100
      : null;

  return (
    <div className="group relative rounded-card border border-border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium truncate">{pin.label}</h3>
          {latest != null ? (
            <div className="mt-1 flex items-baseline gap-2">
              <MoneyDisplay
                amount={latest}
                currency={currency}
                btcUsdRate={btcUsdRate}
                className="text-lg font-semibold"
              />
              {change != null && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    change > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : change < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                  )}
                >
                  {change > 0 ? "+" : ""}
                  {changePct != null ? `${changePct.toFixed(1)}%` : ""}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">No data yet</p>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => deletePin.mutate({ portfolioId: pin.portfolioId, lensId: pin.id })}
          disabled={deletePin.isPending}
          aria-label="Remove pin"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : chartData.length > 1 ? (
        <div className="h-24 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`pin-grad-${pin.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                content={({ active, payload, label: tipLabel }) => {
                  if (!active || !payload?.[0]) return null;
                  const v = payload[0].value as number;
                  return (
                    <div className="rounded-lg bg-popover px-2 py-1 text-xs ring-1 ring-border shadow-md">
                      <p className="text-muted-foreground">{formatChartDate(tipLabel as string)}</p>
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
                fill={`url(#pin-grad-${pin.id})`}
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
    </div>
  );
}
