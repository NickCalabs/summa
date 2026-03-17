import { MoneyDisplay } from "./money-display";
import { Skeleton } from "@/components/ui/skeleton";
import type { Aggregates } from "@/hooks/use-portfolio";

interface NetWorthHeaderProps {
  aggregates: Aggregates;
  currency: string;
  isLoading?: boolean;
}

export function NetWorthHeader({ aggregates, currency, isLoading }: NetWorthHeaderProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>
    );
  }

  return (
    <div>
      <MoneyDisplay
        amount={aggregates.netWorth}
        currency={currency}
        className="text-4xl font-bold tracking-tight"
      />
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          Assets: <MoneyDisplay amount={aggregates.totalAssets} currency={currency} />
        </span>
        <span className="hidden sm:inline" aria-hidden="true">&middot;</span>
        <span>
          Debts: <MoneyDisplay amount={aggregates.totalDebts} currency={currency} />
        </span>
        <span className="hidden sm:inline" aria-hidden="true">&middot;</span>
        <span>
          Cash: <MoneyDisplay amount={aggregates.cashOnHand} currency={currency} />
        </span>
      </div>
    </div>
  );
}
