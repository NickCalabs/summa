"use client";

import { MoneyDisplay } from "./money-display";
import { ChangeIndicator } from "@/components/dashboard/change-indicator";
import { Skeleton } from "@/components/ui/skeleton";
import type { Change } from "@/lib/snapshot-utils";

interface SheetTotalHeaderProps {
  type: "assets" | "debts";
  total: number;
  currency: string;
  isLoading?: boolean;
  changeDay?: Change | null;
  changeYear?: Change | null;
}

export function SheetTotalHeader({
  type,
  total,
  currency,
  isLoading,
  changeDay,
  changeYear,
}: SheetTotalHeaderProps) {
  if (isLoading) {
    return (
      <div className="space-y-1">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  const label = type === "assets" ? "Assets" : "Debts";
  const invertColor = type === "debts";

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <MoneyDisplay
        amount={total}
        currency={currency}
        className="text-4xl font-bold tracking-tight"
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
        <ChangeIndicator change={changeDay ?? null} currency={currency} label="1D" invertColor={invertColor} />
        <ChangeIndicator change={changeYear ?? null} currency={currency} label="1Y" invertColor={invertColor} />
      </div>
    </div>
  );
}
