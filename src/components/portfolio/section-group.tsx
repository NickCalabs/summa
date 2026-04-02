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
  sections: Section[];
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}


export function SectionGroup({
  section,
  currency,
  portfolioId,
  sections,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: SectionGroupProps) {
  const collapsedSections = useUIStore((s) => s.collapsedSections);
  const toggleSection = useUIStore((s) => s.toggleSection);
  const isCollapsed = collapsedSections.has(section.id);

  return (
    <div className="space-y-2">
      <div>
        <SectionHeader
          section={section}
          currency={currency}
          isCollapsed={isCollapsed}
          onToggle={() => toggleSection(section.id)}
          portfolioId={portfolioId}
          isFirst={isFirst}
          isLast={isLast}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      </div>
      {!isCollapsed && (
        <AssetTable
          assets={section.assets}
          currency={currency}
          portfolioId={portfolioId}
          sectionId={section.id}
          sections={sections}
        />
      )}
    </div>
  );
}
