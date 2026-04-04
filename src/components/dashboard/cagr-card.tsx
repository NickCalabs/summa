"use client";

import type { PortfolioSnapshot } from "@/hooks/use-snapshots";
import { computeCAGR } from "@/lib/snapshot-utils";
import { cn } from "@/lib/utils";

interface CagrCardProps {
  snapshots: PortfolioSnapshot[];
}

export function CagrCard({ snapshots }: CagrCardProps) {
  const netWorthCagr = computeCAGR(snapshots, "netWorth");
  const investableCagr = computeCAGR(snapshots, "investableTotal");

  if (netWorthCagr == null) return null;

  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-5 md:p-6">
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">CAGR</h2>
        <p className="text-sm text-muted-foreground">
          Compound annual growth rate since first snapshot.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <CagrMetric label="Net Worth" value={netWorthCagr} />
        {investableCagr != null && (
          <CagrMetric label="Investable" value={investableCagr} />
        )}
      </div>
    </div>
  );
}

function CagrMetric({ label, value }: { label: string; value: number }) {
  const formatted = `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight",
          value >= 0 ? "text-positive" : "text-negative"
        )}
      >
        {formatted}
      </div>
    </div>
  );
}
