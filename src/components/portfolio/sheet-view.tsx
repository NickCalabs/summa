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
import type { Sheet } from "@/hooks/use-portfolio";

interface SheetViewProps {
  sheet: Sheet;
  currency: string;
  portfolioId: string;
}

export function SheetView({ sheet, currency, portfolioId }: SheetViewProps) {
  const createSection = useCreateSection(portfolioId);
  const reorderSections = useReorderSections(portfolioId);
  const openAddFlow = useUIStore((s) => s.openAddFlow);
  const { toBase } = useCurrency();
  const [newSectionName, setNewSectionName] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const sheetTotal = sheet.sections.reduce(
    (sum, section) =>
      sum + section.assets.reduce((s, a) => s + toBase(Number(a.currentValue), a.currency), 0),
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
    const emptyLabel =
      sheet.type === "assets"
        ? "All your assets in one place"
        : "Track everything you owe";

    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium mb-1">{emptyLabel}</p>
        <p className="text-sm text-muted-foreground mb-6">
          Add a section to organize your {sheet.type}, then add accounts within it.
        </p>
        <div className="flex items-center gap-2">
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger
              render={(props) => (
                <Button variant="outline" size="sm" {...props}>
                  + Add Section
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
            onClick={() => openAddFlow(sheet.type, null)}
          >
            + Add Asset
          </Button>
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
          portfolioId={portfolioId}
          sections={sheet.sections}
          isFirst={index === 0}
          isLast={index === sheet.sections.length - 1}
          onMoveUp={() => handleMoveSection(index, -1)}
          onMoveDown={() => handleMoveSection(index, 1)}
        />
      ))}

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
