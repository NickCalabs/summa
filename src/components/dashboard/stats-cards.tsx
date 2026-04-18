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

export function StatsCards({
  portfolio,
  snapshots,
}: StatsCardsProps) {
  const { aggregates, currency } = portfolio;
  const [cashSheetOpen, setCashSheetOpen] = useState(false);
  const assetBase = Math.max(aggregates.totalAssets, 1);

  return (
    <>
      <div className="grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 md:grid-cols-3">
        <SummaryCell
          label="Assets"
          value={aggregates.totalAssets}
          currency={currency}
          btcUsdRate={portfolio.btcUsdRate}
          changeDay={getChangeFromSnapshots(snapshots, "totalAssets", 1)}
          changeYear={getChangeFromSnapshots(snapshots, "totalAssets", 365)}
        />
        <SummaryCell
          label="Debts"
          value={aggregates.totalDebts}
          currency={currency}
          btcUsdRate={portfolio.btcUsdRate}
          changeDay={getChangeFromSnapshots(snapshots, "totalDebts", 1)}
          changeYear={getChangeFromSnapshots(snapshots, "totalDebts", 365)}
          invertColor
        />
        <SummaryCell
          label="Cash"
          value={aggregates.cashOnHand}
          currency={currency}
          btcUsdRate={portfolio.btcUsdRate}
          changeDay={getChangeFromSnapshots(snapshots, "cashOnHand", 1)}
          onClick={() => setCashSheetOpen(true)}
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

function SummaryCell({
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
        "bg-background/90 px-4 py-5 text-left transition-colors",
        onClick && "hover:bg-background"
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2">
        <MoneyDisplay
          amount={value}
          currency={currency}
          btcUsdRate={btcUsdRate}
          className="text-hero font-normal tracking-[-0.015em] tabular-lining"
        />
      </div>
      <div className="mt-3 space-y-1.5">
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
