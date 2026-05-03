"use client";

import Link from "next/link";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { getProviderLabel } from "@/lib/asset-helpers";
import type { Asset } from "@/hooks/use-portfolio";
import type { Lens } from "@/hooks/use-lenses";

interface LensBreakdownTableProps {
  portfolioId: string;
  lens: Lens;
  assets: Asset[];
  currency: string;
  btcUsdRate: number | null;
}

export function LensBreakdownTable({
  portfolioId,
  assets,
  currency,
  btcUsdRate,
}: LensBreakdownTableProps) {
  const rows = assets.map((a) => {
    const value = Number(a.currentValue ?? 0);
    return {
      id: a.id,
      name: a.name,
      provider: getProviderLabel(a.providerType),
      value,
    };
  });

  const total = rows.reduce((s, r) => s + r.value, 0);
  const sorted = [...rows].sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-card border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-4 py-2">Asset</th>
            <th className="text-left font-medium px-4 py-2">Source</th>
            <th className="text-right font-medium px-4 py-2">Value</th>
            <th className="text-right font-medium px-4 py-2">% of lens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((row) => {
            const pct = total > 0 ? (row.value / total) * 100 : 0;
            return (
              <tr
                key={row.id}
                className="hover:bg-muted/30 cursor-pointer"
                onClick={() => {
                  window.location.href = `/portfolio/${portfolioId}/asset/${row.id}`;
                }}
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/portfolio/${portfolioId}/asset/${row.id}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {row.provider}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  <MoneyDisplay
                    amount={row.value}
                    currency={currency}
                    btcUsdRate={btcUsdRate}
                  />
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {pct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
