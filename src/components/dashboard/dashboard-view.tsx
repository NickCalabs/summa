"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePortfolioSnapshots } from "@/hooks/use-snapshots";
import { computeInvestableTotal } from "@/lib/snapshot-utils";
import { getFromDate, type DateRangeKey } from "@/lib/chart-utils";
import { NetWorthChart } from "@/components/charts/net-worth-chart";
import { MoneyDisplay } from "@/components/portfolio/money-display";
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
      <section className="rounded-[28px] border border-border/70 bg-card px-6 py-6 shadow-sm md:px-8 md:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">
              Net Worth
            </p>
            <div className="space-y-2">
              <MoneyDisplay
                amount={portfolio.aggregates.netWorth}
                currency={portfolio.currency}
                className="text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl"
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span>
                  Investable{" "}
                  <span className="font-medium text-foreground">
                    <MoneyDisplay amount={investableTotal} currency={portfolio.currency} />
                  </span>
                </span>
                <span>
                  Assets{" "}
                  <span className="font-medium text-foreground">
                    <MoneyDisplay
                      amount={portfolio.aggregates.totalAssets}
                      currency={portfolio.currency}
                    />
                  </span>
                </span>
                <span>
                  Debts{" "}
                  <span className="font-medium text-foreground">
                    <MoneyDisplay
                      amount={portfolio.aggregates.totalDebts}
                      currency={portfolio.currency}
                    />
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <p className="text-sm text-muted-foreground">Hi, {userName}</p>
            <Button asChild size="sm">
              <Link href={`/portfolio/${portfolioId}`}>Open Assets & Debts</Link>
            </Button>
          </div>
        </div>
      </section>

      <StatsCards
        portfolio={portfolio}
        snapshots={snapshots ?? []}
        investableTotal={investableTotal}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Net Worth Trend</CardTitle>
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
          <CardTitle>Money Map</CardTitle>
        </CardHeader>
        <CardContent>
          <AllocationChart portfolio={portfolio} />
        </CardContent>
      </Card>
    </div>
  );
}
