"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LayoutGridIcon } from "lucide-react";
import { usePortfolio, ApiError } from "@/hooks/use-portfolio";
import { useUIStore } from "@/stores/ui-store";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { NetWorthHeader } from "./net-worth-header";
import { SheetTabs } from "./sheet-tabs";
import { SheetView } from "./sheet-view";
import { TopBar } from "./top-bar";
import { DetailPanel } from "./detail-panel";
import { AddAssetDialog } from "./add-asset-dialog";
import { PlaidConnectDialog } from "./plaid-connect-dialog";
import { CsvImportDialog } from "./csv-import-dialog";
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
          {[0, 1].map((s) => (
            <div key={s} className="rounded-lg border border-border/50 bg-card">
              <div className="px-3 py-3 border-b border-border/50">
                <Skeleton className="h-5 w-32" />
              </div>
              <div>
                {[0, 1, 2].map((r) => (
                  <div
                    key={r}
                    className="flex items-center justify-between px-3 py-2.5 border-b border-border/30 last:border-0"
                  >
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            </div>
          ))}
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
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Back to Dashboard
        </Link>
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

        <NetWorthHeader
          portfolioId={portfolioId}
          aggregates={portfolio.aggregates}
          currency={portfolio.currency}
          sections={portfolio.sheets.filter((s) => s.type === "assets").flatMap((s) => s.sections)}
          rates={portfolio.rates ?? {}}
        />

        <ChartSection portfolio={portfolio} />

        <SheetTabs
          sheets={portfolio.sheets}
          activeSheetId={activeSheetId}
          onSheetChange={setActiveSheet}
          portfolioId={portfolioId}
        />

        {portfolio.sheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <LayoutGridIcon className="size-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-sm mb-1">Create your first sheet</p>
            <p className="text-xs text-muted-foreground">
              Use the <span className="font-medium">+</span> button above to add an assets or debts sheet
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
        <PlaidConnectDialog sheets={portfolio.sheets} />
        <CsvImportDialog
          portfolioId={portfolioId}
          currency={portfolio.currency}
          sections={allSections}
        />
      </div>
    </CurrencyProvider>
  );
}
