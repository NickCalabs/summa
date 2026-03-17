interface ParsedCurrency {
  amount: number;
  currency: string | null;
}

const SYMBOL_MAP: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₿": "BTC",
  "₹": "INR",
};

const SYMBOL_REGEX = /^[$€£¥₿₹]/;
const ISO_PREFIX_REGEX = /^([A-Z]{3})\s+/;
const ISO_SUFFIX_REGEX = /\s+([A-Z]{3})$/;

export function parseCurrencyInput(
  input: string,
  defaultCurrency?: string
): ParsedCurrency {
  const trimmed = input.trim();
  if (!trimmed) return { amount: 0, currency: defaultCurrency ?? null };

  let currency: string | null = null;
  let numericPart = trimmed;

  // Check symbol prefix
  const symbolMatch = trimmed.match(SYMBOL_REGEX);
  if (symbolMatch) {
    currency = SYMBOL_MAP[symbolMatch[0]] ?? null;
    numericPart = trimmed.slice(1).trim();
  } else {
    // Check ISO prefix (e.g. "EUR 500")
    const prefixMatch = trimmed.match(ISO_PREFIX_REGEX);
    if (prefixMatch) {
      currency = prefixMatch[1];
      numericPart = trimmed.slice(prefixMatch[0].length);
    } else {
      // Check ISO suffix (e.g. "500 EUR")
      const suffixMatch = trimmed.match(ISO_SUFFIX_REGEX);
      if (suffixMatch) {
        currency = suffixMatch[1];
        numericPart = trimmed.slice(0, -suffixMatch[0].length);
      }
    }
  }

  // Strip commas and parse
  const cleaned = numericPart.replace(/,/g, "").trim();
  const amount = Number(cleaned);

  return {
    amount: isNaN(amount) ? 0 : amount,
    currency: currency ?? defaultCurrency ?? null,
  };
}

export function formatNumberForInput(value: string | number | null): string {
  if (value == null) return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return String(num);
}

/**
 * Convert an amount from a foreign currency to the base currency.
 * Rates map is keyed by foreign currency code with values meaning "1 base = X foreign".
 * So foreign → base = amount / rates[fromCurrency].
 */
export function convertToBase(
  amount: number,
  fromCurrency: string,
  baseCurrency: string,
  rates: Record<string, number>
): number {
  if (fromCurrency === baseCurrency) return amount;
  const rate = rates[fromCurrency];
  if (!rate) return amount; // graceful fallback
  return amount / rate;
}

/**
 * Full cross-rate conversion. `rateMapBase` is the base currency of the rates map.
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
  rateMapBase: string
): number {
  if (from === to) return amount;
  if (from === rateMapBase) return amount * rates[to];
  if (to === rateMapBase) return amount / rates[from];
  // Cross-rate: from → base → to
  return (amount / rates[from]) * rates[to];
}
