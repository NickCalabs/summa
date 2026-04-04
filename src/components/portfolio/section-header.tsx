"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoneyDisplay } from "./money-display";
import { ConfirmDialog } from "./confirm-dialog";
import { useUpdateSection, useDeleteSection } from "@/hooks/use-sections";
import { useUIStore } from "@/stores/ui-store";
import { useCurrency } from "@/contexts/currency-context";
import type { Section } from "@/hooks/use-portfolio";

interface SectionHeaderProps {
  section: Section;
  sheetType: "assets" | "debts";
  currency: string;
  isCollapsed: boolean;
  onToggle: () => void;
  portfolioId: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function SectionHeader({
  section,
  sheetType,
  currency,
  isCollapsed,
  onToggle,
  portfolioId,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: SectionHeaderProps) {
  const updateSection = useUpdateSection(portfolioId);
  const deleteSection = useDeleteSection(portfolioId);
  const openAddFlow = useUIStore((s) => s.openAddFlow);
  const { toBase } = useCurrency();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const sectionTotal = section.assets.reduce(
    (sum, a) => sum + toBase(Number(a.currentValue), a.currency),
    0
  );

  function handleRename() {
    const name = renameValue.trim();
    if (!name) return;
    updateSection.mutate(
      { id: section.id, name },
      { onSuccess: () => setIsRenaming(false) }
    );
  }

  function startRenaming() {
    setIsRenaming(true);
    setRenameValue(section.name);
  }

  return (
    <>
      <div className="flex items-center gap-2 py-1">
        <button
          type="button"
          className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={onToggle}
        >
          <ChevronIcon collapsed={isCollapsed} />
        </button>

        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRename();
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="h-8 w-48 text-base font-semibold"
                autoFocus
                onBlur={() => setIsRenaming(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setIsRenaming(false);
                }}
              />
            </form>
          ) : (
            <div className="flex items-center gap-1">
              <span
                className="cursor-pointer text-lg font-semibold tracking-tight"
                onDoubleClick={startRenaming}
              >
                {section.name}
              </span>
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                {section.assets.length}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground transition-colors ml-0.5"
                    />
                  }
                >
                  <ChevronDown className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={startRenaming}>
                    Rename
                  </DropdownMenuItem>
                  {!isFirst && (
                    <DropdownMenuItem onSelect={onMoveUp}>
                      Move Up
                    </DropdownMenuItem>
                  )}
                  {!isLast && (
                    <DropdownMenuItem onSelect={onMoveDown}>
                      Move Down
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeleteOpen(true)}
                  >
                    Remove Section
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => openAddFlow(sheetType, section.id)}
        >
          Add Asset
        </Button>
      </div>

      {!isCollapsed && (
        <div className="pb-1 text-right text-sm font-semibold tabular-nums">
          <MoneyDisplay amount={sectionTotal} currency={currency} />
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete section"
        description="Delete this section? All assets within it will be removed."
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteSection.isPending}
        onConfirm={() => {
          deleteSection.mutate(
            { id: section.id },
            { onSuccess: () => setDeleteOpen(false) }
          );
        }}
      />
    </>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${collapsed ? "" : "rotate-90"}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
