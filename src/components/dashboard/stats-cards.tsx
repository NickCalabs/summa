"use client";

import { useState } from "react";
import type { Portfolio } from "@/hooks/use-portfolio";
import type { PortfolioSnapshot } from "@/hooks/use-snapshots";
import { getChangeFromSnapshots } from "@/lib/snapshot-utils";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { StatCard } from "./stat-card";
import { ChangeIndicator } from "./change-indicator";
import { CashDetailSheet } from "./cash-detail-sheet";

interface StatsCardsProps {
  portfolio: Portfolio;
  snapshots: PortfolioSnapshot[];
  investableTotal: number;
}

export function StatsCards({ portfolio, snapshots, investableTotal }: StatsCardsProps) {
  const { aggregates, currency } = portfolio;
  const [cashSheetOpen, setCashSheetOpen] = useState(false);

  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Net Worth"
          value={aggregates.netWorth}
          currency={currency}
          subtitle={
            <span>
              Investable: <MoneyDisplay amount={investableTotal} currency={currency} />
            </span>
          }
        >
          <ChangeIndicator
            change={getChangeFromSnapshots(snapshots, "netWorth", 1)}
            currency={currency}
            label="1D"
          />
          <ChangeIndicator
            change={getChangeFromSnapshots(snapshots, "netWorth", 365)}
            currency={currency}
            label="1Y"
          />
        </StatCard>

        <StatCard title="Assets" value={aggregates.totalAssets} currency={currency}>
          <ChangeIndicator
            change={getChangeFromSnapshots(snapshots, "totalAssets", 1)}
            currency={currency}
            label="1D"
          />
          <ChangeIndicator
            change={getChangeFromSnapshots(snapshots, "totalAssets", 365)}
            currency={currency}
            label="1Y"
          />
        </StatCard>

        <StatCard title="Debts" value={aggregates.totalDebts} currency={currency}>
          <ChangeIndicator
            change={getChangeFromSnapshots(snapshots, "totalDebts", 1)}
            currency={currency}
            label="1D"
            invertColor
          />
          <ChangeIndicator
            change={getChangeFromSnapshots(snapshots, "totalDebts", 365)}
            currency={currency}
            label="1Y"
            invertColor
          />
        </StatCard>

        <StatCard
          title="Cash on Hand"
          value={aggregates.cashOnHand}
          currency={currency}
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
