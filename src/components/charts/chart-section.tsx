"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NetWorthChart } from "./net-worth-chart";
import { AllocationDonut } from "./allocation-donut";
import { AssetsDebtsChart } from "./assets-debts-chart";
import { getFromDate, type DateRangeKey } from "@/lib/chart-utils";
import type { Portfolio } from "@/hooks/use-portfolio";

const STORAGE_KEY = "summa-charts-collapsed";
const DATE_RANGES: DateRangeKey[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];

interface ChartSectionProps {
  portfolio: Portfolio;
}

export function ChartSection({ portfolio }: ChartSectionProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [range, setRange] = useState<DateRangeKey>("3M");

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const from = getFromDate(range);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={toggleCollapsed}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground/80 transition-colors"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          Charts
        </button>

        {!collapsed && (
          <div className="flex gap-1">
            {DATE_RANGES.map((r) => (
              <Button
                key={r}
                variant={r === range ? "secondary" : "outline"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setRange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          <NetWorthChart
            portfolioId={portfolio.id}
            from={from}
            currency={portfolio.currency}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AllocationDonut portfolio={portfolio} />
            <AssetsDebtsChart
              portfolioId={portfolio.id}
              from={from}
              currency={portfolio.currency}
            />
          </div>
        </>
      )}
    </div>
  );
}
