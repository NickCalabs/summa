import { TrendingUpIcon, TrendingDownIcon, MinusIcon } from "lucide-react";
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
    return <span className="text-xs text-muted-foreground">{label}: —</span>;
  }

  const { absoluteChange, percentChange } = change;

  if (absoluteChange === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {label}: <MinusIcon className="size-3" /> 0%
      </span>
    );
  }

  const isPositive = absoluteChange > 0;
  const isGood = invertColor ? !isPositive : isPositive;
  const colorClass = isGood ? "text-positive" : "text-negative";
  const Icon = isPositive ? TrendingUpIcon : TrendingDownIcon;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${colorClass}`}>
      {label}: <Icon className="size-3" />
      <MoneyDisplay amount={Math.abs(absoluteChange)} currency={currency} btcUsdRate={btcUsdRate} />
      ({percentChange > 0 ? "+" : ""}
      {percentChange.toFixed(1)}%)
    </span>
  );
}
