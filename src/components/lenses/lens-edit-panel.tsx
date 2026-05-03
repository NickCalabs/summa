"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useUpdateLens } from "@/hooks/use-update-lens";
import { LensPickerModal } from "./lens-picker-modal";
import type { Lens } from "@/hooks/use-lenses";
import type { Portfolio, Asset } from "@/hooks/use-portfolio";
import type { PickerAsset } from "@/lib/lens-utils";

const COLOR_PALETTE = [
  "#ef4444", // red
  "#f59e0b", // amber
  "#eab308", // yellow
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

interface LensEditPanelProps {
  lens: Lens;
  portfolio: Portfolio;
  allAssets: Asset[];
  onClose: () => void;
}

export function LensEditPanel({
  lens,
  portfolio,
  allAssets,
  onClose,
}: LensEditPanelProps) {
  const [name, setName] = useState(lens.label);
  const [description, setDescription] = useState(lens.description ?? "");
  const [color, setColor] = useState<string | null>(lens.color);
  const [isPinned, setIsPinned] = useState(lens.isPinned);
  const [assetIds, setAssetIds] = useState(lens.assetIds);
  const [pickerOpen, setPickerOpen] = useState(false);

  const updateLens = useUpdateLens();

  const pickerAssets: PickerAsset[] = allAssets.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    providerType: a.providerType,
    providerConfig: (a.providerConfig as Record<string, unknown>) ?? null,
    parentAssetId: a.parentAssetId,
    currentValueInBase: Number(a.currentValue ?? 0),
  }));

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateLens.mutate(
      {
        portfolioId: lens.portfolioId,
        lensId: lens.id,
        label: trimmed,
        description: description.trim() || null,
        color,
        isPinned,
        assetIds: assetIds.length > 0 ? assetIds : undefined,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Edit lens</SheetTitle>
            <SheetDescription>
              Update name, color, dashboard placement, or asset selection.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto py-4">
            <div className="space-y-2">
              <Label htmlFor="lens-name">Name</Label>
              <Input
                id="lens-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lens-description">Description</Label>
              <Textarea
                id="lens-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  aria-label="No color"
                  className={`size-7 rounded-full border-2 ${
                    color === null ? "border-foreground" : "border-border"
                  }`}
                  style={{
                    background:
                      "repeating-linear-gradient(45deg, transparent 0 4px, var(--muted-foreground) 4px 5px)",
                  }}
                />
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Color ${c}`}
                    className={`size-7 rounded-full border-2 ${
                      color === c ? "border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Pinned to dashboard</p>
                <p className="text-xs text-muted-foreground">
                  Show this lens as a card on the portfolio dashboard.
                </p>
              </div>
              <Switch
                checked={isPinned}
                onCheckedChange={setIsPinned}
                aria-label="Pinned to dashboard"
              />
            </div>

            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-sm font-medium">Assets</p>
              <p className="text-xs text-muted-foreground">
                {assetIds.length} asset{assetIds.length === 1 ? "" : "s"}{" "}
                selected
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPickerOpen(true)}
              >
                Edit assets
              </Button>
            </div>
          </div>

          <SheetFooter className="flex gap-2">
            <Button variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || updateLens.isPending}
              className="flex-1"
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <LensPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        assets={pickerAssets}
        initialAssetIds={assetIds}
        currency={portfolio.currency}
        btcUsdRate={portfolio.btcUsdRate}
        onSave={(ids) => {
          setAssetIds(ids);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
