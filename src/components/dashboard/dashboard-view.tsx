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
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { buttonVariants, Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsCards } from "./stats-cards";
import { AllocationChart } from "./allocation-chart";
import { ChangeIndicator } from "./change-indicator";
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

  const oneDayNetWorth = getChangeFromSnapshots(recapSnapshots, "netWorth", 1);
  const oneYearNetWorth = getChangeFromSnapshots(recapSnapshots, "netWorth", 365);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(98,136,255,0.14),transparent_42%),radial-gradient(circle_at_top_right,rgba(111,167,255,0.10),transparent_34%)]" />

      <div className="relative mx-auto max-w-7xl space-y-8 p-6 md:p-8">
        <section className="overflow-hidden rounded-[32px] border border-border/70 bg-background/90 shadow-[0_1px_0_rgba(255,255,255,0.45)] backdrop-blur">
          <div className="grid gap-8 p-6 md:p-8 xl:grid-cols-[minmax(0,1.35fr)_360px]">
            <div className="space-y-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                      Recap
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Massive net worth first, with the rest of the balance sheet
                      tucked underneath it.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <MoneyDisplay
                      amount={portfolio.aggregates.netWorth}
                      currency={portfolio.currency}
                      className="text-6xl font-semibold tracking-tight sm:text-7xl xl:text-8xl"
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

                <div className="flex flex-col items-start gap-3 lg:items-end">
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
                investableTotal={investableTotal}
              />

              <DashboardSurface
                title="Net worth history"
                description="Big chart first, with just enough controls to move quickly."
              >
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
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

                    <div className="flex flex-wrap gap-1">
                      {DATE_RANGES.map((range) => (
                        <button
                          key={range}
                          type="button"
                          onClick={() => setChartRange(range)}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                            chartRange === range
                              ? "bg-foreground text-background"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                    heightClassName="h-[320px] md:h-[380px] xl:h-[430px]"
                  />
                </div>
              </DashboardSurface>
            </div>

            <div className="space-y-6">
              <MoneyFlowSurface
                currency={portfolio.currency}
                netWorth={portfolio.aggregates.netWorth}
                assets={portfolio.aggregates.totalAssets}
                debts={portfolio.aggregates.totalDebts}
                investable={investableTotal}
                cash={portfolio.aggregates.cashOnHand}
              />

              <DashboardSurface
                title="Balance Sheet Today"
                description="Quiet ledger-style recap for the current balance sheet."
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

function MoneyFlowSurface({
  currency,
  netWorth,
  assets,
  debts,
  investable,
  cash,
}: {
  currency: string;
  netWorth: number;
  assets: number;
  debts: number;
  investable: number;
  cash: number;
}) {
  const base = Math.max(assets, netWorth, investable, cash, 1);

  return (
    <DashboardSurface
      title="Money Flow"
      description="How gross assets resolve into net worth and liquid capital."
    >
      <div className="space-y-4">
        <FlowRow
          label="Assets"
          value={assets}
          currency={currency}
          ratio={assets / base}
          tone="asset"
          detail="Gross balance sheet"
        />
        <FlowRow
          label="Less debts"
          value={debts}
          currency={currency}
          ratio={debts / base}
          tone="debt"
          detail="Liabilities pulling against assets"
        />
        <FlowRow
          label="Net worth"
          value={netWorth}
          currency={currency}
          ratio={netWorth / base}
          tone="net"
          detail="What remains after liabilities"
        />
        <FlowRow
          label="Investable"
          value={investable}
          currency={currency}
          ratio={investable / base}
          tone="investable"
          detail="Capital positioned for compounding"
        />
        <FlowRow
          label="Cash"
          value={cash}
          currency={currency}
          ratio={cash / base}
          tone="cash"
          detail="Immediate liquidity on hand"
        />
      </div>
    </DashboardSurface>
  );
}

function FlowRow({
  label,
  value,
  currency,
  ratio,
  tone,
  detail,
}: {
  label: string;
  value: number;
  currency: string;
  ratio: number;
  tone: "asset" | "debt" | "net" | "investable" | "cash";
  detail: string;
}) {
  const barClassName = {
    asset: "bg-slate-900 dark:bg-slate-100",
    debt: "bg-red-400",
    net: "bg-[var(--chart-net-worth)]",
    investable: "bg-[var(--chart-1)]",
    cash: "bg-[var(--chart-8)]",
  }[tone];

  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="text-right text-sm font-medium tabular-nums">
          <MoneyDisplay amount={value} currency={currency} />
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", barClassName)}
          style={{ width: `${Math.max(Math.min(ratio, 1) * 100, 4)}%` }}
        />
      </div>
    </div>
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
