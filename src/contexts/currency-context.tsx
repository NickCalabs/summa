"use client";

import { createContext, useContext } from "react";
import { convertToBase } from "@/lib/currency";

interface CurrencyContextValue {
  baseCurrency: string;
  rates: Record<string, number>;
  toBase: (amount: number, fromCurrency: string) => number;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  baseCurrency: "USD",
  rates: {},
  toBase: (amount) => amount,
});

export function CurrencyProvider({
  baseCurrency,
  rates,
  children,
}: {
  baseCurrency: string;
  rates: Record<string, number>;
  children: React.ReactNode;
}) {
  const toBase = (amount: number, fromCurrency: string) =>
    convertToBase(amount, fromCurrency, baseCurrency, rates);

  return (
    <CurrencyContext value={{ baseCurrency, rates, toBase }}>
      {children}
    </CurrencyContext>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
