"use client";

import { BrokerageImport } from "@/components/import/brokerage-import";
import { usePortfolios, usePortfolio } from "@/hooks/use-portfolio";

export default function BrokerageImportPage() {
  const { data: portfolios, isLoading: loadingList } = usePortfolios();
  const portfolioId = portfolios?.[0]?.id ?? "";
  const { data: portfolio, isLoading: loadingPortfolio } =
    usePortfolio(portfolioId);

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

  // Collect all sections from assets sheets for the section picker
  const sections = (portfolio.sheets ?? [])
    .filter((s) => s.type === "assets")
    .flatMap((sheet) =>
      sheet.sections.map((sec) => ({
        id: sec.id,
        name: sheet.sections.length > 1 ? `${sheet.name} / ${sec.name}` : sec.name,
      }))
    );

  return (
    <div className="p-8">
      <BrokerageImport portfolioId={portfolio.id} sections={sections} />
    </div>
  );
}
