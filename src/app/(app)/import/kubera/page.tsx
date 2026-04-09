"use client";

import { KuberaImport } from "@/components/import/kubera-import";
import { usePortfolios, usePortfolio } from "@/hooks/use-portfolio";

export default function KuberaImportPage() {
  const { data: portfolios, isLoading: loadingList } = usePortfolios();
  const portfolioId = portfolios?.[0]?.id ?? "";
  const { data: portfolio, isLoading: loadingPortfolio } = usePortfolio(portfolioId);

  if (loadingList || loadingPortfolio) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading...</div>
    );
  }

  if (!portfolio) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No portfolio found. Create one first.
      </div>
    );
  }

  // Flatten all assets from all sheets/sections for matching
  const existingAssets = (portfolio.sheets ?? []).flatMap((sheet) =>
    sheet.sections.flatMap((section) =>
      section.assets.map((a) => ({
        id: a.id,
        name: a.name,
        providerType: a.providerType,
      }))
    )
  );

  return (
    <div className="p-8">
      <KuberaImport
        portfolioId={portfolio.id}
        existingAssets={existingAssets}
      />
    </div>
  );
}
