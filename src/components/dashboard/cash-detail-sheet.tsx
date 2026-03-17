"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { convertToBase } from "@/lib/currency";
import type { Portfolio, Asset } from "@/hooks/use-portfolio";

interface CashDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolio: Portfolio;
}

function getCashAssets(portfolio: Portfolio): Array<{ asset: Asset; valueInBase: number }> {
  const result: Array<{ asset: Asset; valueInBase: number }> = [];
  const rates = portfolio.rates ?? {};

  for (const sheet of portfolio.sheets) {
    if (sheet.type === "debts") continue;
    for (const section of sheet.sections) {
      for (const asset of section.assets) {
        if (asset.isCashEquivalent && !asset.isArchived) {
          const rawVal = Number(asset.currentValue);
          const valueInBase =
            asset.currency !== portfolio.currency
              ? convertToBase(rawVal, asset.currency, portfolio.currency, rates)
              : rawVal;
          result.push({ asset, valueInBase });
        }
      }
    }
  }

  return result.sort((a, b) => b.valueInBase - a.valueInBase);
}

export function CashDetailSheet({ open, onOpenChange, portfolio }: CashDetailSheetProps) {
  const { aggregates, currency } = portfolio;
  const cashAssets = getCashAssets(portfolio);
  const netWorthPct =
    aggregates.netWorth > 0
      ? ((aggregates.cashOnHand / aggregates.netWorth) * 100).toFixed(2)
      : "0.00";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-base font-semibold">Cash on hand</SheetTitle>
        </SheetHeader>

        {/* Total + percentages */}
        <div className="mb-6">
          <MoneyDisplay
            amount={aggregates.cashOnHand}
            currency={currency}
            className="text-3xl font-bold tabular-nums"
          />
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{netWorthPct}%</span>{" "}
              <span className="uppercase tracking-wide">of net worth</span>
            </span>
            <span className="text-muted-foreground/40">vs</span>
            <span className="text-muted-foreground/60 uppercase tracking-wide">
              — <span className="normal-case">your club</span>
            </span>
          </div>
        </div>

        {/* Asset list */}
        {cashAssets.length > 0 ? (
          <div className="border rounded-lg divide-y mb-6">
            {cashAssets.map(({ asset, valueInBase }) => (
              <div
                key={asset.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="text-foreground truncate pr-4">{asset.name}</span>
                <MoneyDisplay
                  amount={valueInBase}
                  currency={currency}
                  className="tabular-nums shrink-0 font-medium"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mb-6">
            No cash-equivalent assets found. To mark an asset, go to Asset details &gt;
            Settings &gt; Mark as Cash Equivalent.
          </p>
        )}

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed mb-1">
          The total cash you have in your hand, bank, brokerage accounts or crypto
          wallets. Asset details &gt; Settings &gt; toggle &ldquo;Cash Equivalent&rdquo;.
        </p>

        {/* Club benchmarks section */}
        <div className="mt-8 border rounded-lg p-4">
          <h3 className="text-sm font-semibold italic mb-2">Your Club Benchmarks</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            Benchmarks drawn from aggregated data of an anonymous club of users with net
            worth similar to yours. They help you understand whether your numbers are
            typical or outliers compared to peers.
          </p>
          <div className="space-y-4">
            <BenchmarkRow
              label="Your Net Worth"
              value={aggregates.netWorth}
              currency={currency}
            />
            <BenchmarkRow
              label="Cash on Hand"
              value={aggregates.cashOnHand}
              currency={currency}
              pctOfNetWorth={netWorthPct}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Club benchmark data is not yet available.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BenchmarkRow({
  label,
  value,
  currency,
  pctOfNetWorth,
}: {
  label: string;
  value: number;
  currency: string;
  pctOfNetWorth?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
        {label}
      </p>
      <MoneyDisplay
        amount={value}
        currency={currency}
        className="text-lg font-bold tabular-nums"
      />
      {pctOfNetWorth !== undefined && (
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{pctOfNetWorth}%</span> of net
            worth
          </span>
          <span className="text-muted-foreground/40">vs</span>
          <span className="text-muted-foreground/50">— your club</span>
        </div>
      )}
    </div>
  );
}
