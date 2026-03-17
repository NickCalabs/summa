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
import type { Sheet } from "@/hooks/use-portfolio";

interface SheetViewProps {
  sheet: Sheet;
  currency: string;
  portfolioId: string;
}

export function SheetView({ sheet, currency, portfolioId }: SheetViewProps) {
  const createSection = useCreateSection(portfolioId);
  const reorderSections = useReorderSections(portfolioId);
  const [newSectionName, setNewSectionName] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const sheetTotal = sheet.sections.reduce(
    (sum, section) =>
      sum + section.assets.reduce((s, a) => s + Number(a.currentValue), 0),
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
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground mb-4">
          Create your first section
        </p>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            Add Section
          </PopoverTrigger>
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
          currency={currency}
          portfolioId={portfolioId}
          sections={sheet.sections}
          isFirst={index === 0}
          isLast={index === sheet.sections.length - 1}
          onMoveUp={() => handleMoveSection(index, -1)}
          onMoveDown={() => handleMoveSection(index, 1)}
        />
      ))}

      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          Add Section
        </PopoverTrigger>
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
    </div>
  );
}
