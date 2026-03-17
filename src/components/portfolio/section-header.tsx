"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoneyDisplay } from "./money-display";
import { useUpdateSection, useDeleteSection } from "@/hooks/use-sections";
import type { Section } from "@/hooks/use-portfolio";

interface SectionHeaderProps {
  section: Section;
  currency: string;
  isCollapsed: boolean;
  onToggle: () => void;
  portfolioId: string;
}

export function SectionHeader({
  section,
  currency,
  isCollapsed,
  onToggle,
  portfolioId,
}: SectionHeaderProps) {
  const updateSection = useUpdateSection(portfolioId);
  const deleteSection = useDeleteSection(portfolioId);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const sectionTotal = section.assets.reduce(
    (sum, a) => sum + Number(a.currentValue),
    0
  );

  function handleRename() {
    const name = renameValue.trim();
    if (!name) return;
    updateSection.mutate({ id: section.id, name }, { onSuccess: () => setIsRenaming(false) });
  }

  function handleDelete() {
    if (!confirm("Delete this section? All assets within it will be removed.")) return;
    deleteSection.mutate({ id: section.id });
  }

  return (
    <div className="flex items-center gap-2 py-2">
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onToggle}>
        <ChevronIcon collapsed={isCollapsed} />
      </Button>

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
            className="h-7 w-40 text-sm"
            autoFocus
            onBlur={() => setIsRenaming(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsRenaming(false);
            }}
          />
        </form>
      ) : (
        <span className="font-semibold">{section.name}</span>
      )}

      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
        {section.assets.length}
      </Badge>

      <MoneyDisplay
        amount={sectionTotal}
        currency={currency}
        className="ml-auto tabular-nums text-sm font-medium"
      />

      <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
        Add Asset
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-6 w-6" />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setIsRenaming(true);
              setRenameValue(section.name);
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onSelect={handleDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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

function MoreHorizontalIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}
