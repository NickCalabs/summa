"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { useRecapDrillDown } from "@/hooks/use-recap-drill-down";
import { useDisplayCurrency } from "@/contexts/display-currency-context";
import { getFromDate, type DateRangeKey } from "@/lib/chart-utils";
import { cn } from "@/lib/utils";

const RANGES: DateRangeKey[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];

interface LensHeroProps {
  portfolioId: string;
  assetIds: string[];
  currency: string;
  btcUsdRate: number | null;
  range?: DateRangeKey;
  onRangeChange?: (r: DateRangeKey) => void;
}

export function LensHero({
  portfolioId,
  assetIds,
  currency,
  btcUsdRate,
  range: rangeProp,
  onRangeChange,
}: LensHeroProps) {
  const [internalRange, setInternalRange] = useState<DateRangeKey>("1Y");
  const range = rangeProp ?? internalRange;
  const setRange = onRangeChange ?? setInternalRange;

  const from = getFromDate(range);
  const { data, isLoading } = useRecapDrillDown(portfolioId, assetIds, from);
  const dc = useDisplayCurrency();

  // Keep series in USD; MoneyDisplay handles BTC/sats conversion via
  // btcUsdRate. Pre-converting AND letting MoneyDisplay convert again
  // produces a divide-by-rate-twice bug.
  const pointsUsd = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((pt) => pt.value);
  }, [data]);

  const latestUsd = pointsUsd.length > 0 ? pointsUsd[pointsUsd.length - 1] : null;
  const earliestUsd = pointsUsd.length > 1 ? pointsUsd[0] : null;
  const changeUsd =
    latestUsd != null && earliestUsd != null ? latestUsd - earliestUsd : null;
  const changePct =
    changeUsd != null && earliestUsd && earliestUsd !== 0
      ? (changeUsd / Math.abs(earliestUsd)) * 100
      : null;

  if (isLoading) {
    return <Skeleton className="h-16 w-64" />;
  }

  // Convert change to display currency only at render time.
  const changeDisplay =
    changeUsd != null && btcUsdRate && dc.displayCurrency !== "USD"
      ? dc.convert(changeUsd, btcUsdRate)
      : changeUsd;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        {latestUsd != null ? (
          <>
            <MoneyDisplay
              amount={latestUsd}
              currency={currency}
              btcUsdRate={btcUsdRate}
              className="text-3xl font-semibold tabular-nums"
            />
            {changeUsd != null && changeDisplay != null && (
              <span
                className={cn(
                  "text-sm tabular-nums",
                  changeUsd > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : changeUsd < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                )}
              >
                {changeUsd > 0 ? "+" : ""}
                {dc.displayCurrency !== "USD"
                  ? dc.format(changeDisplay)
                  : `$${changeDisplay.toFixed(0)}`}
                {changePct != null && (
                  <>
                    {" "}
                    ({changePct > 0 ? "+" : ""}
                    {changePct.toFixed(1)}%)
                  </>
                )}
              </span>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">No data yet.</p>
        )}
      </div>

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
      </div>
    </div>
  );
}
