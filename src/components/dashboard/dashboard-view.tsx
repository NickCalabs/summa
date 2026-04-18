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
import { ToolbarActions } from "@/components/toolbar-actions";
import { cn } from "@/lib/utils";

interface DashboardViewProps {
  portfolioId: string;
  userName: string;
}

const DATE_RANGES: DateRangeKey[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];

export function DashboardView({ portfolioId, userName }: DashboardViewProps) {
  // Live polling on the dashboard — refetch every 30s so prices flow in
  // shortly after the crypto cron updates them. Pauses automatically when
  // the tab is hidden (refetchIntervalInBackground: false in the hook).
  const { data: portfolio, isLoading, error } = usePortfolio(portfolioId, {
    refetchInterval: 30_000,
  });
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
        <Skeleton className="h-[640px] rounded-card" />
        <Skeleton className="h-[420px] rounded-card" />
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
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-6">
          <section className="overflow-hidden rounded-card border border-border bg-card">
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

  // Compute most recent lastSyncedAt across all assets for the "synced N ago" label
  const lastSyncedAt = (() => {
    let latest: number | null = null;
    for (const sheet of portfolio.sheets) {
      for (const section of sheet.sections) {
        for (const asset of section.assets) {
          if (asset.lastSyncedAt) {
            const ts = new Date(asset.lastSyncedAt).getTime();
            if (latest == null || ts > latest) latest = ts;
          }
        }
      }
    }
    return latest != null ? new Date(latest) : null;
  })();

  return (
    <div className="relative">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-4 md:px-6 md:py-6">
        <div className="flex items-center justify-end gap-3">
          <ToolbarActions portfolioId={portfolioId} lastSyncedAt={lastSyncedAt} />
        </div>

        <div className="space-y-8">
          <p className="text-2xl font-semibold tracking-tight">
            Hi, {userName}
          </p>

          <StatsCards
            portfolio={portfolio}
            snapshots={recapSnapshots}
            investableTotal={investableTotal}
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
                          btcUsdRate={portfolio.btcUsdRate}
                          animate
                        />
                      </span>
                    </div>
                    <ChangeIndicator
                      change={oneDayNetWorth}
                      currency={portfolio.currency}
                      btcUsdRate={portfolio.btcUsdRate}
                      label="1 DAY"
                    />
                    {investableTotal > 0 && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="inline-block size-2 rounded-full bg-[#a78bfa]" />
                        <span>
                          Investable{" "}
                          <MoneyDisplay
                            amount={investableTotal}
                            currency={portfolio.currency}
                            btcUsdRate={portfolio.btcUsdRate}
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
                      btcUsdRate={portfolio.btcUsdRate}
                    />
                  }
                />
                <StatementRow
                  label="Investable"
                  value={
                    <MoneyDisplay
                      amount={investableTotal}
                      currency={portfolio.currency}
                      btcUsdRate={portfolio.btcUsdRate}
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
                      btcUsdRate={portfolio.btcUsdRate}
                    />
                  }
                />
                <StatementRow
                  label="Debts"
                  value={
                    <MoneyDisplay
                      amount={portfolio.aggregates.totalDebts}
                      currency={portfolio.currency}
                      btcUsdRate={portfolio.btcUsdRate}
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
                      btcUsdRate={portfolio.btcUsdRate}
                    />
                  }
                  detail={`${percentage(portfolio.aggregates.cashOnHand, portfolio.aggregates.totalAssets)} of assets`}
                  last
                />
              </div>
            </DashboardSurface>
        </div>

        <section className="md:rounded-card md:border md:border-border md:bg-card md:p-6 lg:md:p-8">
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
    <section className="md:rounded-card md:border md:border-border md:bg-card/50 md:p-6">
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
