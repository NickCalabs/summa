"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/stores/ui-store";
import { useCreateAsset } from "@/hooks/use-assets";
import { parseCurrencyInput } from "@/lib/currency";
import type { Section } from "@/hooks/use-portfolio";

const ASSET_TYPES = [
  "stock",
  "etf",
  "crypto",
  "cash",
  "real_estate",
  "vehicle",
  "other",
] as const;

const TYPE_LABELS: Record<string, string> = {
  stock: "Stock",
  etf: "ETF",
  crypto: "Crypto",
  cash: "Cash",
  real_estate: "Real Estate",
  vehicle: "Vehicle",
  other: "Other",
};

interface AddAssetDialogProps {
  portfolioId: string;
  currency: string;
  sections: Section[];
}

export function AddAssetDialog({
  portfolioId,
  currency,
  sections,
}: AddAssetDialogProps) {
  const addAssetDialogSectionId = useUIStore(
    (s) => s.addAssetDialogSectionId
  );
  const closeAddAssetDialog = useUIStore((s) => s.closeAddAssetDialog);
  const createAsset = useCreateAsset(portfolioId);

  const [name, setName] = useState("");
  const [type, setType] = useState("other");
  const [valueInput, setValueInput] = useState("");
  const [qtyPriceMode, setQtyPriceMode] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [isCashEquivalent, setIsCashEquivalent] = useState(false);

  const open = addAssetDialogSectionId !== null;

  // Sync sectionId when dialog opens with a pre-selected section
  const effectiveSectionId = sectionId || addAssetDialogSectionId || "";

  function resetForm() {
    setName("");
    setType("other");
    setValueInput("");
    setQtyPriceMode(false);
    setQuantity("");
    setPrice("");
    setSectionId("");
    setIsCashEquivalent(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      closeAddAssetDialog();
      resetForm();
    }
  }

  function computedValue(): string {
    if (qtyPriceMode) {
      const q = Number(quantity) || 0;
      const p = Number(price) || 0;
      return (q * p).toFixed(2);
    }
    const parsed = parseCurrencyInput(valueInput, currency);
    return parsed.amount.toString();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !effectiveSectionId) return;

    const data: Record<string, unknown> = {
      sectionId: effectiveSectionId,
      name: trimmedName,
      type,
      currentValue: computedValue(),
      isCashEquivalent,
    };

    if (qtyPriceMode) {
      if (quantity) data.quantity = quantity;
      if (price) data.currentPrice = price;
    }

    createAsset.mutate(data as any, {
      onSuccess: () => {
        closeAddAssetDialog();
        resetForm();
      },
    });
  }

  const qtyPriceValue =
    qtyPriceMode
      ? `${(Number(quantity) || 0) * (Number(price) || 0)}`
      : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Asset</DialogTitle>
          <DialogDescription>
            Add a new asset to your portfolio.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apple Inc."
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                  />
                }
              >
                {TYPE_LABELS[type] ?? type}
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuRadioGroup
                  value={type}
                  onValueChange={setType}
                >
                  {ASSET_TYPES.map((t) => (
                    <DropdownMenuRadioItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Value</label>
              <Button
                type="button"
                variant={qtyPriceMode ? "default" : "outline"}
                size="xs"
                onClick={() => setQtyPriceMode(!qtyPriceMode)}
              >
                Qty x Price
              </Button>
            </div>
            {qtyPriceMode ? (
              <div className="flex gap-2">
                <Input
                  placeholder="Quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  type="text"
                  inputMode="decimal"
                />
                <span className="flex items-center text-muted-foreground">
                  x
                </span>
                <Input
                  placeholder="Price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  type="text"
                  inputMode="decimal"
                />
                <span className="flex items-center text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                  = {Number(qtyPriceValue).toLocaleString()}
                </span>
              </div>
            ) : (
              <Input
                placeholder="0.00"
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
                type="text"
                inputMode="decimal"
              />
            )}
          </div>

          {sections.length > 1 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Section</label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                    />
                  }
                >
                  {sections.find((s) => s.id === effectiveSectionId)?.name ??
                    "Select section"}
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
                  <DropdownMenuRadioGroup
                    value={effectiveSectionId}
                    onValueChange={setSectionId}
                  >
                    {sections.map((s) => (
                      <DropdownMenuRadioItem key={s.id} value={s.id}>
                        {s.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Cash equivalent</label>
            <div>
              <Button
                type="button"
                variant={isCashEquivalent ? "default" : "outline"}
                size="sm"
                onClick={() => setIsCashEquivalent(!isCashEquivalent)}
              >
                {isCashEquivalent ? "Yes" : "No"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createAsset.isPending}>
              {createAsset.isPending ? "Adding..." : "Add Asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
