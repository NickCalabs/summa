"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, PencilIcon, Trash2Icon, PinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLenses } from "@/hooks/use-lenses";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useUpdateLens } from "@/hooks/use-update-lens";
import { useDeleteLens } from "@/hooks/use-delete-lens";
import { LensHero } from "./lens-hero";
import { LensChart } from "./lens-chart";
import { LensBreakdownTable } from "./lens-breakdown-table";
import { LensEditPanel } from "./lens-edit-panel";
import type { DateRangeKey } from "@/lib/chart-utils";

interface LensDetailViewProps {
  portfolioId: string;
  lensId: string;
}

export function LensDetailView({ portfolioId, lensId }: LensDetailViewProps) {
  const router = useRouter();
  const { data: lenses, isLoading: lensesLoading } = useLenses(portfolioId);
  const { data: portfolio, isLoading: portfolioLoading } =
    usePortfolio(portfolioId);
  const updateLens = useUpdateLens();
  const deleteLens = useDeleteLens();
  const [editing, setEditing] = useState(false);
  const [range, setRange] = useState<DateRangeKey>("1Y");

  if (lensesLoading || portfolioLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const lens = lenses?.find((l) => l.id === lensId);
  if (!lens || !portfolio) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Lens not found.</p>
        <Link
          href={`/portfolio/${portfolioId}`}
          className="text-sm underline mt-2 inline-block"
        >
          Back to portfolio
        </Link>
      </div>
    );
  }

  const togglePinned = () => {
    updateLens.mutate({
      portfolioId,
      lensId,
      isPinned: !lens.isPinned,
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete lens "${lens.label}"?`)) return;
    deleteLens.mutate(
      { portfolioId, lensId },
      {
        onSuccess: () => router.push(`/portfolio/${portfolioId}`),
      }
    );
  };

  const allAssets = portfolio.sheets.flatMap((sheet) =>
    sheet.sections.flatMap((section) =>
      section.assets.flatMap((a) => [a, ...(a.children ?? [])])
    )
  );
  const lensAssets = allAssets.filter((a) => lens.assetIds.includes(a.id));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/portfolio/${portfolioId}`}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Back to portfolio"
          >
            <ArrowLeftIcon className="size-5" />
          </Link>
          {lens.color && (
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: lens.color }}
              aria-hidden
            />
          )}
          <h1 className="text-2xl font-semibold tracking-tight truncate">
            {lens.label}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={lens.isPinned ? "default" : "outline"}
            size="sm"
            onClick={togglePinned}
            disabled={updateLens.isPending}
          >
            <PinIcon className="size-3.5 mr-1" />
            {lens.isPinned ? "Pinned" : "Pin to dashboard"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon className="size-3.5 mr-1" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleteLens.isPending}
            className="text-destructive hover:text-destructive"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      </div>

      {lens.description && (
        <p className="text-sm text-muted-foreground -mt-3">
          {lens.description}
        </p>
      )}

      {lens.assetIds.length === 0 ? (
        <div className="rounded-card border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            This lens has no assets. Add some to start tracking.
          </p>
          <Button className="mt-4" onClick={() => setEditing(true)}>
            Add assets
          </Button>
        </div>
      ) : (
        <>
          <LensHero
            portfolioId={portfolioId}
            assetIds={lens.assetIds}
            currency={portfolio.currency}
            btcUsdRate={portfolio.btcUsdRate}
            range={range}
            onRangeChange={setRange}
          />
          <LensChart
            portfolioId={portfolioId}
            assetIds={lens.assetIds}
            currency={portfolio.currency}
            btcUsdRate={portfolio.btcUsdRate}
            range={range}
          />
          <LensBreakdownTable
            portfolioId={portfolioId}
            lens={lens}
            assets={lensAssets}
            currency={portfolio.currency}
            btcUsdRate={portfolio.btcUsdRate}
          />
        </>
      )}

      {editing && (
        <LensEditPanel
          lens={lens}
          portfolio={portfolio}
          allAssets={allAssets}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
