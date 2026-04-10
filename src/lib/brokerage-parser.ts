export interface BrokeragePosition {
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  value: number;
  included: boolean;
}

export type BrokerageFormat = "fidelity" | "schwab" | "generic" | "unknown";

export interface ParsedBrokerageCSV {
  format: BrokerageFormat;
  positions: BrokeragePosition[];
  errors: string[];
}

// ── Header detection ──

const FIDELITY_HEADERS = ["symbol", "description", "quantity", "last price", "current value"];
const SCHWAB_HEADERS = ["symbol", "name", "quantity", "price", "market value"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/['"]/g, "");
}

function detectFormat(headers: string[]): BrokerageFormat {
  const norm = headers.map(normalizeHeader);
  const fidelityMatch = FIDELITY_HEADERS.every((h) => norm.includes(h));
  if (fidelityMatch) return "fidelity";
  const schwabMatch = SCHWAB_HEADERS.every((h) => norm.includes(h));
  if (schwabMatch) return "schwab";
  // Generic: needs at least symbol + (quantity or value)
  const hasSymbol = norm.some((h) => h === "symbol" || h === "ticker");
  const hasQtyOrValue = norm.some(
    (h) => h === "quantity" || h === "shares" || h === "value" || h === "market value" || h === "current value"
  );
  if (hasSymbol && hasQtyOrValue) return "generic";
  return "unknown";
}

// ── CSV parsing ──

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseNumber(raw: string): number {
  // Strip $, commas, quotes, whitespace
  const cleaned = raw.replace(/[$,'"]/g, "").trim();
  if (!cleaned || cleaned === "--" || cleaned === "n/a") return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

// ── Format-specific extractors ──

function colIndex(headers: string[], ...names: string[]): number {
  const norm = headers.map(normalizeHeader);
  for (const name of names) {
    const idx = norm.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

function extractFidelity(headers: string[], rows: string[][]): { positions: BrokeragePosition[]; errors: string[] } {
  const iSymbol = colIndex(headers, "symbol");
  const iName = colIndex(headers, "description");
  const iQty = colIndex(headers, "quantity");
  const iPrice = colIndex(headers, "last price");
  const iValue = colIndex(headers, "current value");
  const positions: BrokeragePosition[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const symbol = row[iSymbol]?.replace(/['"]/g, "").trim() ?? "";
    if (!symbol || symbol === "Total" || symbol.startsWith("***")) continue;
    // Skip cash / pending activity rows
    if (symbol === "Pending Activity" || symbol.includes("**")) continue;

    const qty = parseNumber(row[iQty] ?? "0");
    const price = parseNumber(row[iPrice] ?? "0");
    const value = parseNumber(row[iValue] ?? "0");
    const name = row[iName]?.trim() ?? symbol;

    if (value === 0 && qty === 0) continue;

    positions.push({ symbol, name, quantity: qty, price, value, included: true });
  }

  return { positions, errors };
}

function extractSchwab(headers: string[], rows: string[][]): { positions: BrokeragePosition[]; errors: string[] } {
  const iSymbol = colIndex(headers, "symbol");
  const iName = colIndex(headers, "name");
  const iQty = colIndex(headers, "quantity");
  const iPrice = colIndex(headers, "price");
  const iValue = colIndex(headers, "market value");
  const positions: BrokeragePosition[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const symbol = row[iSymbol]?.replace(/['"]/g, "").trim() ?? "";
    if (!symbol || symbol === "Account Total" || symbol === "Cash & Cash Investments") continue;

    const qty = parseNumber(row[iQty] ?? "0");
    const price = parseNumber(row[iPrice] ?? "0");
    const value = parseNumber(row[iValue] ?? "0");
    const name = row[iName]?.trim() ?? symbol;

    if (value === 0 && qty === 0) continue;

    positions.push({ symbol, name, quantity: qty, price, value, included: true });
  }

  return { positions, errors };
}

function extractGeneric(headers: string[], rows: string[][]): { positions: BrokeragePosition[]; errors: string[] } {
  const iSymbol = colIndex(headers, "symbol", "ticker");
  const iName = colIndex(headers, "name", "description");
  const iQty = colIndex(headers, "quantity", "shares");
  const iPrice = colIndex(headers, "price", "last price");
  const iValue = colIndex(headers, "value", "market value", "current value");
  const positions: BrokeragePosition[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const symbol = row[iSymbol]?.replace(/['"]/g, "").trim() ?? "";
    if (!symbol) continue;

    const qty = iQty >= 0 ? parseNumber(row[iQty] ?? "0") : 0;
    const price = iPrice >= 0 ? parseNumber(row[iPrice] ?? "0") : 0;
    let value = iValue >= 0 ? parseNumber(row[iValue] ?? "0") : 0;
    if (value === 0 && qty > 0 && price > 0) value = qty * price;
    const name = iName >= 0 ? (row[iName]?.trim() ?? symbol) : symbol;

    if (value === 0 && qty === 0) continue;

    positions.push({ symbol, name, quantity: qty, price, value, included: true });
  }

  return { positions, errors };
}

// ── Main entry point ──

export function parseBrokerageCSV(csvText: string): ParsedBrokerageCSV {
  const lines = csvText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { format: "unknown", positions: [], errors: ["CSV has no data rows"] };
  }

  // Some brokerage exports have metadata lines before headers.
  // Try to find the header row by looking for a line with known column names.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const fields = parseCSVLine(lines[i]);
    const norm = fields.map(normalizeHeader);
    if (norm.includes("symbol") || norm.includes("ticker")) {
      headerIdx = i;
      break;
    }
  }

  const headers = parseCSVLine(lines[headerIdx]);
  const format = detectFormat(headers);

  if (format === "unknown") {
    return {
      format: "unknown",
      positions: [],
      errors: [
        "Could not detect CSV format. Expected headers like Symbol, Quantity, Price, Value.",
      ],
    };
  }

  const dataRows = lines.slice(headerIdx + 1).map(parseCSVLine);

  const extractor = format === "fidelity" ? extractFidelity
    : format === "schwab" ? extractSchwab
    : extractGeneric;

  const { positions, errors } = extractor(headers, dataRows);

  return { format, positions, errors };
}

export function formatLabel(format: BrokerageFormat): string {
  switch (format) {
    case "fidelity": return "Fidelity";
    case "schwab": return "Schwab";
    case "generic": return "Generic CSV";
    case "unknown": return "Unknown";
  }
}
