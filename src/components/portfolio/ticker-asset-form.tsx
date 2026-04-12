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
import { TickerSearchCombobox } from "./ticker-search-combobox";
import { useCreateAsset } from "@/hooks/use-assets";
import type { Section } from "@/hooks/use-portfolio";
import type { SearchResult } from "@/lib/providers/types";

interface TickerAssetFormProps {
  portfolioId: string;
  currency: string;
  sections: Section[];
  defaultSectionId: string;
  onSuccess: () => void;
}

export function TickerAssetForm({
  portfolioId,
  currency,
  sections,
  defaultSectionId,
  onSuccess,
}: TickerAssetFormProps) {
  const createAsset = useCreateAsset(portfolioId);

  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("stock");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [sectionId, setSectionId] = useState(defaultSectionId);
  const [providerConfig, setProviderConfig] = useState<Record<string, unknown>>(
    {}
  );
  const [valueError, setValueError] = useState("");
  const [tickerSelected, setTickerSelected] = useState(false);

  function handleTickerSelect(result: SearchResult) {
    setSearch(result.name);
    setName(result.name);
    setType(result.type);
    setTickerSelected(true);
    setProviderConfig({
      ticker: result.symbol,
      source: result.source,
      exchange: result.exchange,
    });
    setQuantity("1");

    fetch(
      `/api/prices/quote?symbol=${encodeURIComponent(result.symbol)}&source=${encodeURIComponent(result.source)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.price != null) setPrice(String(data.price));
      })
      .catch(() => {});
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !sectionId) return;

    const q = Number(quantity) || 0;
    const p = Number(price) || 0;
    const value = q * p;

    if (value === 0 && !providerConfig.ticker) {
      setValueError("Search and select a ticker first.");
      return;
    }

    createAsset.mutate(
      {
        sectionId,
        name: trimmedName,
        type,
        quantity,
        currentPrice: price,
        currentValue: value.toFixed(2),
        providerType: "ticker",
        providerConfig,
      } as any,
      { onSuccess }
    );
  }

  const computedValue = (Number(quantity) || 0) * (Number(price) || 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Search Ticker</label>
        <TickerSearchCombobox
          value={search}
          onChange={(v) => {
            setSearch(v);
            if (tickerSelected) {
              setTickerSelected(false);
              setProviderConfig({});
              setPrice("");
            }
          }}
          onSelect={handleTickerSelect}
          autoFocus
        />
      </div>

      {tickerSelected && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cold Storage BTC, Coinbase BTC"
          />
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Quantity x Price</label>
        <div className="flex gap-2">
          <Input
            placeholder="Quantity"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              setValueError("");
            }}
            type="text"
            inputMode="decimal"
            className={valueError ? "border-red-500" : undefined}
          />
          <span className="flex items-center text-muted-foreground">x</span>
          <Input
            placeholder="Price"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setValueError("");
            }}
            type="text"
            inputMode="decimal"
            className={valueError ? "border-red-500" : undefined}
          />
          <span className="flex items-center text-sm tabular-nums text-muted-foreground whitespace-nowrap">
            = {computedValue.toLocaleString()}
          </span>
        </div>
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
              {sections.find((s) => s.id === sectionId)?.name ??
                "Select section"}
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

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={createAsset.isPending}>
          {createAsset.isPending ? "Adding..." : "Add"}
        </Button>
      </div>
    </form>
  );
}
