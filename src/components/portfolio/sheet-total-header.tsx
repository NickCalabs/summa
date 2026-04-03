"use client";

import { MoneyDisplay } from "./money-display";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/contexts/currency-context";
import type { Sheet } from "@/hooks/use-portfolio";

interface SheetTotalHeaderProps {
  sheet: Sheet;
  currency: string;
  isLoading?: boolean;
}

export function SheetTotalHeader({
  sheet,
  currency,
  isLoading,
}: SheetTotalHeaderProps) {
  const { toBase } = useCurrency();

  if (isLoading) {
    return (
      <div className="space-y-1">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  const total = sheet.sections.reduce(
    (sum, section) =>
      sum +
      section.assets
        .filter((a) => !a.isArchived)
        .reduce((s, a) => s + toBase(Number(a.currentValue), a.currency), 0),
    0
  );

  const label = sheet.type === "assets" ? "Assets" : "Debts";

  return (
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <MoneyDisplay
        amount={total}
        currency={currency}
        className="text-4xl font-bold tracking-tight"
      />
    </div>
  );
}
