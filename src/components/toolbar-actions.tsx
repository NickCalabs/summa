"use client";

import {
  EyeIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  Minimize2Icon,
  Maximize2Icon,
  SettingsIcon,
  BuildingIcon,
  UploadIcon,
  DownloadIcon,
  FilterIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DisplayCurrencyDropdown } from "@/components/portfolio/display-currency-dropdown";
import { useUIStore } from "@/stores/ui-store";
import { useSyncPortfolio } from "@/hooks/use-portfolio-mutations";
import { useConnectionHealth } from "@/hooks/use-connection-health";

interface ToolbarActionsProps {
  portfolioId?: string;
}

export function ToolbarActions({ portfolioId }: ToolbarActionsProps) {
  const valuesMasked = useUIStore((s) => s.valuesMasked);
  const toggleValuesMasked = useUIStore((s) => s.toggleValuesMasked);
  const compactNumbers = useUIStore((s) => s.compactNumbers);
  const toggleCompactNumbers = useUIStore((s) => s.toggleCompactNumbers);
  const hideDust = useUIStore((s) => s.hideDust);
  const toggleHideDust = useUIStore((s) => s.toggleHideDust);
  const openPlaidDialog = useUIStore((s) => s.openPlaidDialog);
  const openCsvImportDialog = useUIStore((s) => s.openCsvImportDialog);

  // Sync only makes sense when we have a portfolio context; call hook unconditionally
  // and gate the UI.
  const syncPortfolio = useSyncPortfolio(portfolioId ?? "");
  const { staleCount, errorCount } = useConnectionHealth();
  const needsAttention = staleCount + errorCount;
  const badgeColor = errorCount > 0 ? "bg-destructive" : "bg-amber-500";
  const badgeTitle =
    needsAttention > 0
      ? `${needsAttention} connection${needsAttention > 1 ? "s" : ""} need${needsAttention === 1 ? "s" : ""} attention`
      : "All connections healthy";

  return (
    <div className="flex items-center gap-3">
      {portfolioId && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncPortfolio.mutate()}
          disabled={syncPortfolio.isPending}
          title={badgeTitle}
        >
          <span className="relative">
            <RefreshCwIcon
              className={`size-3.5 ${syncPortfolio.isPending ? "animate-spin" : ""}`}
              data-icon="inline-start"
            />
            {needsAttention > 0 && !syncPortfolio.isPending && (
              <span
                className={`absolute -top-1 -right-1 size-1.5 rounded-full ${badgeColor}`}
              />
            )}
          </span>
          <span className="hidden md:inline">
            {syncPortfolio.isPending ? "Syncing..." : "Refresh"}
          </span>
        </Button>
      )}

      <DisplayCurrencyDropdown />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" title="More actions">
              <MoreHorizontalIcon className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={toggleValuesMasked}>
            {valuesMasked ? (
              <EyeIcon className="size-4 mr-2" />
            ) : (
              <EyeOffIcon className="size-4 mr-2" />
            )}
            {valuesMasked ? "Show values" : "Hide values"}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={toggleCompactNumbers}>
            {compactNumbers ? (
              <Maximize2Icon className="size-4 mr-2" />
            ) : (
              <Minimize2Icon className="size-4 mr-2" />
            )}
            {compactNumbers ? "Full numbers" : "Compact numbers (1.2M)"}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={toggleHideDust}>
            <FilterIcon className="size-4 mr-2" />
            {hideDust ? "Show dust (< $1)" : "Hide dust (< $1)"}
          </DropdownMenuItem>

          {portfolioId && (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={openPlaidDialog}>
                <BuildingIcon className="size-4 mr-2" />
                Connect Bank
              </DropdownMenuItem>

              <DropdownMenuItem onClick={openCsvImportDialog}>
                <UploadIcon className="size-4 mr-2" />
                Import CSV
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => {
                  window.location.href = `/api/portfolios/${portfolioId}/export-csv`;
                }}
              >
                <DownloadIcon className="size-4 mr-2" />
                Export CSV
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            render={
              <Link href="/settings">
                <SettingsIcon className="size-4 mr-2" />
                Settings
              </Link>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
