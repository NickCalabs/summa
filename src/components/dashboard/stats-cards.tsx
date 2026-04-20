"use client";

import { useState } from "react";
import type { Portfolio } from "@/hooks/use-portfolio";
import type { PortfolioSnapshot } from "@/hooks/use-snapshots";
import { computeCAGR, getChangeFromSnapshots } from "@/lib/snapshot-utils";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { SlotNumber } from "@/components/ui/slot-digit";
import { CashDetailSheet } from "./cash-detail-sheet";
import { ChangeIndicator } from "./change-indicator";
import { cn } from "@/lib/utils";

interface StatsCardsProps {
  portfolio: Portfolio;
  snapshots: PortfolioSnapshot[];
  investableTotal: number;
}

export function StatsCards({
  portfolio,
  snapshots,
  investableTotal,
}: StatsCardsProps) {
  const { aggregates, currency, btcUsdRate } = portfolio;
  const [cashSheetOpen, setCashSheetOpen] = useState(false);

  const oneDayNetWorth = getChangeFromSnapshots(snapshots, "netWorth", 1);
  const oneYearNetWorth = getChangeFromSnapshots(snapshots, "netWorth", 365);
  const netWorthCagr = computeCAGR(snapshots, "netWorth");
  const investableCagr = computeCAGR(snapshots, "investableTotal");

  return (
    <>
      <div className="grid gap-2 md:grid-cols-3">
        <NetWorthCard
          netWorth={aggregates.netWorth}
          investableTotal={investableTotal}
          currency={currency}
          btcUsdRate={btcUsdRate}
          changeDay={oneDayNetWorth}
          changeYear={oneYearNetWorth}
          netWorthCagr={netWorthCagr}
          investableCagr={investableCagr}
          className="md:row-span-2"
        />
        <SummaryCard
          label="Assets"
          value={aggregates.totalAssets}
          currency={currency}
          btcUsdRate={btcUsdRate}
          changeDay={getChangeFromSnapshots(snapshots, "totalAssets", 1)}
          changeYear={getChangeFromSnapshots(snapshots, "totalAssets", 365)}
          animate
        />
        <SummaryCard
          label="Debts"
          value={aggregates.totalDebts}
          currency={currency}
          btcUsdRate={btcUsdRate}
          changeDay={getChangeFromSnapshots(snapshots, "totalDebts", 1)}
          changeYear={getChangeFromSnapshots(snapshots, "totalDebts", 365)}
          invertColor
          animate
        />
        <SummaryCard
          label="Cash on hand"
          value={aggregates.cashOnHand}
          currency={currency}
          btcUsdRate={btcUsdRate}
          onClick={() => setCashSheetOpen(true)}
          animate
        />
      </div>

      <CashDetailSheet
        open={cashSheetOpen}
        onOpenChange={setCashSheetOpen}
        portfolio={portfolio}
      />
    </>
  );
}

const CARD_CLASS =
  "rounded-card border border-border bg-card px-4 py-4 transition-colors";

function NetWorthCard({
  netWorth,
  investableTotal,
  currency,
  btcUsdRate,
  changeDay,
  changeYear,
  netWorthCagr,
  investableCagr,
  className,
}: {
  netWorth: number;
  investableTotal: number;
  currency: string;
  btcUsdRate?: number | null;
  changeDay?: ReturnType<typeof getChangeFromSnapshots>;
  changeYear?: ReturnType<typeof getChangeFromSnapshots>;
  netWorthCagr: number | null;
  investableCagr: number | null;
  className?: string;
}) {
  return (
    <div className={cn(CARD_CLASS, className)}>
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Net Worth
      </div>
      <div className="mt-1.5">
        <MoneyDisplay
          amount={netWorth}
          currency={currency}
          btcUsdRate={btcUsdRate}
          animate
          className="text-hero font-normal tracking-[-0.015em] tabular-lining"
        />
      </div>
      <div className="mt-2 space-y-1">
        <ChangeIndicator
          change={changeDay ?? null}
          currency={currency}
          btcUsdRate={btcUsdRate}
          label="1 DAY"
        />
        <ChangeIndicator
          change={changeYear ?? null}
          currency={currency}
          btcUsdRate={btcUsdRate}
          label="1 YEAR"
        />
      </div>

      <div className="my-4 h-px bg-border" />

      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Investable
      </div>
      <div className="mt-1.5">
        <MoneyDisplay
          amount={investableTotal}
          currency={currency}
          btcUsdRate={btcUsdRate}
          animate
          className="text-2xl font-normal tracking-[-0.015em] tabular-lining"
        />
      </div>

      {netWorthCagr != null && (
        <>
          <div className="my-4 h-px bg-border" />
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            CAGR · YTD
          </div>
          <div className="mt-2 space-y-1.5">
            <CagrRow label="Net Worth" value={netWorthCagr} />
            {investableCagr != null && (
              <CagrRow label="Investable" value={investableCagr} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CagrRow({ label, value }: { label: string; value: number }) {
  const formatted = `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <SlotNumber
        value={formatted}
        className={cn(
          "font-semibold tabular-nums",
          value >= 0 ? "text-positive" : "text-negative"
        )}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  currency,
  btcUsdRate,
  changeDay,
  changeYear,
  invertColor = false,
  onClick,
  animate,
}: {
  label: string;
  value: number;
  currency: string;
  btcUsdRate?: number | null;
  changeDay?: ReturnType<typeof getChangeFromSnapshots>;
  changeYear?: ReturnType<typeof getChangeFromSnapshots>;
  invertColor?: boolean;
  onClick?: () => void;
  animate?: boolean;
}) {
  const Element = onClick ? "button" : "div";
  const hasChanges = changeDay !== undefined || changeYear !== undefined;

  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        CARD_CLASS,
        "text-left",
        onClick && "hover:bg-muted/30"
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5">
        <MoneyDisplay
          amount={value}
          currency={currency}
          btcUsdRate={btcUsdRate}
          animate={animate}
          className="text-hero font-normal tracking-[-0.015em] tabular-lining"
        />
      </div>
      {hasChanges && (
        <div className="mt-2 space-y-1">
          {changeDay !== undefined && (
            <ChangeIndicator
              change={changeDay ?? null}
              currency={currency}
              btcUsdRate={btcUsdRate}
              label="1 DAY"
              invertColor={invertColor}
            />
          )}
          {changeYear !== undefined && (
            <ChangeIndicator
              change={changeYear ?? null}
              currency={currency}
              btcUsdRate={btcUsdRate}
              label="1 YEAR"
              invertColor={invertColor}
            />
          )}
        </div>
      )}
    </Element>
  );
}
