"use client";

import Link from "next/link";
import { ArrowRightIcon, PinIcon } from "lucide-react";
import { useLenses } from "@/hooks/use-lenses";
import { LensCard } from "./lens-card";

interface LensesSectionProps {
  portfolioId: string;
  currency: string;
  btcUsdRate: number | null;
}

export function LensesSection({
  portfolioId,
  currency,
  btcUsdRate,
}: LensesSectionProps) {
  const { data: lenses, isLoading } = useLenses(portfolioId);

  if (isLoading) return null;
  const visible = lenses?.filter((l) => l.isPinned) ?? [];
  if (visible.length === 0) return null;

  return (
    <section className="md:rounded-card md:border md:border-border md:bg-card/50 md:p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Lenses
          </p>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <PinIcon className="size-4" />
            Pinned views
          </h2>
        </div>
        <Link
          href="/recap"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Add more from Recap
          <ArrowRightIcon className="size-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((lens) => (
          <LensCard
            key={lens.id}
            lens={lens}
            currency={currency}
            btcUsdRate={btcUsdRate}
          />
        ))}
      </div>
    </section>
  );
}
