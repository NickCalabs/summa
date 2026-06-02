"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import type { ExtractedBalance, SuggestedMapping, ImportSource } from "@/hooks/use-import";
import type { Asset } from "@/hooks/use-portfolio";

const SKIP = "__skip__";

export interface MappingValue {
  assetId: string | null; // null = skip
  field: "currentValue" | "quantity";
}

interface Props {
  extracted: ExtractedBalance[];
  suggestedMappings: SuggestedMapping[];
  matchedSource: ImportSource | null;
  assets: Asset[];
  defaultSourceName: string;
  onBack: () => void;
  onContinue: (params: {
    mappings: Record<string, MappingValue>;
    sourceName: string;
    saveSource: boolean;
  }) => void;
}

export function MappingStep({
  extracted,
  suggestedMappings,
  matchedSource,
  assets,
  defaultSourceName,
  onBack,
  onContinue,
}: Props) {
  const initialMappings: Record<string, MappingValue> = {};
  for (const item of extracted) {
    const suggestion = suggestedMappings.find((s) => s.extractedKey === item.account);
    const matchedAsset = suggestion?.suggestedAssetId
      ? assets.find((a) => a.id === suggestion.suggestedAssetId)
      : null;
    const defaultField: "currentValue" | "quantity" =
      suggestion?.field ??
      (matchedAsset?.currency &&
      matchedAsset.currency !== "USD" &&
      matchedAsset.currency === item.currency
        ? "quantity"
        : "currentValue");
    initialMappings[item.account] = {
      assetId: suggestion?.suggestedAssetId ?? null,
      field: defaultField,
    };
  }

  const [mappings, setMappings] = useState<Record<string, MappingValue>>(initialMappings);
  const [sourceName, setSourceName] = useState(matchedSource?.name ?? defaultSourceName);
  const [saveSource, setSaveSource] = useState(!matchedSource);

  function setMappingAsset(extractedKey: string, value: string) {
    setMappings((prev) => {
      if (value === SKIP) {
        return { ...prev, [extractedKey]: { ...prev[extractedKey], assetId: null } };
      }
      const asset = assets.find((a) => a.id === value);
      const item = extracted.find((e) => e.account === extractedKey);
      const field: "currentValue" | "quantity" =
        prev[extractedKey].field !== undefined && asset?.id === prev[extractedKey].assetId
          ? prev[extractedKey].field
          : asset?.currency && asset.currency !== "USD" && item?.currency === asset.currency
            ? "quantity"
            : "currentValue";
      return { ...prev, [extractedKey]: { assetId: value, field } };
    });
  }

  function setMappingField(extractedKey: string, field: "currentValue" | "quantity") {
    setMappings((prev) => ({
      ...prev,
      [extractedKey]: { ...prev[extractedKey], field },
    }));
  }

  const sortedAssets = [...assets].sort((a, b) => a.name.localeCompare(b.name));

  const hasAtLeastOneMapping = Object.values(mappings).some((m) => m.assetId !== null);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="source-name">Source name</Label>
        <Input
          id="source-name"
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
          placeholder="e.g., River.com"
        />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">
          Found {extracted.length} account{extracted.length === 1 ? "" : "s"}. Map each
          to a Summa asset:
        </p>
        <div className="space-y-3">
          {extracted.map((item) => {
            const mapping = mappings[item.account];
            const selectedAsset = mapping?.assetId
              ? assets.find((a) => a.id === mapping.assetId)
              : null;
            const suggestion = suggestedMappings.find((s) => s.extractedKey === item.account);
            const isHighConfidence = (suggestion?.confidence ?? 0) >= 0.8;

            return (
              <div key={item.account} className="rounded border p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.account}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.balance} {item.currency}
                      {item.confidence < 0.8 && (
                        <span className="ml-2 text-amber-600">
                          (confidence: {Math.round(item.confidence * 100)}%)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 justify-between font-normal"
                        >
                          <span className="truncate">
                            {selectedAsset
                              ? selectedAsset.name
                              : mapping?.assetId === null &&
                                  Object.prototype.hasOwnProperty.call(mappings, item.account) &&
                                  mappings[item.account].assetId === null
                                ? "Skip this account"
                                : "Select asset..."}
                          </span>
                          <ChevronDownIcon className="size-4 opacity-50 shrink-0" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent className="max-h-72 overflow-y-auto">
                      <DropdownMenuRadioGroup
                        value={mapping?.assetId ?? SKIP}
                        onValueChange={(v) => setMappingAsset(item.account, v)}
                      >
                        <DropdownMenuRadioItem value={SKIP}>
                          ⊘ Skip this account
                        </DropdownMenuRadioItem>
                        {sortedAssets.map((asset) => (
                          <DropdownMenuRadioItem key={asset.id} value={asset.id}>
                            {asset.name}{" "}
                            <span className="text-muted-foreground ml-1">
                              ({asset.currency})
                            </span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {selectedAsset && selectedAsset.quantity !== null && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="outline" size="sm" className="font-normal">
                            <span>{mapping.field === "quantity" ? "qty" : "value"}</span>
                            <ChevronDownIcon className="size-4 opacity-50 ml-1" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent>
                        <DropdownMenuRadioGroup
                          value={mapping.field}
                          onValueChange={(v) =>
                            setMappingField(item.account, v as "currentValue" | "quantity")
                          }
                        >
                          <DropdownMenuRadioItem value="currentValue">
                            Update value
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="quantity">
                            Update quantity
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {isHighConfidence && selectedAsset && (
                    <CheckIcon className="size-4 text-green-600 shrink-0" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="save-source"
          checked={saveSource}
          onCheckedChange={(c) => setSaveSource(c === true)}
        />
        <Label htmlFor="save-source" className="text-sm font-normal cursor-pointer">
          Save this mapping for future imports
        </Label>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button
          onClick={() =>
            onContinue({ mappings, sourceName: sourceName.trim(), saveSource })
          }
          disabled={!hasAtLeastOneMapping || !sourceName.trim()}
        >
          Review changes →
        </Button>
      </div>
    </div>
  );
}
