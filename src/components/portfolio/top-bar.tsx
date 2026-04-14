"use client";

import { useState } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdatePortfolio } from "@/hooks/use-portfolio-mutations";
import { useCreateSection } from "@/hooks/use-sections";
import { useUIStore } from "@/stores/ui-store";
import { ToolbarActions } from "@/components/toolbar-actions";

interface TopBarProps {
  portfolioId: string;
  portfolioName: string;
  defaultSectionId: string | null;
  activeSheetId: string | null;
  activeSheetType: "assets" | "debts" | null;
  lastSyncedAt: Date | null;
}

export function TopBar({
  portfolioId,
  portfolioName,
  defaultSectionId,
  activeSheetId,
  activeSheetType,
  lastSyncedAt,
}: TopBarProps) {
  const updatePortfolio = useUpdatePortfolio(portfolioId);
  const createSection = useCreateSection(portfolioId);
  const openAddFlow = useUIStore((s) => s.openAddFlow);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  function startEditing() {
    setEditValue(portfolioName);
    setIsEditing(true);
  }

  function commitName() {
    const name = editValue.trim();
    if (name && name !== portfolioName) {
      updatePortfolio.mutate({ name });
    }
    setIsEditing(false);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {isEditing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commitName();
          }}
          className="flex-shrink-0"
        >
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsEditing(false);
            }}
            className="h-9 text-lg font-semibold w-64"
            autoFocus
          />
        </form>
      ) : (
        <h2
          className="text-lg font-semibold cursor-pointer hover:text-foreground/80 transition-colors"
          onClick={startEditing}
        >
          {portfolioName}
        </h2>
      )}

      <div className="flex-1" />

      <div className="relative hidden sm:block">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Search assets..."
          disabled
          className="h-8 w-48 pl-8 text-xs"
        />
      </div>

      <Button
        size="sm"
        disabled={createSection.isPending || !activeSheetId}
        onClick={async () => {
          const sheetType = activeSheetType ?? "assets";
          if (defaultSectionId) {
            openAddFlow(sheetType, defaultSectionId);
            return;
          }
          if (!activeSheetId) return;
          const section = await createSection.mutateAsync({
            sheetId: activeSheetId,
            name: "General",
          });
          openAddFlow(sheetType, section.id);
        }}
      >
        <PlusIcon className="size-3.5" data-icon="inline-start" />
        Add
      </Button>

      <ToolbarActions portfolioId={portfolioId} lastSyncedAt={lastSyncedAt} />
    </div>
  );
}
