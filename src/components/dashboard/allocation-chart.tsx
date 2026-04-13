"use client";

import { useMemo } from "react";
import type { Portfolio } from "@/hooks/use-portfolio";
import { computeInvestableTotal } from "@/lib/snapshot-utils";
import { convertToBase } from "@/lib/currency";
import { DONUT_COLORS, formatCompactCurrency } from "@/lib/chart-utils";
import { isLiabilityAsset } from "@/lib/portfolio-utils";
import { ChartEmpty } from "@/components/charts/chart-empty";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { useDisplayCurrency } from "@/contexts/display-currency-context";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

interface AllocationChartProps {
  portfolio: Portfolio;
}

interface SheetTotal {
  id: string;
  name: string;
  total: number;
  color: string;
  share: number;
}

export function AllocationChart({ portfolio }: AllocationChartProps) {
  const setActiveSheet = useUIStore((state) => state.setActiveSheet);
  const { convert, formatCompact: dcFormatCompact, displayCurrency } = useDisplayCurrency();
  const investableTotal = useMemo(
    () => computeInvestableTotal(portfolio),
    [portfolio]
  );

  const { assetSheets, debtSheets, assetTotal, debtTotal } = useMemo(() => {
    const assets: Omit<SheetTotal, "share">[] = [];
    const debts: Omit<SheetTotal, "share">[] = [];

    portfolio.sheets.forEach((sheet, index) => {
      let assetTotalForSheet = 0;
      let debtTotalForSheet = 0;
      for (const section of sheet.sections) {
        for (const asset of section.assets) {
          if (asset.isArchived) continue;
          const ownedValue =
            Number(asset.currentValue) * (Number(asset.ownershipPct ?? 100) / 100);
          const convertedValue = convertToBase(
            ownedValue,
            asset.currency,
            portfolio.currency,
            portfolio.rates
          );
          if (isLiabilityAsset(sheet, asset)) {
            debtTotalForSheet += convertedValue;
          } else {
            assetTotalForSheet += convertedValue;
          }
        }
      }

      if (assetTotalForSheet > 0) {
        assets.push({
          id: sheet.id,
          name: sheet.name,
          total: assetTotalForSheet,
          color: DONUT_COLORS[index % DONUT_COLORS.length],
        });
      }

      if (debtTotalForSheet > 0) {
        debts.push({
          id: sheet.id,
          name: sheet.name,
          total: debtTotalForSheet,
          color: DONUT_COLORS[index % DONUT_COLORS.length],
        });
      }
    });

    assets.sort((left, right) => right.total - left.total);
    debts.sort((left, right) => right.total - left.total);

    const assetSum = assets.reduce((sum, item) => sum + item.total, 0);
    const debtSum = debts.reduce((sum, item) => sum + item.total, 0);

    return {
      assetTotal: assetSum,
      debtTotal: debtSum,
      assetSheets: assets.map((item) => ({
        ...item,
        share: assetSum > 0 ? item.total / assetSum : 0,
      })),
      debtSheets: debts.map((item) => ({
        ...item,
        share: debtSum > 0 ? item.total / debtSum : 0,
      })),
    };
  }, [portfolio]);

  if (assetSheets.length === 0 && debtSheets.length === 0) {
    return (
      <div className="h-[240px]">
        <ChartEmpty />
      </div>
    );
  }

  const assetGradient = buildConicGradient(assetSheets);
  const debtRatio = assetTotal > 0 ? debtTotal / assetTotal : 0;
  const investableRatio = assetTotal > 0 ? investableTotal / assetTotal : 0;
  const largestAsset = assetSheets[0];

  return (
    <div className="grid gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-6">
        <div className="rounded-[28px] border border-border/70 bg-background/80 p-6">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Allocation Ring
            </p>
            <h3 className="text-lg font-semibold tracking-tight">Asset mix</h3>
          </div>

          <div className="mt-6 flex justify-center">
            <div
              className="relative aspect-square w-full max-w-[260px] rounded-full border border-border/50"
              style={{
                backgroundImage:
                  assetGradient ??
                  "conic-gradient(from 180deg, var(--muted) 0deg 360deg)",
              }}
            >
              <div className="absolute inset-[18%] rounded-full border border-border/70 bg-background/95 shadow-sm" />
              <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full text-center">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Assets
                </p>
                <MoneyDisplay
                  amount={assetTotal}
                  currency={portfolio.currency}
                  btcUsdRate={portfolio.btcUsdRate}
                  className="mt-2 text-2xl font-semibold tracking-tight"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {assetSheets.length} sheets tracked
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70">
            <RingMetric
              label="Investable"
              value={displayCurrency === "USD" ? formatCompactCurrency(investableTotal, portfolio.currency) : dcFormatCompact(convert(investableTotal, portfolio.btcUsdRate))}
              detail={`${(investableRatio * 100).toFixed(0)}% of assets`}
            />
            <RingMetric
              label="Debt load"
              value={displayCurrency === "USD" ? formatCompactCurrency(debtTotal, portfolio.currency) : dcFormatCompact(convert(debtTotal, portfolio.btcUsdRate))}
              detail={`${(debtRatio * 100).toFixed(0)}% of assets`}
            />
            <RingMetric
              label="Largest sheet"
              value={largestAsset?.name ?? "—"}
              detail={
                largestAsset
                  ? `${(largestAsset.share * 100).toFixed(0)}% of assets`
                  : "No asset sheets"
              }
            />
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <ReportBlock
          title="Asset allocation report"
          subtitle="Sheet-level asset exposure in portfolio currency."
          items={assetSheets}
          currency={portfolio.currency}
          btcUsdRate={portfolio.btcUsdRate}
          emptyLabel="No asset sheets yet"
          onSelect={setActiveSheet}
        />

        <ReportBlock
          title="Debt report"
          subtitle="Liability exposure by debt sheet."
          items={debtSheets}
          currency={portfolio.currency}
          btcUsdRate={portfolio.btcUsdRate}
          emptyLabel="No debt sheets yet"
          onSelect={setActiveSheet}
          debt
        />
      </div>
    </div>
  );
}

function ReportBlock({
  title,
  subtitle,
  items,
  currency,
  btcUsdRate,
  emptyLabel,
  onSelect,
  debt = false,
}: {
  title: string;
  subtitle: string;
  items: SheetTotal[];
  currency: string;
  btcUsdRate?: number | null;
  emptyLabel: string;
  onSelect: (sheetId: string) => void;
  debt?: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-border/70 bg-background/80 p-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border/70">
          <div className="grid grid-cols-[minmax(0,1fr)_88px_140px] border-b border-border/70 bg-muted/20 px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <span>Sheet</span>
            <span className="text-right">Share</span>
            <span className="text-right">Value</span>
          </div>
          <div className="divide-y divide-border/70">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_88px_140px] items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/20"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate font-medium">{item.name}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        debt ? "bg-red-400/80" : ""
                      )}
                      style={{
                        width: `${Math.max(item.share * 100, 5)}%`,
                        backgroundColor: debt ? undefined : item.color,
                      }}
                    />
                  </div>
                </div>
                <div className="text-right text-sm tabular-nums text-muted-foreground">
                  {(item.share * 100).toFixed(1)}%
                </div>
                <div className="text-right font-medium tabular-nums">
                  <MoneyDisplay amount={item.total} currency={currency} btcUsdRate={btcUsdRate} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RingMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-background/90 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function buildConicGradient(items: SheetTotal[]) {
  if (items.length === 0) return null;

  let start = 0;
  const stops = items.map((item) => {
    const end = start + item.share * 360;
    const stop = `${item.color} ${start}deg ${end}deg`;
    start = end;
    return stop;
  });

  if (start < 360) {
    stops.push(`var(--muted) ${start}deg 360deg`);
  }

  return `conic-gradient(from 180deg, ${stops.join(", ")})`;
}
