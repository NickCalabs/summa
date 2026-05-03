"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import {
  buildPickerGroups,
  expandSelection,
  type PickerAsset,
  type PickerSelection,
} from "@/lib/lens-utils";

interface LensPickerModalProps {
  open: boolean;
  onClose: () => void;
  assets: PickerAsset[];
  initialAssetIds: string[];
  currency: string;
  btcUsdRate: number | null;
  onSave: (assetIds: string[]) => void;
}

export function LensPickerModal({
  open,
  onClose,
  assets,
  initialAssetIds,
  currency,
  btcUsdRate,
  onSave,
}: LensPickerModalProps) {
  const groups = useMemo(() => buildPickerGroups(assets), [assets]);
  const [advanced, setAdvanced] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Initial selection: figure out which group keys are fully selected (all
  // their members are in initialAssetIds), and which individual assets are
  // selected outside any fully-selected group.
  const initial = useMemo<PickerSelection>(() => {
    const initialSet = new Set(initialAssetIds);
    const groupKeys: string[] = [];
    const individualIds: string[] = [];
    for (const group of groups) {
      const allIn = group.assetIds.every((id) => initialSet.has(id));
      if (allIn && group.assetIds.length > 0) {
        groupKeys.push(group.key);
      } else {
        for (const id of group.assetIds) {
          if (initialSet.has(id)) individualIds.push(id);
        }
      }
    }
    return { groupKeys, assetIds: individualIds };
  }, [groups, initialAssetIds]);

  const [selection, setSelection] = useState<PickerSelection>(initial);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.label.toLowerCase().includes(q) ||
        g.assets.some((a) => a.name.toLowerCase().includes(q))
    );
  }, [groups, search]);

  const toggleGroup = (key: string) => {
    setSelection((s) => {
      const groupKeys = s.groupKeys.includes(key)
        ? s.groupKeys.filter((k) => k !== key)
        : [...s.groupKeys, key];
      return { ...s, groupKeys };
    });
  };

  const toggleAsset = (id: string) => {
    setSelection((s) => {
      const assetIds = s.assetIds.includes(id)
        ? s.assetIds.filter((x) => x !== id)
        : [...s.assetIds, id];
      return { ...s, assetIds };
    });
  };

  const toggleExpanded = (key: string) => {
    setExpanded((e) => {
      const next = new Set(e);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = () => {
    const ids = expandSelection(selection, assets);
    if (ids.length === 0) return;
    onSave(ids);
  };

  const expandedIds = useMemo(
    () => expandSelection(selection, assets),
    [selection, assets]
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select assets</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets..."
              className="pl-8"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={advanced}
              onCheckedChange={setAdvanced}
              aria-label="Advanced mode"
            />
            Advanced
          </label>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {filteredGroups.map((group) => {
            const groupChecked = selection.groupKeys.includes(group.key);
            const isExpanded = expanded.has(group.key) || advanced;
            return (
              <div
                key={group.key}
                className="rounded-md border border-border"
              >
                <div className="flex items-center gap-2 p-2">
                  <Checkbox
                    checked={groupChecked}
                    onCheckedChange={() => toggleGroup(group.key)}
                    aria-label={`Select ${group.label}`}
                  />
                  {advanced || group.assets.length > 1 ? (
                    <button
                      type="button"
                      className="size-5 grid place-items-center text-muted-foreground hover:text-foreground"
                      onClick={() => toggleExpanded(group.key)}
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="size-4" />
                      ) : (
                        <ChevronRightIcon className="size-4" />
                      )}
                    </button>
                  ) : (
                    <span className="size-5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {group.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {group.assets.length} source
                      {group.assets.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <MoneyDisplay
                    amount={group.totalValue}
                    currency={currency}
                    btcUsdRate={btcUsdRate}
                    className="text-sm tabular-nums"
                  />
                </div>

                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 px-2 py-1.5 space-y-1">
                    {group.assets.map((asset) => {
                      const checked =
                        groupChecked || selection.assetIds.includes(asset.id);
                      return (
                        <div
                          key={asset.id}
                          className="flex items-center gap-2 pl-7 py-1"
                        >
                          <Checkbox
                            checked={checked}
                            disabled={groupChecked}
                            onCheckedChange={() => toggleAsset(asset.id)}
                            aria-label={`Select ${asset.name}`}
                          />
                          <p className="flex-1 text-sm truncate">
                            {asset.name}
                          </p>
                          <MoneyDisplay
                            amount={asset.currentValueInBase}
                            currency={currency}
                            btcUsdRate={btcUsdRate}
                            className="text-xs text-muted-foreground tabular-nums"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {filteredGroups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No assets match your search.
            </p>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {expandedIds.length} asset{expandedIds.length === 1 ? "" : "s"}{" "}
            selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={expandedIds.length === 0}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
