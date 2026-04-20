"use client";

import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useOptionalDisplayCurrency } from "@/contexts/display-currency-context";
import { SlotNumber } from "@/components/ui/slot-digit";

interface MoneyDisplayProps {
  amount: number;
  currency: string;
  className?: string;
  animate?: boolean;
  /** Today's BTC/USD rate — when provided, enables display-currency conversion */
  btcUsdRate?: number | null;
}

function formatCurrency(amount: number, currency: string, compact: boolean): string {
  const useCompact = compact && Math.abs(amount) >= 10_000;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      ...(useCompact ? { notation: "compact", maximumFractionDigits: 2 } : {}),
    }).format(amount);
  } catch {
    // Fallback for invalid currency codes (e.g. "BTC", empty string)
    return `${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency}`;
  }
}

export function MoneyDisplay({
  amount,
  currency,
  className,
  animate = false,
  btcUsdRate,
}: MoneyDisplayProps) {
  const masked = useUIStore((s) => s.valuesMasked);
  const compact = useUIStore((s) => s.compactNumbers);
  const dc = useOptionalDisplayCurrency();

  let finalValue = amount;
  let useDisplayFormat = false;
  if (btcUsdRate && dc && dc.displayCurrency !== "USD") {
    finalValue = dc.convert(amount, btcUsdRate);
    useDisplayFormat = true;
  }

  const formatted = useDisplayFormat && dc
    ? dc.format(finalValue, compact)
    : formatCurrency(finalValue, currency, compact);

  if (masked) {
    return (
      <span className={cn("tabular-nums", className)}>
        {"$\u2022\u2022\u2022\u2022\u2022"}
      </span>
    );
  }

  if (animate) {
    return (
      <SlotNumber
        value={formatted}
        className={cn("tabular-nums", className)}
      />
    );
  }

  return (
    <span className={cn("tabular-nums", className)}>
      {formatted}
    </span>
  );
}
