"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePortfolio, ApiError } from "@/hooks/use-portfolio";
import { useUIStore } from "@/stores/ui-store";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { NetWorthHeader } from "./net-worth-header";
import { SheetTabs } from "./sheet-tabs";
import { SheetView } from "./sheet-view";
import { TopBar } from "./top-bar";
import { DetailPanel } from "./detail-panel";
import { AddAssetDialog } from "./add-asset-dialog";
import { ChartSection } from "@/components/charts/chart-section";
import { CurrencyProvider } from "@/contexts/currency-context";

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
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive text-lg font-medium">
          {is404 ? "Portfolio not found" : "Failed to load portfolio"}
        </p>
        <p className="text-muted-foreground text-sm">
          {is404
            ? "This portfolio may have been deleted or you don't have access."
            : "Please try again later."}
        </p>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  if (!portfolio) return null;

  const activeSheet = portfolio.sheets.find((s) => s.id === activeSheetId) ?? portfolio.sheets[0];
  const defaultSectionId = activeSheet?.sections[0]?.id ?? null;
  const allSections = activeSheet?.sections ?? [];

  return (
    <CurrencyProvider baseCurrency={portfolio.currency} rates={portfolio.rates ?? {}}>
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

        {portfolio.sheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground">
              Add a sheet to get started
            </p>
          </div>
        ) : activeSheet ? (
          <SheetView sheet={activeSheet} currency={portfolio.currency} portfolioId={portfolioId} />
        ) : null}

        <DetailPanel portfolioId={portfolioId} portfolio={portfolio} />
        <AddAssetDialog
          portfolioId={portfolioId}
          currency={portfolio.currency}
          sections={allSections}
        />
      </div>
    </CurrencyProvider>
  );
}
