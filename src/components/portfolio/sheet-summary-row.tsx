"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { MoneyDisplay } from "./money-display";
import { useCreateSheet, useUpdateSheet, useDeleteSheet, useReorderSheets } from "@/hooks/use-sheets";
import { useCurrency } from "@/contexts/currency-context";
import { cn } from "@/lib/utils";
import type { Sheet } from "@/hooks/use-portfolio";

interface SheetSummaryRowProps {
  sheets: Sheet[];
  activeSheetId: string | null;
  onSheetChange: (id: string) => void;
  portfolioId: string;
  currency: string;
  btcUsdRate?: number | null;
  typeOverride?: "assets" | "debts";
}

export function SheetSummaryRow({
  sheets,
  activeSheetId,
  onSheetChange,
  portfolioId,
  currency,
  btcUsdRate,
  typeOverride,
}: SheetSummaryRowProps) {
  const router = useRouter();
  const { toBase } = useCurrency();
  const createSheet = useCreateSheet(portfolioId);
  const updateSheet = useUpdateSheet(portfolioId);
  const deleteSheet = useDeleteSheet(portfolioId);
  const reorderSheets = useReorderSheets(portfolioId);

  const [addOpen, setAddOpen] = useState(false);
  const [newSheetName, setNewSheetName] = useState("");

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [sheetToDelete, setSheetToDelete] = useState<string | null>(null);

  // Determine the current type from the active sheet or override
  const activeSheet = sheets.find((s) => s.id === activeSheetId);
  const currentType = typeOverride ?? activeSheet?.type ?? "assets";

  // Only show sheets matching the current type
  const visibleSheets = sheets.filter((s) => s.type === currentType);

  function getSheetTotal(sheet: Sheet) {
    return sheet.sections.reduce(
      (sum, section) =>
        sum +
        section.assets
          .filter((a) => !a.isArchived)
          .reduce((s, a) => s + toBase(Number(a.currentValue), a.currency), 0),
      0
    );
  }

  function handleSheetClick(sheetId: string) {
    onSheetChange(sheetId);
    router.push(`/portfolio/${portfolioId}?sheet=${sheetId}`, { scroll: false });
  }

  function handleCreate() {
    const name = newSheetName.trim();
    if (!name) return;
    createSheet.mutate(
      { name, type: currentType },
      {
        onSuccess: () => {
          setNewSheetName("");
          setAddOpen(false);
        },
      }
    );
  }

  function handleRename(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    updateSheet.mutate({ id, name }, { onSuccess: () => setRenamingId(null) });
  }

  function handleConfirmDelete() {
    if (!sheetToDelete) return;
    deleteSheet.mutate({ id: sheetToDelete });
    setSheetToDelete(null);
  }

  function moveSheet(sheetId: string, direction: -1 | 1) {
    const idx = visibleSheets.findIndex((s) => s.id === sheetId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= visibleSheets.length) return;

    const reordered = [...visibleSheets];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    reorderSheets.mutate({
      items: reordered.map((s, i) => ({ id: s.id, sortOrder: i })),
    });
  }

  return (
    <>
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {visibleSheets.map((sheet, sheetIndex) => {
          const isActive = sheet.id === activeSheetId;
          const total = getSheetTotal(sheet);
          const canMoveLeft = sheetIndex > 0;
          const canMoveRight = sheetIndex < visibleSheets.length - 1;

          return (
            <div key={sheet.id} className="group/pill flex items-center shrink-0">
              {renamingId === sheet.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRename(sheet.id);
                  }}
                  className="flex items-center"
                >
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="h-7 w-28 text-sm"
                    autoFocus
                    onBlur={() => handleRename(sheet.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                  />
                </form>
              ) : (
                <button
                  onClick={() => handleSheetClick(sheet.id)}
                  className={cn(
                    "flex flex-col items-start px-3 py-1.5 rounded-card transition-colors text-left",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <span
                    className={cn(
                      "text-tiny leading-tight",
                      isActive ? "font-bold text-foreground" : "font-medium text-muted-foreground"
                    )}
                  >
                    {sheet.name}
                  </span>
                  <MoneyDisplay
                    amount={total}
                    currency={currency}
                    btcUsdRate={btcUsdRate}
                    className={cn(
                      "text-xs font-normal tabular-lining leading-tight mt-0.5",
                      isActive ? "text-foreground/80" : "text-muted-foreground/70"
                    )}
                  />
                </button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover/pill:opacity-100 transition-opacity -ml-1"
                    />
                  }
                >
                  <MoreVertical className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onSelect={() => {
                      setRenamingId(sheet.id);
                      setRenameValue(sheet.name);
                    }}
                  >
                    Rename
                  </DropdownMenuItem>
                  {canMoveLeft && (
                    <DropdownMenuItem onSelect={() => moveSheet(sheet.id, -1)}>
                      Move Left
                    </DropdownMenuItem>
                  )}
                  {canMoveRight && (
                    <DropdownMenuItem onSelect={() => moveSheet(sheet.id, 1)}>
                      Move Right
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-destructive"
                    onSelect={() => setSheetToDelete(sheet.id)}
                  >
                    Remove Sheet
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground"
              />
            }
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setTimeout(() => setAddOpen(true), 0)}>
              <Plus className="size-4 mr-2" />
              New Sheet
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* New Sheet dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>New Sheet</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="space-y-3"
          >
            <Input
              placeholder="Sheet name"
              value={newSheetName}
              onChange={(e) => setNewSheetName(e.target.value)}
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSheet.isPending}>
                {createSheet.isPending ? "Creating..." : "Add Sheet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={sheetToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setSheetToDelete(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete sheet?</DialogTitle>
            <DialogDescription>
              All sections and assets within this sheet will be permanently
              removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSheetToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteSheet.isPending}
            >
              {deleteSheet.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
