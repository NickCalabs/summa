"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { usePortfolio, usePortfolios } from "@/hooks/use-portfolio";
import { RecapView } from "@/components/recap/recap-view";
import { DisplayCurrencyDropdown } from "@/components/portfolio/display-currency-dropdown";
import { Skeleton } from "@/components/ui/skeleton";

function parsePortfolioId(pathname: string): string | null {
  const match = pathname.match(/^\/portfolio\/([^/?]+)/);
  return match?.[1] ?? null;
}

export default function RecapPage() {
  const pathname = usePathname();
  const { data: portfolioList, isLoading: listLoading } = usePortfolios();

  const portfolioId = useMemo(
    () => parsePortfolioId(pathname) ?? portfolioList?.[0]?.id ?? "",
    [pathname, portfolioList]
  );

  const { data: portfolio, isLoading: portfolioLoading } =
    usePortfolio(portfolioId);

  if (listLoading || portfolioLoading || !portfolio) {
    return (
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Recap</h1>
        <DisplayCurrencyDropdown />
      </div>

      <RecapView
        portfolioId={portfolio.id}
        currency={portfolio.currency}
        btcUsdRate={portfolio.btcUsdRate}
      />
    </div>
  );
}
