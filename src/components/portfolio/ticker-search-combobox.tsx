"use client";

import { useState, useRef } from "react";
import {
  Command,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTickerSearch } from "@/hooks/use-ticker-search";
import type { SearchResult } from "@/lib/providers/types";

interface TickerSearchComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: SearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function TickerSearchCombobox({
  value,
  onChange,
  onSelect,
  placeholder = "e.g. AAPL or Bitcoin",
  autoFocus,
}: TickerSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { data: results = [] } = useTickerSearch(value);

  const showDropdown = open && results.length > 0;

  function handleSelect(result: SearchResult) {
    onSelect(result);
    setOpen(false);
  }

  function handleFocus() {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    setOpen(true);
  }

  function handleBlur() {
    blurTimeoutRef.current = setTimeout(() => setOpen(false), 200);
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {showDropdown && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg bg-popover shadow-md ring-1 ring-foreground/10"
          onMouseDown={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {results.map((r) => (
                  <CommandItem
                    key={`${r.source}:${r.symbol}`}
                    value={`${r.source}:${r.symbol}`}
                    onSelect={() => handleSelect(r)}
                  >
                    <span className="font-mono font-bold text-xs">
                      {r.source === "coingecko" ? r.symbol : r.symbol}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {r.name}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <Badge variant="secondary" className="text-[9px]">
                        {r.type}
                      </Badge>
                      <Badge variant="outline" className="text-[9px]">
                        {r.source === "yahoo" ? r.exchange : "CoinGecko"}
                      </Badge>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
