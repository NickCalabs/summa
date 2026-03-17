import { cn } from "@/lib/utils";

interface MoneyDisplayProps {
  amount: number;
  currency: string;
  className?: string;
}

export function MoneyDisplay({ amount, currency, className }: MoneyDisplayProps) {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);

  return <span className={cn(className)}>{formatted}</span>;
}
