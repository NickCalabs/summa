"use client";

import {
  useDisplayCurrency,
  type DisplayCurrency,
} from "@/contexts/display-currency-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon } from "lucide-react";

const OPTIONS: { value: DisplayCurrency; label: string }[] = [
  { value: "USD", label: "USD" },
  { value: "BTC", label: "BTC" },
  { value: "sats", label: "sats" },
];

export function DisplayCurrencyDropdown() {
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="gap-1 font-mono text-xs"
          />
        }
      >
        {displayCurrency}
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => setDisplayCurrency(opt.value)}
            className={opt.value === displayCurrency ? "font-semibold" : ""}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
