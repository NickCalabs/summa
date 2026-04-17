"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SectionGroup } from "./section-group";
import { useCreateSection, useReorderSections } from "@/hooks/use-sections";
import { useUIStore } from "@/stores/ui-store";
import { useCurrency } from "@/contexts/currency-context";
import { ASSET_CATEGORIES, DEBT_CATEGORIES } from "./asset-categories";
import { MoneyDisplay } from "./money-display";
import type { Sheet } from "@/hooks/use-portfolio";

interface SheetViewProps {
  sheet: Sheet;
  currency: string;
  btcUsdRate?: number | null;
  portfolioId: string;
}

export function SheetView({ sheet, currency, btcUsdRate, portfolioId }: SheetViewProps) {
  const createSection = useCreateSection(portfolioId);
  const reorderSections = useReorderSections(portfolioId);
  const openAddFlow = useUIStore((s) => s.openAddFlow);
  const { toBase } = useCurrency();
  const [newSectionName, setNewSectionName] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const sheetTotal = sheet.sections.reduce(
    (sum, section) =>
      sum +
      section.assets.reduce(
        (s, a) =>
          s + toBase(Number(a.currentValue) * (Number(a.ownershipPct ?? 100) / 100), a.currency),
        0
      ),
    0
  );

  function handleCreate() {
    const name = newSectionName.trim();
    if (!name) return;
    createSection.mutate(
      { sheetId: sheet.id, name },
      {
        onSuccess: () => {
          setNewSectionName("");
          setAddOpen(false);
        },
      }
    );
  }

  const handleMoveSection = useCallback(
    (index: number, direction: -1 | 1) => {
      const swapIndex = index + direction;
      if (swapIndex < 0 || swapIndex >= sheet.sections.length) return;

      const a = sheet.sections[index];
      const b = sheet.sections[swapIndex];

      reorderSections.mutate({
        items: [
          { id: a.id, sortOrder: b.sortOrder },
          { id: b.id, sortOrder: a.sortOrder },
        ],
      });
    },
    [sheet.sections, reorderSections]
  );

  if (sheet.sections.length === 0) {
    const categories =
      sheet.type === "assets" ? ASSET_CATEGORIES : DEBT_CATEGORIES;
    const heading =
      sheet.type === "assets"
        ? "All your assets in one place!"
        : "All the money you owe!";

    return (
      <div className="py-8">
        <div className="text-center mb-6">
          <p className="text-lg font-semibold mb-1">{heading}</p>
          <p className="text-sm text-muted-foreground">
            Start by creating a section to organize your {sheet.type}.
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger
              render={(props) => (
                <Button variant="default" size="sm" {...props}>
                  + Create Section
                </Button>
              )}
            />
            <PopoverContent className="w-56">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
                className="space-y-3"
              >
                <Input
                  placeholder="Section name"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  autoFocus
                />
                <Button
                  type="submit"
                  size="sm"
                  className="w-full"
                  disabled={createSection.isPending}
                >
                  {createSection.isPending ? "Creating..." : "Create"}
                </Button>
              </form>
            </PopoverContent>
          </Popover>
        </div>

        <div className="text-center mb-4">
          <p className="text-xs text-muted-foreground">
            Or jump straight in — we&apos;ll create a section for you:
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                // Auto-create a default section, then open add flow
                createSection.mutate(
                  { sheetId: sheet.id, name: cat.label },
                  { onSuccess: (newSection) => openAddFlow(sheet.type, newSection.id) }
                );
              }}
              className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-left transition-colors hover:bg-accent hover:border-accent-foreground/20"
            >
              <cat.icon className="size-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium leading-tight">{cat.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cat.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sheet.sections.map((section, index) => (
        <SectionGroup
          key={section.id}
          section={section}
          sheetTotal={sheetTotal}
          sheetType={sheet.type}
          currency={currency}
          btcUsdRate={btcUsdRate}
          portfolioId={portfolioId}
          sections={sheet.sections}
          isFirst={index === 0}
          isLast={index === sheet.sections.length - 1}
          onMoveUp={() => handleMoveSection(index, -1)}
          onMoveDown={() => handleMoveSection(index, 1)}
        />
      ))}

      <div className="flex items-center justify-between pt-4 border-t border-border">
        <span className="text-base font-bold">{sheet.name}</span>
        <MoneyDisplay
          amount={sheetTotal}
          currency={currency}
          btcUsdRate={btcUsdRate}
          className="text-base font-bold tabular-nums"
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger
            render={(props) => (
              <Button variant="outline" size="sm" {...props}>
                + New Section
              </Button>
            )}
          />
          <PopoverContent className="w-56">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate();
              }}
              className="space-y-3"
            >
              <Input
                placeholder="Section name"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                autoFocus
              />
              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={createSection.isPending}
              >
                {createSection.isPending ? "Creating..." : "Add Section"}
              </Button>
            </form>
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="sm"
          onClick={() => openAddFlow(sheet.type, sheet.sections[0]?.id ?? null)}
        >
          + Add Asset
        </Button>
      </div>
    </div>
  );
}
