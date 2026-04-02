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
  investableTotal: number;
}

export function StatsCards({
  portfolio,
  snapshots,
  investableTotal,
}: StatsCardsProps) {
  const { aggregates, currency } = portfolio;
  const [cashSheetOpen, setCashSheetOpen] = useState(false);
  const assetBase = Math.max(aggregates.totalAssets, 1);

  return (
    <>
      <div className="grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 md:grid-cols-4">
        <SummaryCell
          label="Investable"
          value={investableTotal}
          currency={currency}
          detail={`${((investableTotal / assetBase) * 100).toFixed(0)}% of assets`}
        />
        <SummaryCell
          label="Assets"
          value={aggregates.totalAssets}
          currency={currency}
          detail="Gross balance sheet"
          changeDay={getChangeFromSnapshots(snapshots, "totalAssets", 1)}
          changeYear={getChangeFromSnapshots(snapshots, "totalAssets", 365)}
        />
        <SummaryCell
          label="Debts"
          value={aggregates.totalDebts}
          currency={currency}
          detail={`${((aggregates.totalDebts / assetBase) * 100).toFixed(0)}% of assets`}
          changeDay={getChangeFromSnapshots(snapshots, "totalDebts", 1)}
          changeYear={getChangeFromSnapshots(snapshots, "totalDebts", 365)}
          invertColor
        />
        <SummaryCell
          label="Cash"
          value={aggregates.cashOnHand}
          currency={currency}
          detail={`${((aggregates.cashOnHand / assetBase) * 100).toFixed(0)}% of assets`}
          changeDay={getChangeFromSnapshots(snapshots, "cashOnHand", 1)}
          changeYear={getChangeFromSnapshots(snapshots, "cashOnHand", 365)}
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
  detail,
  changeDay,
  changeYear,
  invertColor = false,
  onClick,
}: {
  label: string;
  value: number;
  currency: string;
  detail: string;
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
        "bg-background/90 px-4 py-4 text-left transition-colors",
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
          className="text-2xl font-semibold tracking-tight"
        />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      {(changeDay || changeYear) && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {changeDay ? (
            <ChangeIndicator
              change={changeDay}
              currency={currency}
              label="1D"
              invertColor={invertColor}
            />
          ) : null}
          {changeYear ? (
            <ChangeIndicator
              change={changeYear}
              currency={currency}
              label="1Y"
              invertColor={invertColor}
            />
          ) : null}
        </div>
      )}
    </Element>
  );
}
