const COLUMN_MAP: Record<string, string> = {
  // name
  name: "name",
  asset: "name",
  account: "name",
  description: "name",
  "account name": "name",
  "asset name": "name",
  "investment name": "name",
  // currentValue
  value: "currentValue",
  amount: "currentValue",
  balance: "currentValue",
  current_value: "currentValue",
  "current value": "currentValue",
  total: "currentValue",
  // quantity
  quantity: "quantity",
  qty: "quantity",
  shares: "quantity",
  units: "quantity",
  // currentPrice
  price: "currentPrice",
  unit_price: "currentPrice",
  "unit price": "currentPrice",
  share_price: "currentPrice",
  "share price": "currentPrice",
  // currency
  currency: "currency",
  cur: "currency",
  ccy: "currency",
  // type
  type: "type",
  category: "type",
  "account type": "type",
  // notes
  notes: "notes",
  note: "notes",
  memo: "notes",
  // costBasis
  cost_basis: "costBasis",
  "cost basis": "costBasis",
  cost: "costBasis",
  book_value: "costBasis",
  "book value": "costBasis",
};

export type SourceFormat = "mint" | "empower" | "generic";

export function detectSourceFormat(headers: string[]): SourceFormat {
  const lower = headers.map((h) => h.toLowerCase().trim());

  // Mint: has Date, Description, Amount, Category
  if (
    lower.includes("date") &&
    lower.includes("description") &&
    lower.includes("amount") &&
    lower.includes("category")
  ) {
    return "mint";
  }

  // Empower (Personal Capital): has "Account Name" and ("Investment Name" or "Balance")
  if (
    lower.includes("account name") &&
    (lower.includes("investment name") || lower.includes("balance"))
  ) {
    return "empower";
  }

  return "generic";
}

export function detectColumnMapping(
  headers: string[]
): Record<string, string> {
  const format = detectSourceFormat(headers);

  if (format === "mint") {
    return buildMintMapping(headers);
  }
  if (format === "empower") {
    return buildEmpowerMapping(headers);
  }
  return buildGenericMapping(headers);
}

function buildGenericMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const key = header.toLowerCase().trim();
    const field = COLUMN_MAP[key];
    if (field && !Object.values(mapping).includes(field)) {
      mapping[header] = field;
    }
  }
  return mapping;
}

function buildMintMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    if (lower === "description") mapping[header] = "name";
    else if (lower === "amount") mapping[header] = "currentValue";
    else if (lower === "category") mapping[header] = "type";
    else if (lower === "account name") mapping[header] = "notes";
  }
  return mapping;
}

function buildEmpowerMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    if (lower === "investment name" || lower === "account name") {
      if (!Object.values(mapping).includes("name")) {
        mapping[header] = "name";
      }
    } else if (lower === "balance" || lower === "value") {
      if (!Object.values(mapping).includes("currentValue")) {
        mapping[header] = "currentValue";
      }
    } else if (lower === "account type") {
      mapping[header] = "type";
    }
  }
  return mapping;
}

export function sanitizeCsvValue(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return "'" + value;
  }
  return value;
}
