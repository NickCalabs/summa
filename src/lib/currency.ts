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
