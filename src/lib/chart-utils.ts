import { subMonths, startOfYear, format } from "date-fns";

export type DateRangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

export function getFromDate(range: DateRangeKey): string | undefined {
  const now = new Date();
  switch (range) {
    case "1M":
      return format(subMonths(now, 1), "yyyy-MM-dd");
    case "3M":
      return format(subMonths(now, 3), "yyyy-MM-dd");
    case "6M":
      return format(subMonths(now, 6), "yyyy-MM-dd");
    case "YTD":
      return format(startOfYear(now), "yyyy-MM-dd");
    case "1Y":
      return format(subMonths(now, 12), "yyyy-MM-dd");
    case "ALL":
      return undefined;
  }
}

export function formatChartDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return format(date, "MMM d");
}

export function formatCompactCurrency(
  value: number,
  currency: string
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatCompactDisplayCurrency(
  value: number,
  displayCurrency: string,
  formatCompactFn: (val: number) => string,
): string {
  if (displayCurrency === "USD") {
    return formatCompactCurrency(value, "USD");
  }
  return formatCompactFn(value);
}

export const DONUT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];
