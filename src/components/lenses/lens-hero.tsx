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

  const points = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((pt) => {
      let val = pt.value;
      if (btcUsdRate && dc.displayCurrency !== "USD") {
        val = dc.convert(val, btcUsdRate);
      }
      return val;
    });
  }, [data, btcUsdRate, dc]);

  const latest = points.length > 0 ? points[points.length - 1] : null;
  const earliest = points.length > 1 ? points[0] : null;
  const change = latest != null && earliest != null ? latest - earliest : null;
  const changePct =
    change != null && earliest && earliest !== 0
      ? (change / Math.abs(earliest)) * 100
      : null;

  if (isLoading) {
    return <Skeleton className="h-16 w-64" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        {latest != null ? (
          <>
            <MoneyDisplay
              amount={latest}
              currency={currency}
              btcUsdRate={btcUsdRate}
              className="text-3xl font-semibold tabular-nums"
            />
            {change != null && (
              <span
                className={cn(
                  "text-sm tabular-nums",
                  change > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : change < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                )}
              >
                {change > 0 ? "+" : ""}
                {dc.displayCurrency !== "USD"
                  ? dc.format(change)
                  : `$${change.toFixed(0)}`}
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
