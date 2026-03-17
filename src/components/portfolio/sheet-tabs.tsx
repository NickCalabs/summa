"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { useCreateSheet, useUpdateSheet, useDeleteSheet } from "@/hooks/use-sheets";
import type { Sheet } from "@/hooks/use-portfolio";

interface SheetTabsProps {
  sheets: Sheet[];
  activeSheetId: string | null;
  onSheetChange: (id: string) => void;
  portfolioId: string;
}

export function SheetTabs({ sheets, activeSheetId, onSheetChange, portfolioId }: SheetTabsProps) {
  const createSheet = useCreateSheet(portfolioId);
  const updateSheet = useUpdateSheet(portfolioId);
  const deleteSheet = useDeleteSheet(portfolioId);

  const [newSheetName, setNewSheetName] = useState("");
  const [newSheetType, setNewSheetType] = useState<"assets" | "debts">("assets");
  const [addOpen, setAddOpen] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [sheetToDelete, setSheetToDelete] = useState<string | null>(null);

  function handleCreate() {
    const name = newSheetName.trim();
    if (!name) return;
    createSheet.mutate(
      { name, type: newSheetType },
      {
        onSuccess: () => {
          setNewSheetName("");
          setNewSheetType("assets");
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

  return (
    <>
      <Tabs
        value={activeSheetId ?? sheets[0]?.id}
        onValueChange={(value) => onSheetChange(value as string)}
      >
        <div className="flex items-center gap-1">
          <TabsList variant="line" className="flex-1">
            {sheets.map((sheet) => (
              <div key={sheet.id} className="group/tab flex items-center">
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
                      className="h-6 w-28 text-sm"
                      autoFocus
                      onBlur={() => setRenamingId(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                  </form>
                ) : (
                  <TabsTrigger value={sheet.id} className="gap-1.5">
                    {sheet.name}
                    <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                      {sheet.type}
                    </Badge>
                  </TabsTrigger>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover/tab:opacity-100 transition-opacity" />}
                  >
                    <MoreVerticalIcon />
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
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => setSheetToDelete(sheet.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </TabsList>

          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" />}>
              <PlusIcon />
            </PopoverTrigger>
            <PopoverContent className="w-64">
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
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={newSheetType === "assets" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewSheetType("assets")}
                  >
                    Assets
                  </Button>
                  <Button
                    type="button"
                    variant={newSheetType === "debts" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewSheetType("debts")}
                  >
                    Debts
                  </Button>
                </div>
                <Button type="submit" size="sm" className="w-full" disabled={createSheet.isPending}>
                  {createSheet.isPending ? "Creating..." : "Add Sheet"}
                </Button>
              </form>
            </PopoverContent>
          </Popover>
        </div>
      </Tabs>

      <Dialog open={sheetToDelete !== null} onOpenChange={(open) => { if (!open) setSheetToDelete(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete sheet?</DialogTitle>
            <DialogDescription>
              All sections and assets within this sheet will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSheetToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteSheet.isPending}>
              {deleteSheet.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function MoreVerticalIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}
