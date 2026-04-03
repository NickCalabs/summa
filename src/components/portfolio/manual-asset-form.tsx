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

interface ManualAssetFormProps {
  portfolioId: string;
  currency: string;
  sections: Section[];
  defaultSectionId: string;
  defaultType?: string;
  onSuccess: () => void;
}

export function ManualAssetForm({
  portfolioId,
  currency,
  sections,
  defaultSectionId,
  defaultType,
  onSuccess,
}: ManualAssetFormProps) {
  const createAsset = useCreateAsset(portfolioId);

  const [name, setName] = useState("");
  const [type, setType] = useState(defaultType ?? "other");
  const [valueInput, setValueInput] = useState("");
  const [sectionId, setSectionId] = useState(defaultSectionId);
  const [isCashEquivalent, setIsCashEquivalent] = useState(false);
  const [valueError, setValueError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !sectionId) return;

    const parsed = parseCurrencyInput(valueInput, currency);
    if (parsed.amount === 0) {
      setValueError("Please enter a value greater than 0.");
      return;
    }

    createAsset.mutate(
      {
        sectionId,
        name: trimmedName,
        type,
        currentValue: parsed.amount.toString(),
        isCashEquivalent,
      } as any,
      { onSuccess }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Name</label>
        <Input
          placeholder="Account or asset name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      {!defaultType && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Type</label>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" className="w-full justify-start" />
              }
            >
              {TYPE_LABELS[type] ?? type}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuRadioGroup value={type} onValueChange={setType}>
                {ASSET_TYPES.map((t) => (
                  <DropdownMenuRadioItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Value</label>
        <Input
          placeholder="0.00"
          value={valueInput}
          onChange={(e) => {
            setValueInput(e.target.value);
            setValueError("");
          }}
          type="text"
          inputMode="decimal"
          className={valueError ? "border-red-500" : undefined}
        />
        {valueError && <p className="text-sm text-red-500">{valueError}</p>}
      </div>

      {sections.length > 1 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Section</label>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" className="w-full justify-start" />
              }
            >
              {sections.find((s) => s.id === sectionId)?.name ?? "Select section"}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuRadioGroup
                value={sectionId}
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

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={createAsset.isPending}>
          {createAsset.isPending ? "Adding..." : "Add"}
        </Button>
      </div>
    </form>
  );
}
