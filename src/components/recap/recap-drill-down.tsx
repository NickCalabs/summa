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
import { useLenses } from "@/hooks/use-lenses";
import { useCreateLens } from "@/hooks/use-create-lens";
import { useUpdateLens } from "@/hooks/use-update-lens";
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

  const { data: lenses } = useLenses(portfolioId);
  const createLens = useCreateLens();
  const updateLens = useUpdateLens();

  // A lens "matches" this drill-down if its asset set is identical, regardless
  // of order. Used to switch the button between Pin / Unpin.
  const matchingLens = useMemo(() => {
    if (!lenses) return null;
    const sorted = [...assetIds].sort().join(",");
    return lenses.find((p) => [...p.assetIds].sort().join(",") === sorted) ?? null;
  }, [lenses, assetIds]);

  const isPinned = matchingLens?.isPinned ?? false;

  const toggleLensPin = () => {
    if (matchingLens) {
      updateLens.mutate({
        portfolioId,
        lensId: matchingLens.id,
        isPinned: !matchingLens.isPinned,
      });
    } else {
      createLens.mutate({
        portfolioId,
        label,
        assetIds,
        isPinned: true,
      });
    }
  };

  // Chart data stays in USD; MoneyDisplay handles BTC/sats conversion via
  // btcUsdRate, and the chart's tickFormatter/tooltip convert at render
  // time. Pre-converting AND letting MoneyDisplay convert again caused a
  // divide-by-rate-twice bug in pinned cards and headlines.
  const chartData = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((pt) => ({ date: pt.date, value: pt.value }));
  }, [data]);

  const latestUsd = chartData.length > 0 ? chartData[chartData.length - 1].value : null;
  const earliestUsd = chartData.length > 1 ? chartData[0].value : null;
  const totalChangeUsd =
    latestUsd != null && earliestUsd != null ? latestUsd - earliestUsd : null;
  const totalChangePct =
    totalChangeUsd != null && earliestUsd && earliestUsd !== 0
      ? (totalChangeUsd / Math.abs(earliestUsd)) * 100
      : null;
  const totalChangeDisplay =
    totalChangeUsd != null && btcUsdRate && dc.displayCurrency !== "USD"
      ? dc.convert(totalChangeUsd, btcUsdRate)
      : totalChangeUsd;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          {latestUsd != null && (
            <div className="flex items-baseline gap-3 mt-1">
              <MoneyDisplay
                amount={latestUsd}
                currency={currency}
                btcUsdRate={btcUsdRate}
                className="text-xl font-semibold"
              />
              {totalChangeUsd != null && totalChangeDisplay != null && (
                <span
                  className={cn(
                    "text-sm tabular-nums",
                    totalChangeUsd > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : totalChangeUsd < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                  )}
                >
                  {totalChangeUsd > 0 ? "+" : ""}
                  {dc.displayCurrency !== "USD"
                    ? dc.format(totalChangeDisplay)
                    : `$${totalChangeDisplay.toFixed(0)}`}
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
            variant={isPinned ? "default" : "outline"}
            size="sm"
            className="ml-auto h-6 px-2 text-xs gap-1"
            onClick={toggleLensPin}
            disabled={createLens.isPending || updateLens.isPending}
          >
            {isPinned ? (
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
                  tickFormatter={(v: number) => {
                    const display =
                      btcUsdRate && dc.displayCurrency !== "USD"
                        ? dc.convert(v, btcUsdRate)
                        : v;
                    return formatCompactDisplayCurrency(
                      display,
                      dc.displayCurrency,
                      dc.formatCompact
                    );
                  }}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <Tooltip
                  content={({ active, payload, label: tipLabel }) => {
                    if (!active || !payload?.[0]) return null;
                    const usd = payload[0].value as number;
                    const display =
                      btcUsdRate && dc.displayCurrency !== "USD"
                        ? dc.convert(usd, btcUsdRate)
                        : usd;
                    return (
                      <div className="rounded-lg bg-popover px-3 py-2 text-sm ring-1 ring-border shadow-md">
                        <p className="text-muted-foreground text-xs">
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
