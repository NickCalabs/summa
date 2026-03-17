"use client";

import { useMemo, useState } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePortfolioSnapshots } from "@/hooks/use-snapshots";
import { computeInvestableTotal } from "@/lib/snapshot-utils";
import { getFromDate, type DateRangeKey } from "@/lib/chart-utils";
import { NetWorthChart } from "@/components/charts/net-worth-chart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsCards } from "./stats-cards";
import { AllocationChart } from "./allocation-chart";

interface DashboardViewProps {
  portfolioId: string;
  userName: string;
}

const DATE_RANGES: DateRangeKey[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];

export function DashboardView({ portfolioId, userName }: DashboardViewProps) {
  const { data: portfolio, isLoading, error } = usePortfolio(portfolioId);
  const { data: snapshots } = usePortfolioSnapshots(portfolioId, getFromDate("1Y"));
  const [chartRange, setChartRange] = useState<DateRangeKey>("1Y");

  const investableTotal = useMemo(
    () => (portfolio ? computeInvestableTotal(portfolio) : 0),
    [portfolio]
  );

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    );
  }

  if (error || !portfolio) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <p className="text-muted-foreground">Failed to load portfolio.</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <h1 className="text-2xl font-bold">Hello, {userName}</h1>

      <StatsCards
        portfolio={portfolio}
        snapshots={snapshots ?? []}
        investableTotal={investableTotal}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Net Worth</CardTitle>
          <div className="flex gap-1">
            {DATE_RANGES.map((range) => (
              <Button
                key={range}
                variant={chartRange === range ? "default" : "ghost"}
                size="sm"
                onClick={() => setChartRange(range)}
                className="h-7 px-2 text-xs"
              >
                {range}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <NetWorthChart
            portfolioId={portfolioId}
            from={getFromDate(chartRange)}
            currency={portfolio.currency}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <AllocationChart portfolio={portfolio} />
        </CardContent>
      </Card>
    </div>
  );
}
