"use client";

import { useState } from "react";
import type { Portfolio } from "@/hooks/use-portfolio";
import type { PortfolioSnapshot } from "@/hooks/use-snapshots";
import { getChangeFromSnapshots } from "@/lib/snapshot-utils";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { CashDetailSheet } from "./cash-detail-sheet";
import { ChangeIndicator } from "./change-indicator";
import { cn } from "@/lib/utils";

interface StatsCardsProps {
  portfolio: Portfolio;
  snapshots: PortfolioSnapshot[];
}

export function StatsCards({ portfolio, snapshots }: StatsCardsProps) {
  const { aggregates, currency, btcUsdRate } = portfolio;
  const [cashSheetOpen, setCashSheetOpen] = useState(false);

  const oneDayNetWorth = getChangeFromSnapshots(snapshots, "netWorth", 1);
  const oneYearNetWorth = getChangeFromSnapshots(snapshots, "netWorth", 365);

  return (
    <>
      <div className="grid gap-2 md:grid-cols-3">
        <NetWorthCard
          netWorth={aggregates.netWorth}
          cashOnHand={aggregates.cashOnHand}
          currency={currency}
          btcUsdRate={btcUsdRate}
          changeDay={oneDayNetWorth}
          changeYear={oneYearNetWorth}
          onCashClick={() => setCashSheetOpen(true)}
        />
        <SummaryCard
          label="Assets"
          value={aggregates.totalAssets}
          currency={currency}
          btcUsdRate={btcUsdRate}
          changeDay={getChangeFromSnapshots(snapshots, "totalAssets", 1)}
          changeYear={getChangeFromSnapshots(snapshots, "totalAssets", 365)}
        />
        <SummaryCard
          label="Debts"
          value={aggregates.totalDebts}
          currency={currency}
          btcUsdRate={btcUsdRate}
          changeDay={getChangeFromSnapshots(snapshots, "totalDebts", 1)}
          changeYear={getChangeFromSnapshots(snapshots, "totalDebts", 365)}
          invertColor
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
  cashOnHand,
  currency,
  btcUsdRate,
  changeDay,
  changeYear,
  onCashClick,
}: {
  netWorth: number;
  cashOnHand: number;
  currency: string;
  btcUsdRate?: number | null;
  changeDay?: ReturnType<typeof getChangeFromSnapshots>;
  changeYear?: ReturnType<typeof getChangeFromSnapshots>;
  onCashClick?: () => void;
}) {
  return (
    <div className={CARD_CLASS}>
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

      <button
        type="button"
        onClick={onCashClick}
        className="block w-full text-left rounded-sm transition-colors hover:opacity-80"
      >
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Cash
        </div>
        <div className="mt-1.5">
          <MoneyDisplay
            amount={cashOnHand}
            currency={currency}
            btcUsdRate={btcUsdRate}
            className="text-2xl font-normal tracking-[-0.015em] tabular-lining"
          />
        </div>
      </button>
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
}: {
  label: string;
  value: number;
  currency: string;
  btcUsdRate?: number | null;
  changeDay?: ReturnType<typeof getChangeFromSnapshots>;
  changeYear?: ReturnType<typeof getChangeFromSnapshots>;
  invertColor?: boolean;
  onClick?: () => void;
}) {
  const Element = onClick ? "button" : "div";

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
          className="text-hero font-normal tracking-[-0.015em] tabular-lining"
        />
      </div>
      <div className="mt-2 space-y-1">
        <ChangeIndicator
          change={changeDay ?? null}
          currency={currency}
          btcUsdRate={btcUsdRate}
          label="1 DAY"
          invertColor={invertColor}
        />
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
    </Element>
  );
}
