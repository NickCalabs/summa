"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePortfolioSnapshots } from "@/hooks/use-snapshots";
import {
  computeInvestableTotal,
  getChangeFromSnapshots,
} from "@/lib/snapshot-utils";
import { getFromDate, type DateRangeKey } from "@/lib/chart-utils";
import { NetWorthChart } from "@/components/charts/net-worth-chart";
import { AssetsDebtsChart } from "@/components/charts/assets-debts-chart";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { buttonVariants, Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsCards } from "./stats-cards";
import { AllocationChart } from "./allocation-chart";
import { ChangeIndicator } from "./change-indicator";
import { RecapSankeyChart } from "./recap-sankey-chart";
import { CagrCard } from "./cagr-card";
import { cn } from "@/lib/utils";

interface DashboardViewProps {
  portfolioId: string;
  userName: string;
}

const DATE_RANGES: DateRangeKey[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];

export function DashboardView({ portfolioId, userName }: DashboardViewProps) {
  const { data: portfolio, isLoading, error } = usePortfolio(portfolioId);
  const { data: recapSnapshots = [] } = usePortfolioSnapshots(
    portfolioId,
    getFromDate("1Y")
  );
  const [chartRange, setChartRange] = useState<DateRangeKey>("1Y");

  const investableTotal = useMemo(
    () => (portfolio ? computeInvestableTotal(portfolio) : 0),
    [portfolio]
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-8 p-6 md:p-8">
        <Skeleton className="h-[640px] rounded-[32px]" />
        <Skeleton className="h-[420px] rounded-[32px]" />
      </div>
    );
  }

  if (error || !portfolio) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">Failed to load portfolio.</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  const isEmpty =
    portfolio.aggregates.totalAssets === 0 &&
    portfolio.aggregates.totalDebts === 0;

  if (isEmpty) {
    return (
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(98,136,255,0.14),transparent_42%),radial-gradient(circle_at_top_right,rgba(111,167,255,0.10),transparent_34%)]" />

        <div className="relative mx-auto max-w-7xl p-6 md:p-8">
          <section className="overflow-hidden rounded-[32px] border border-border/70 bg-background/90 shadow-[0_1px_0_rgba(255,255,255,0.45)] backdrop-blur">
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <p className="text-2xl font-semibold tracking-tight mb-2">
                Hi, {userName}
              </p>
              <p className="text-sm text-muted-foreground max-w-md mb-8">
                Here&apos;s where you&apos;ll see your portfolio overview. Add your
                first assets to get started.
              </p>
              <Link
                href={`/portfolio/${portfolioId}`}
                className={buttonVariants({ size: "lg", className: "gap-1.5" })}
              >
                Add Assets
                <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const oneDayNetWorth = getChangeFromSnapshots(recapSnapshots, "netWorth", 1);
  const oneYearNetWorth = getChangeFromSnapshots(recapSnapshots, "netWorth", 365);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(98,136,255,0.14),transparent_42%),radial-gradient(circle_at_top_right,rgba(111,167,255,0.10),transparent_34%)]" />

      <div className="relative mx-auto max-w-7xl space-y-8 p-6 md:p-8">
        <section className="overflow-hidden rounded-[32px] border border-border/70 bg-background/90 shadow-[0_1px_0_rgba(255,255,255,0.45)] backdrop-blur">
          <div className="space-y-8 p-6 md:p-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Recap
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Net worth first, with the balance-sheet flow condensed into a
                    single recap below it.
                  </p>
                </div>

                <div className="space-y-3">
                  <MoneyDisplay
                    amount={portfolio.aggregates.netWorth}
                    currency={portfolio.currency}
                    className="text-4xl font-semibold tracking-tight sm:text-5xl xl:text-6xl"
                  />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <ChangeIndicator
                      change={oneDayNetWorth}
                      currency={portfolio.currency}
                      label="1D"
                    />
                    <ChangeIndicator
                      change={oneYearNetWorth}
                      currency={portfolio.currency}
                      label="1Y"
                    />
                    <span className="text-muted-foreground">
                      Base currency {portfolio.currency}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start gap-3 xl:items-end">
                <p className="text-sm text-muted-foreground">Hi, {userName}</p>
                <Link
                  href={`/portfolio/${portfolioId}`}
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                    className: "gap-1.5",
                  })}
                >
                  Open Assets & Debts
                  <ArrowRightIcon className="size-3.5" />
                </Link>
              </div>
            </div>

            <StatsCards
              portfolio={portfolio}
              snapshots={recapSnapshots}
            />

            <CagrCard snapshots={recapSnapshots} />

            <DashboardSurface
              title="Net worth history"
              description="Crisp net worth trend with quick range switches."
            >
              <div className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block size-2 rounded-full bg-[#7c3aed]" />
                      <span className="font-medium">
                        <MoneyDisplay
                          amount={portfolio.aggregates.netWorth}
                          currency={portfolio.currency}
                        />
                      </span>
                    </div>
                    <ChangeIndicator
                      change={oneDayNetWorth}
                      currency={portfolio.currency}
                      label="1D"
                    />
                    {investableTotal > 0 && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="inline-block size-2 rounded-full bg-[#a78bfa]" />
                        <span>
                          Investable{" "}
                          <MoneyDisplay
                            amount={investableTotal}
                            currency={portfolio.currency}
                          />
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {DATE_RANGES.map((range) => (
                      <button
                        key={range}
                        type="button"
                        onClick={() => setChartRange(range)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          chartRange === range
                            ? "border-foreground bg-foreground text-background"
                            : "border-border/70 text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>

                <NetWorthChart
                  portfolioId={portfolioId}
                  from={getFromDate(chartRange)}
                  currency={portfolio.currency}
                  heightClassName="h-[280px] md:h-[340px] xl:h-[390px]"
                />
              </div>
            </DashboardSurface>

            <DashboardSurface
              title="Assets vs debts over time"
              description="Stacked view of total assets and total debts. The gap between them is your net worth."
            >
              <AssetsDebtsChart
                portfolioId={portfolioId}
                from={getFromDate(chartRange)}
                currency={portfolio.currency}
              />
            </DashboardSurface>

            <DashboardSurface
              title="Recap Flow"
              description="Money flow from account groups into assets, debts, and net worth."
            >
              <RecapSankeyChart portfolio={portfolio} />
            </DashboardSurface>

            <DashboardSurface
              title="Balance Sheet Today"
              description="Ledger-style recap for the current balance sheet."
            >
              <div className="overflow-hidden rounded-2xl border border-border/70">
                <StatementRow
                  label="Net worth"
                  value={
                    <MoneyDisplay
                      amount={portfolio.aggregates.netWorth}
                      currency={portfolio.currency}
                    />
                  }
                />
                <StatementRow
                  label="Investable"
                  value={
                    <MoneyDisplay
                      amount={investableTotal}
                      currency={portfolio.currency}
                    />
                  }
                  detail={`${percentage(investableTotal, portfolio.aggregates.totalAssets)} of assets`}
                />
                <StatementRow
                  label="Assets"
                  value={
                    <MoneyDisplay
                      amount={portfolio.aggregates.totalAssets}
                      currency={portfolio.currency}
                    />
                  }
                />
                <StatementRow
                  label="Debts"
                  value={
                    <MoneyDisplay
                      amount={portfolio.aggregates.totalDebts}
                      currency={portfolio.currency}
                    />
                  }
                  detail={`${percentage(portfolio.aggregates.totalDebts, portfolio.aggregates.totalAssets)} of assets`}
                />
                <StatementRow
                  label="Cash"
                  value={
                    <MoneyDisplay
                      amount={portfolio.aggregates.cashOnHand}
                      currency={portfolio.currency}
                    />
                  }
                  detail={`${percentage(portfolio.aggregates.cashOnHand, portfolio.aggregates.totalAssets)} of assets`}
                  last
                />
              </div>
            </DashboardSurface>
          </div>
        </section>

        <section className="rounded-[32px] border border-border/70 bg-background/90 p-6 shadow-[0_1px_0_rgba(255,255,255,0.45)] backdrop-blur md:p-8">
          <div className="mb-6 space-y-1">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Allocation
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">
              Donut and report breakdowns
            </h2>
            <p className="text-sm text-muted-foreground">
              A quieter recap of where the portfolio is concentrated and where debt sits.
            </p>
          </div>
          <AllocationChart portfolio={portfolio} />
        </section>
      </div>
    </div>
  );
}

function DashboardSurface({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-border/70 bg-background/70 p-5 md:p-6">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StatementRow({
  label,
  value,
  detail,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3",
        !last && "border-b border-border/70"
      )}
    >
      <div>
        <div className="text-sm text-muted-foreground">{label}</div>
        {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
      </div>
      <div className="text-right font-medium tabular-nums">{value}</div>
    </div>
  );
}

function percentage(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${((value / total) * 100).toFixed(0)}%`;
}
