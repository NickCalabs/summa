"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, PinIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLenses } from "@/hooks/use-lenses";
import { useCreateLens } from "@/hooks/use-create-lens";
import { usePortfolio } from "@/hooks/use-portfolio";
import { LensCard } from "./lens-card";
import { LensPickerModal } from "./lens-picker-modal";
import type { PickerAsset } from "@/lib/lens-utils";

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
  const router = useRouter();
  const { data: lenses, isLoading } = useLenses(portfolioId);
  const { data: portfolio } = usePortfolio(portfolioId);
  const createLens = useCreateLens();
  const [pickerOpen, setPickerOpen] = useState(false);

  const pickerAssets = useMemo<PickerAsset[]>(() => {
    if (!portfolio) return [];
    return portfolio.sheets.flatMap((sheet) =>
      sheet.sections.flatMap((section) =>
        section.assets.flatMap((a) => {
          const flat = [a, ...(a.children ?? [])];
          return flat.map((asset) => ({
            id: asset.id,
            name: asset.name,
            type: asset.type,
            currency: asset.currency,
            providerType: asset.providerType,
            providerConfig:
              (asset.providerConfig as Record<string, unknown>) ?? null,
            parentAssetId: asset.parentAssetId,
            currentValueInBase: Number(asset.currentValue ?? 0),
          }));
        })
      )
    );
  }, [portfolio]);

  const handleCreate = (assetIds: string[]) => {
    createLens.mutate(
      {
        portfolioId,
        label: "New lens",
        assetIds,
        isPinned: true,
      },
      {
        onSuccess: (lens) => {
          setPickerOpen(false);
          router.push(`/portfolio/${portfolioId}/lens/${lens.id}`);
        },
      }
    );
  };

  if (isLoading) return null;
  const visible = lenses?.filter((l) => l.isPinned) ?? [];

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
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => setPickerOpen(true)}
            disabled={!portfolio}
          >
            <PlusIcon className="size-3.5 mr-1" />
            New lens
          </Button>
          <Link
            href="/recap"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            From Recap
            <ArrowRightIcon className="size-3" />
          </Link>
        </div>
      </div>

      {visible.length > 0 ? (
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
      ) : (
        <div className="text-sm text-muted-foreground text-center py-8">
          No lenses yet. Create one to track a custom mix of assets across
          accounts.
        </div>
      )}

      {portfolio && (
        <LensPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          assets={pickerAssets}
          initialAssetIds={[]}
          currency={portfolio.currency}
          btcUsdRate={portfolio.btcUsdRate}
          onSave={handleCreate}
        />
      )}
    </section>
  );
}
