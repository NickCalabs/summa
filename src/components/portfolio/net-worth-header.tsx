"use client";

import { useMemo } from "react";
import { subDays, differenceInCalendarDays, parseISO } from "date-fns";
import { MoneyDisplay } from "./money-display";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortfolioSnapshots } from "@/hooks/use-snapshots";
import { convertToBase } from "@/lib/currency";
import type { Aggregates, Section } from "@/hooks/use-portfolio";

interface NetWorthHeaderProps {
  portfolioId: string;
  aggregates: Aggregates;
  currency: string;
  btcUsdRate?: number | null;
  sections: Section[];
  rates: Record<string, number>;
  isLoading?: boolean;
}

export function NetWorthHeader({
  portfolioId,
  aggregates,
  currency,
  btcUsdRate,
  sections,
  rates,
  isLoading,
}: NetWorthHeaderProps) {
  const from = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0];
  }, []);

  const { data: snapshots } = usePortfolioSnapshots(portfolioId, from);

  const change1D = useMemo(
    () => snapshots ? computeNetWorthChange(snapshots, 1) : null,
    [snapshots]
  );
  const change1Y = useMemo(
    () => snapshots ? computeNetWorthChange(snapshots, 365) : null,
    [snapshots]
  );

  const sectionTotals = useMemo(() => {
    return sections
      .map((section) => ({
        name: section.name,
        total: section.assets
          .filter((a) => !a.isArchived)
          .reduce(
            (sum, asset) =>
              sum + convertToBase(Number(asset.currentValue), asset.currency, currency, rates),
            0
          ),
      }))
      .filter((s) => s.total !== 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
  }, [sections, currency, rates]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <MoneyDisplay
        amount={aggregates.netWorth}
        currency={currency}
        btcUsdRate={btcUsdRate}
        className="text-4xl font-bold tracking-tight"
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <ChangeChip label="1 DAY" change={change1D} currency={currency} btcUsdRate={btcUsdRate} />
        <ChangeChip label="1 YEAR" change={change1Y} currency={currency} btcUsdRate={btcUsdRate} />
      </div>
      {sectionTotals.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground pt-0.5">
          {sectionTotals.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-border" aria-hidden="true">·</span>}
              <span className="font-medium text-foreground/70">{s.name}</span>
              <MoneyDisplay amount={s.total} currency={currency} btcUsdRate={btcUsdRate} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeChip({
  label,
  change,
  currency,
  btcUsdRate,
}: {
  label: string;
  change: { absoluteChange: number; percentChange: number } | null;
  currency: string;
  btcUsdRate?: number | null;
}) {
  if (!change) {
    return (
      <span className="text-xs text-muted-foreground">
        {label} —
      </span>
    );
  }

  const { absoluteChange, percentChange } = change;
  const isPositive = absoluteChange >= 0;
  const colorClass = isPositive ? "text-positive" : "text-negative";
  const sign = isPositive ? "+" : "";

  return (
    <span className={`text-sm font-medium ${colorClass}`}>
      {label}{" "}
      {sign}
      <MoneyDisplay amount={Math.abs(absoluteChange)} currency={currency} btcUsdRate={btcUsdRate} />
      {" "}({sign}{percentChange.toFixed(1)}%)
    </span>
  );
}

function computeNetWorthChange(
  snapshots: { date: string; netWorth: string }[],
  daysAgo: number
): { absoluteChange: number; percentChange: number } | null {
  if (snapshots.length < 2) return null;

  const current = Number(snapshots[0].netWorth);
  const targetDate = subDays(new Date(), daysAgo);
  const tolerance = daysAgo <= 7 ? 3 : 14;

  let closest: (typeof snapshots)[0] | null = null;
  let closestDiff = Infinity;

  for (const snap of snapshots.slice(1)) {
    const diff = Math.abs(differenceInCalendarDays(parseISO(snap.date), targetDate));
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = snap;
    }
  }

  if (!closest || closestDiff > tolerance) return null;

  const previous = Number(closest.netWorth);
  const absoluteChange = current - previous;
  const percentChange =
    previous !== 0 ? (absoluteChange / Math.abs(previous)) * 100 : 0;

  return { absoluteChange, percentChange };
}
