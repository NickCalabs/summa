"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { CheckIcon, PinIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecapDrillDown } from "@/hooks/use-recap-drill-down";
import { useDisplayCurrency } from "@/contexts/display-currency-context";
import { useDashboardPins } from "@/hooks/use-dashboard-pins";
import { useCreateDashboardPin } from "@/hooks/use-create-dashboard-pin";
import { useDeleteDashboardPin } from "@/hooks/use-delete-dashboard-pin";
import {
  getFromDate,
  formatChartDate,
  formatCompactDisplayCurrency,
  type DateRangeKey,
} from "@/lib/chart-utils";
import { cn } from "@/lib/utils";

interface RecapDrillDownProps {
  portfolioId: string;
  assetIds: string[];
  label: string;
  currency: string;
  btcUsdRate: number | null;
  open: boolean;
  onClose: () => void;
}

const RANGES: DateRangeKey[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];

export function RecapDrillDown({
  portfolioId,
  assetIds,
  label,
  currency,
  btcUsdRate,
  open,
  onClose,
}: RecapDrillDownProps) {
  const [range, setRange] = useState<DateRangeKey>("1Y");
  const from = getFromDate(range);
  const { data, isLoading } = useRecapDrillDown(portfolioId, assetIds, from);
  const dc = useDisplayCurrency();

  const { data: pins } = useDashboardPins(portfolioId);
  const createPin = useCreateDashboardPin();
  const deletePin = useDeleteDashboardPin();

  // A pin "matches" this drill-down if its asset set is identical, regardless
  // of order. Used to switch the button between Pin / Unpin.
  const matchingPin = useMemo(() => {
    if (!pins) return null;
    const sorted = [...assetIds].sort().join(",");
    return pins.find((p) => [...p.assetIds].sort().join(",") === sorted) ?? null;
  }, [pins, assetIds]);

  const togglePin = () => {
    if (matchingPin) {
      deletePin.mutate({ portfolioId, pinId: matchingPin.id });
    } else {
      createPin.mutate({ portfolioId, label, assetIds });
    }
  };

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
  const totalChange =
    latest != null && earliest != null ? latest - earliest : null;
  const totalChangePct =
    totalChange != null && earliest && earliest !== 0
      ? (totalChange / Math.abs(earliest)) * 100
      : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          {latest != null && (
            <div className="flex items-baseline gap-3 mt-1">
              <MoneyDisplay
                amount={latest}
                currency={currency}
                btcUsdRate={btcUsdRate}
                className="text-xl font-semibold"
              />
              {totalChange != null && (
                <span
                  className={cn(
                    "text-sm tabular-nums",
                    totalChange > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : totalChange < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                  )}
                >
                  {totalChange > 0 ? "+" : ""}
                  {dc.displayCurrency !== "USD"
                    ? dc.format(totalChange)
                    : `$${totalChange.toFixed(0)}`}
                  {totalChangePct != null && (
                    <> ({totalChangePct > 0 ? "+" : ""}{totalChangePct.toFixed(1)}%)</>
                  )}
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <Button
              key={r}
              variant={r === range ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}

          <Button
            variant={matchingPin ? "default" : "outline"}
            size="sm"
            className="ml-auto h-6 px-2 text-xs gap-1"
            onClick={togglePin}
            disabled={createPin.isPending || deletePin.isPending}
          >
            {matchingPin ? (
              <>
                <CheckIcon className="size-3" />
                Pinned
              </>
            ) : (
              <>
                <PinIcon className="size-3" />
                Add to dashboard
              </>
            )}
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : chartData.length > 1 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="recapGrad" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#recapGrad)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Not enough data to display a chart.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
