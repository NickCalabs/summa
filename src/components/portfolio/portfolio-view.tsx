"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LayoutGridIcon, LandmarkIcon } from "lucide-react";
import { usePortfolio, ApiError } from "@/hooks/use-portfolio";
import { usePortfolioSnapshots } from "@/hooks/use-snapshots";
import { getChangeFromSnapshots } from "@/lib/snapshot-utils";
import { getFromDate } from "@/lib/chart-utils";
import { useUIStore } from "@/stores/ui-store";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { SheetTotalHeader } from "./sheet-total-header";
import { SheetSummaryRow } from "./sheet-summary-row";
import { SheetView } from "./sheet-view";
import { TopBar } from "./top-bar";
import { DetailPanel } from "./detail-panel";
import { AddFlowDialog } from "./add-flow-dialog";
import { AccountDetailModal } from "./account-detail-modal";
import { PlaidConnectDialog } from "./plaid-connect-dialog";
import { CsvImportDialog } from "./csv-import-dialog";
import { CurrencyProvider } from "@/contexts/currency-context";

interface PortfolioViewProps {
  portfolioId: string;
}

export function PortfolioView({ portfolioId }: PortfolioViewProps) {
  const { data: portfolio, isLoading, error } = usePortfolio(portfolioId);
  const { data: snapshots = [] } = usePortfolioSnapshots(portfolioId, getFromDate("1Y"));
  const searchParams = useSearchParams();
  const activeSheetId = useUIStore((s) => s.activeSheetId);
  const setActiveSheet = useUIStore((s) => s.setActiveSheet);

  const requestedType = searchParams.get("type") as "assets" | "debts" | null;

  useEffect(() => {
    if (!portfolio || portfolio.sheets.length === 0) return;

    const requestedSheetId = searchParams.get("sheet");
    const requestedSheet = requestedSheetId
      ? portfolio.sheets.find((sheet) => sheet.id === requestedSheetId)
      : null;

    if (requestedSheet && requestedSheet.id !== activeSheetId) {
      setActiveSheet(requestedSheet.id);
      return;
    }

    // If ?type=debts but no debt sheets exist, clear active sheet so empty state shows
    if (requestedType === "debts") {
      const debtSheets = portfolio.sheets.filter((s) => s.type === "debts");
      if (debtSheets.length > 0 && activeSheetId !== debtSheets[0].id) {
        setActiveSheet(debtSheets[0].id);
      }
      return;
    }

    if (!activeSheetId) {
      setActiveSheet(portfolio.sheets[0].id);
    }
  }, [portfolio, searchParams, activeSheetId, setActiveSheet, requestedType]);

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

  const isDebtsView = requestedType === "debts";
  const debtSheets = portfolio.sheets.filter((s) => s.type === "debts");
  const showDebtsEmpty = isDebtsView && debtSheets.length === 0;

  const activeSheet = showDebtsEmpty
    ? null
    : portfolio.sheets.find((s) => s.id === activeSheetId) ?? portfolio.sheets[0];
  const defaultSectionId = activeSheet?.sections[0]?.id ?? null;
  const allSections = activeSheet?.sections ?? [];

  // Compute most recent lastSyncedAt across all assets
  const lastSyncedAt = (() => {
    let latest: number | null = null;
    for (const sheet of portfolio.sheets) {
      for (const section of sheet.sections) {
        for (const asset of section.assets) {
          if (asset.lastSyncedAt) {
            const ts = new Date(asset.lastSyncedAt).getTime();
            if (latest == null || ts > latest) latest = ts;
          }
        }
      }
    }
    return latest != null ? new Date(latest) : null;
  })();

  return (
    <CurrencyProvider baseCurrency={portfolio.currency} rates={portfolio.rates ?? {}}>
      <div className="p-6 space-y-6">
        <TopBar
          portfolioId={portfolioId}
          portfolioName={portfolio.name}
          defaultSectionId={defaultSectionId}
          activeSheetId={activeSheet?.id ?? null}
          activeSheetType={activeSheet?.type ?? null}
          lastSyncedAt={lastSyncedAt}
        />

        {activeSheet && (
          <SheetTotalHeader
            type={activeSheet.type}
            total={
              activeSheet.type === "assets"
                ? portfolio.aggregates.totalAssets
                : portfolio.aggregates.totalDebts
            }
            currency={portfolio.currency}
            btcUsdRate={portfolio.btcUsdRate}
            changeDay={getChangeFromSnapshots(
              snapshots,
              activeSheet.type === "assets" ? "totalAssets" : "totalDebts",
              1
            )}
            changeYear={getChangeFromSnapshots(
              snapshots,
              activeSheet.type === "assets" ? "totalAssets" : "totalDebts",
              365
            )}
          />
        )}

        {showDebtsEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <SheetTotalHeader
              type="debts"
              total={0}
              currency={portfolio.currency}
              btcUsdRate={portfolio.btcUsdRate}
              changeDay={null}
              changeYear={null}
            />
            <LandmarkIcon className="size-10 text-muted-foreground/40 mb-3 mt-8" />
            <p className="font-medium text-sm mb-1">No debts tracked</p>
            <p className="text-xs text-muted-foreground mb-4">
              Track mortgages, loans, credit cards, and other debts
            </p>
            <SheetSummaryRow
              sheets={portfolio.sheets}
              activeSheetId={activeSheetId}
              onSheetChange={setActiveSheet}
              portfolioId={portfolioId}
              currency={portfolio.currency}
              btcUsdRate={portfolio.btcUsdRate}
              typeOverride="debts"
            />
          </div>
        ) : (
          <>
            <SheetSummaryRow
              sheets={portfolio.sheets}
              activeSheetId={activeSheetId}
              onSheetChange={setActiveSheet}
              portfolioId={portfolioId}
              currency={portfolio.currency}
              btcUsdRate={portfolio.btcUsdRate}
            />

            {portfolio.sheets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <LayoutGridIcon className="size-10 text-muted-foreground/40 mb-3" />
                <p className="font-medium text-sm mb-1">Create your first sheet</p>
                <p className="text-xs text-muted-foreground">
                  Use the <span className="font-medium">⋮</span> menu above to add a sheet
                </p>
              </div>
            ) : activeSheet ? (
              <SheetView sheet={activeSheet} currency={portfolio.currency} btcUsdRate={portfolio.btcUsdRate} portfolioId={portfolioId} />
            ) : null}
          </>
        )}

        <DetailPanel portfolioId={portfolioId} portfolio={portfolio} />
        <AccountDetailModal />
        <AddFlowDialog
          portfolioId={portfolioId}
          currency={portfolio.currency}
          sections={allSections}
        />
        <PlaidConnectDialog portfolioId={portfolioId} sheets={portfolio.sheets} />
        <CsvImportDialog
          portfolioId={portfolioId}
          currency={portfolio.currency}
          sections={allSections}
        />
      </div>
    </CurrencyProvider>
  );
}
