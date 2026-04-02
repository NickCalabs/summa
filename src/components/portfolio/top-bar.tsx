"use client";

import { useState } from "react";
import {
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  BuildingIcon,
  UploadIcon,
  DownloadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdatePortfolio } from "@/hooks/use-portfolio-mutations";
import { useUIStore } from "@/stores/ui-store";

interface TopBarProps {
  portfolioId: string;
  portfolioName: string;
  defaultSectionId: string | null;
}

export function TopBar({
  portfolioId,
  portfolioName,
  defaultSectionId,
}: TopBarProps) {
  const updatePortfolio = useUpdatePortfolio(portfolioId);
  const openAddAssetDialog = useUIStore((s) => s.openAddAssetDialog);
  const openPlaidDialog = useUIStore((s) => s.openPlaidDialog);
  const openCsvImportDialog = useUIStore((s) => s.openCsvImportDialog);

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

      <Button variant="outline" size="sm" onClick={openPlaidDialog}>
        <BuildingIcon className="size-3.5" data-icon="inline-start" />
        Connect Bank
      </Button>

      <Button variant="outline" size="sm" onClick={openCsvImportDialog}>
        <UploadIcon className="size-3.5" data-icon="inline-start" />
        Import
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          (window.location.href = `/api/portfolios/${portfolioId}/export-csv`)
        }
      >
        <DownloadIcon className="size-3.5" data-icon="inline-start" />
        Export
      </Button>

      <Button
        size="sm"
        onClick={() => defaultSectionId && openAddAssetDialog(defaultSectionId)}
        disabled={!defaultSectionId}
      >
        <PlusIcon className="size-3.5" data-icon="inline-start" />
        Add
      </Button>

      <Button variant="ghost" size="icon" disabled>
        <SettingsIcon className="size-4" />
      </Button>
    </div>
  );
}
