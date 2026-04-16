import { MoneyDisplay } from "@/components/portfolio/money-display";
import type { Change } from "@/lib/snapshot-utils";

interface ChangeIndicatorProps {
  change: Change | null;
  currency: string;
  label: string;
  invertColor?: boolean;
  btcUsdRate?: number | null;
}

export function ChangeIndicator({
  change,
  currency,
  label,
  invertColor = false,
  btcUsdRate,
}: ChangeIndicatorProps) {
  if (!change) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="text-nano uppercase tracking-upper font-semibold">{label}</span>
        <span className="text-xs">—</span>
      </span>
    );
  }

  const { absoluteChange, percentChange } = change;

  if (absoluteChange === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="text-nano uppercase tracking-upper font-semibold">{label}</span>
        <span className="text-xs">0%</span>
      </span>
    );
  }

  const isPositive = absoluteChange > 0;
  const isGood = invertColor ? !isPositive : isPositive;
  const colorClass = isGood ? "text-positive" : "text-negative";
  const sign = isPositive ? "+" : "";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-nano uppercase tracking-upper font-semibold text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium ${colorClass}`}>
        {sign}<MoneyDisplay amount={Math.abs(absoluteChange)} currency={currency} btcUsdRate={btcUsdRate} />
        {" "}({sign}{percentChange.toFixed(1)}%)
      </span>
    </span>
  );
}
