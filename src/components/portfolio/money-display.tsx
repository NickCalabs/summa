import { cn } from "@/lib/utils";

interface MoneyDisplayProps {
  amount: number;
  currency: string;
  className?: string;
}

export function MoneyDisplay({ amount, currency, className }: MoneyDisplayProps) {
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    // Fallback for invalid currency codes (e.g. "BTC", empty string)
    formatted = `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }

  return <span className={cn(className)}>{formatted}</span>;
}
