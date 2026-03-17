"use client";

import { useUIStore } from "@/stores/ui-store";
import { SectionHeader } from "./section-header";
import { AssetTable } from "./asset-table";
import type { Section } from "@/hooks/use-portfolio";

interface SectionGroupProps {
  section: Section;
  sheetTotal: number;
  currency: string;
  portfolioId: string;
}

export function SectionGroup({ section, sheetTotal, currency, portfolioId }: SectionGroupProps) {
  const collapsedSections = useUIStore((s) => s.collapsedSections);
  const toggleSection = useUIStore((s) => s.toggleSection);
  const isCollapsed = collapsedSections.has(section.id);

  return (
    <div className="rounded-lg border border-border/50 bg-card">
      <div className="px-3">
        <SectionHeader
          section={section}
          currency={currency}
          isCollapsed={isCollapsed}
          onToggle={() => toggleSection(section.id)}
          portfolioId={portfolioId}
        />
      </div>
      {!isCollapsed && (
        <AssetTable assets={section.assets} sheetTotal={sheetTotal} currency={currency} />
      )}
    </div>
  );
}
