"use client";

import { Suspense } from "react";
import { RecapProvider } from "@/contexts/recap-context";
import { RecapToolbar } from "./recap-toolbar";
import { RecapTable } from "./recap-table";
import { RecapDrillDown } from "./recap-drill-down";
import { useRecap } from "@/hooks/use-recap";
import { useRecapContext } from "@/contexts/recap-context";
import { Skeleton } from "@/components/ui/skeleton";

interface RecapViewProps {
  portfolioId: string;
  currency: string;
  btcUsdRate: number | null;
}

export function RecapView({
  portfolioId,
  currency,
  btcUsdRate,
}: RecapViewProps) {
  return (
    <Suspense fallback={<RecapSkeleton />}>
      <RecapProvider>
        <RecapViewInner
          portfolioId={portfolioId}
          currency={currency}
          btcUsdRate={btcUsdRate}
        />
      </RecapProvider>
    </Suspense>
  );
}

function RecapViewInner({
  portfolioId,
  currency,
  btcUsdRate,
}: RecapViewProps) {
  const { data, isLoading } = useRecap(portfolioId);
  const { drillDownKey, drillDownAssetIds, drillDownLabel, closeDrillDown } =
    useRecapContext();

  return (
    <div className="space-y-4">
      <RecapToolbar />

      {isLoading ? (
        <RecapSkeleton />
      ) : data ? (
        <RecapTable data={data} btcUsdRate={btcUsdRate} />
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No data available for this report.
        </div>
      )}

      {drillDownKey && (
        <RecapDrillDown
          portfolioId={portfolioId}
          assetIds={drillDownAssetIds}
          label={drillDownLabel}
          currency={currency}
          btcUsdRate={btcUsdRate}
          open={true}
          onClose={closeDrillDown}
        />
      )}
    </div>
  );
}

function RecapSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
