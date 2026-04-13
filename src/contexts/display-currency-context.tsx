"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type DisplayCurrency = "USD" | "BTC" | "sats";

interface DisplayCurrencyContextValue {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (c: DisplayCurrency) => void;
  /** Convert a USD amount to display currency using a given BTC/USD rate */
  convert: (usdAmount: number, btcUsdRate: number | null) => number;
  /** Format a value already in display currency */
  format: (displayValue: number) => string;
  /** Format a compact value (for chart axes) */
  formatCompact: (displayValue: number) => string;
}

const STORAGE_KEY = "summa-display-currency";
const Ctx = createContext<DisplayCurrencyContextValue | null>(null);

export function DisplayCurrencyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [displayCurrency, setState] = useState<DisplayCurrency>("USD");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as DisplayCurrency | null;
      if (stored === "USD" || stored === "BTC" || stored === "sats") {
        setState(stored);
      }
    } catch {}
  }, []);

  const setDisplayCurrency = (c: DisplayCurrency) => {
    setState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {}
  };

  const convert = (usd: number, btcUsdRate: number | null) => {
    if (displayCurrency === "USD" || !btcUsdRate) return usd;
    const btc = usd / btcUsdRate;
    return displayCurrency === "sats" ? btc * 1e8 : btc;
  };

  const format = (val: number) => {
    if (displayCurrency === "USD") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(val);
    }
    if (displayCurrency === "BTC") {
      return `\u20bf${val >= 1 ? val.toFixed(4) : val.toFixed(6)}`;
    }
    // sats
    return `${Math.round(val).toLocaleString("en-US")} sats`;
  };

  const formatCompact = (val: number) => {
    if (displayCurrency === "USD") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(val);
    }
    if (displayCurrency === "BTC") {
      if (Math.abs(val) >= 1) return `\u20bf${val.toFixed(2)}`;
      return `\u20bf${val.toFixed(4)}`;
    }
    // sats
    return (
      new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(Math.round(val)) + " sats"
    );
  };

  return (
    <Ctx
      value={{
        displayCurrency,
        setDisplayCurrency,
        convert,
        format,
        formatCompact,
      }}
    >
      {children}
    </Ctx>
  );
}

export function useDisplayCurrency() {
  const v = useContext(Ctx);
  if (!v)
    throw new Error(
      "useDisplayCurrency must be used inside DisplayCurrencyProvider"
    );
  return v;
}
