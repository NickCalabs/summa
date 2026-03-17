"use client";

import { useEffect } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useUIStore } from "@/stores/ui-store";
import { Skeleton } from "@/components/ui/skeleton";
import { NetWorthHeader } from "./net-worth-header";
import { SheetTabs } from "./sheet-tabs";
import { SheetView } from "./sheet-view";
import { TopBar } from "./top-bar";
import { DetailPanel } from "./detail-panel";
import { AddAssetDialog } from "./add-asset-dialog";
import { ChartSection } from "@/components/charts/chart-section";

interface PortfolioViewProps {
  portfolioId: string;
}

export function PortfolioView({ portfolioId }: PortfolioViewProps) {
  const { data: portfolio, isLoading, error } = usePortfolio(portfolioId);
  const activeSheetId = useUIStore((s) => s.activeSheetId);
  const setActiveSheet = useUIStore((s) => s.setActiveSheet);

  // Set active sheet to first sheet if null
  useEffect(() => {
    if (portfolio && !activeSheetId && portfolio.sheets.length > 0) {
      setActiveSheet(portfolio.sheets[0].id);
    }
  }, [portfolio, activeSheetId, setActiveSheet]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-8 w-80" />
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">Failed to load portfolio. Please try again.</p>
      </div>
    );
  }

  if (!portfolio) return null;

  const activeSheet = portfolio.sheets.find((s) => s.id === activeSheetId) ?? portfolio.sheets[0];
  const defaultSectionId = activeSheet?.sections[0]?.id ?? null;
  const allSections = activeSheet?.sections ?? [];

  return (
    <div className="p-6 space-y-6">
      <TopBar
        portfolioId={portfolioId}
        portfolioName={portfolio.name}
        defaultSectionId={defaultSectionId}
      />

      <NetWorthHeader aggregates={portfolio.aggregates} currency={portfolio.currency} />

      <ChartSection portfolio={portfolio} />

      <SheetTabs
        sheets={portfolio.sheets}
        activeSheetId={activeSheetId}
        onSheetChange={setActiveSheet}
        portfolioId={portfolioId}
      />

      {activeSheet && (
        <SheetView sheet={activeSheet} currency={portfolio.currency} portfolioId={portfolioId} />
      )}

      <DetailPanel portfolioId={portfolioId} portfolio={portfolio} />
      <AddAssetDialog
        portfolioId={portfolioId}
        currency={portfolio.currency}
        sections={allSections}
      />
    </div>
  );
}
