// src/lib/kubera-parser.ts

// ── Kubera JSON shape ──

export interface KuberaAccount {
  id: string;
  name: string;
  sectionId: string;
  sectionName: string;
  sheetId: string;
  sheetName: string;
  category: "asset" | "debt";
  value: { amount: number; currency: string };
  ticker?: string;
  quantity?: number;
  investable?: string;
  ownership?: number;
  subType?: string;
  rate?: { price: number; currency: string };
  assetClass?: string;
  type?: string;
  purchaseDate?: string;
  isManual?: boolean;
  connection?: { aggregator?: string; providerName?: string };
  cost?: { amount: number; currency: string };
  description?: string;
  notes?: string;
}

interface KuberaExport {
  asset?: KuberaAccount[];
  debt?: KuberaAccount[];
}

// ── Parsed output ──

export type ImportAction = "create" | "match" | "skip";

export interface ParsedAccount {
  kuberaId: string;
  name: string;
  category: "asset" | "debt";
  sheetName: string;
  sectionName: string;
  value: number;
  currency: string;
  ticker: string | null;
  quantity: number | null;
  price: number | null;
  ownership: number; // 0-100 (Summa scale)
  costBasis: number | null;
  isInvestable: boolean;
  isCashEquivalent: boolean;
  assetType: string;
  providerType: "manual" | "ticker";
  purchaseDate: string | null;
  notes: string | null;
  action: ImportAction;
  matchedAssetId: string | null;
}

export interface ParsedSheet {
  name: string;
  type: "assets" | "debts";
  sections: ParsedSection[];
}

export interface ParsedSection {
  name: string;
  sheetName: string;
  accounts: ParsedAccount[];
}

export interface ParsedImport {
  sheets: ParsedSheet[];
  totalAccounts: number;
}

// ── Map a single Kubera account to Summa fields ──

function mapAccount(k: KuberaAccount): ParsedAccount {
  const ticker = k.ticker && k.ticker !== "USD" ? k.ticker : null;
  return {
    kuberaId: k.id,
    name: k.name,
    category: k.category,
    sheetName: k.sheetName,
    sectionName: k.sectionName,
    value: k.value?.amount ?? 0,
    currency: k.value?.currency ?? "USD",
    ticker,
    quantity: k.quantity ?? null,
    price: k.rate?.price ?? null,
    ownership: (k.ownership ?? 1) * 100,
    costBasis: k.cost?.amount ?? null,
    isInvestable: k.investable === "investable_cash" || k.investable === "investable_easy_convert",
    isCashEquivalent: k.investable === "investable_cash",
    assetType: k.assetClass ?? k.type ?? "other",
    providerType: ticker ? "ticker" : "manual",
    purchaseDate: k.purchaseDate ?? null,
    notes: [k.notes, k.description, k.purchaseDate ? `Purchased: ${k.purchaseDate}` : null]
      .filter(Boolean)
      .join(" | ") || null,
    action: "create",
    matchedAssetId: null,
  };
}

// ── Parse full export into tree ──

export function parseKuberaJson(raw: string): ParsedImport {
  let data: KuberaExport;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON file. Please upload a Kubera JSON export.");
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid Kubera export. Expected a JSON object with 'asset' and/or 'debt' arrays.");
  }

  const assetArray = Array.isArray(data.asset) ? data.asset : [];
  const debtArray = Array.isArray(data.debt) ? data.debt : [];
  const allAccounts = [...assetArray, ...debtArray];

  if (allAccounts.length === 0) {
    throw new Error("No accounts found in the Kubera export. Expected 'asset' or 'debt' arrays.");
  }

  const sheetMap = new Map<string, ParsedSheet>();

  for (const k of allAccounts) {
    const mapped = mapAccount(k);
    const sheetKey = k.sheetName;

    if (!sheetMap.has(sheetKey)) {
      sheetMap.set(sheetKey, {
        name: k.sheetName,
        type: k.category === "debt" ? "debts" : "assets",
        sections: [],
      });
    }

    const sheet = sheetMap.get(sheetKey)!;
    let section = sheet.sections.find((s) => s.name === k.sectionName);
    if (!section) {
      section = { name: k.sectionName, sheetName: k.sheetName, accounts: [] };
      sheet.sections.push(section);
    }

    section.accounts.push(mapped);
  }

  return {
    sheets: Array.from(sheetMap.values()),
    totalAccounts: allAccounts.length,
  };
}

// ── Auto-match against existing Summa assets ──

interface ExistingAsset {
  id: string;
  name: string;
  providerType: string;
}

export function autoMatch(
  parsed: ParsedImport,
  existingAssets: ExistingAsset[]
): ParsedImport {
  const result = structuredClone(parsed);

  for (const sheet of result.sheets) {
    for (const section of sheet.sections) {
      for (const account of section.accounts) {
        // Exact match
        const exact = existingAssets.find(
          (a) => a.name === account.name
        );
        if (exact) {
          account.action = "match";
          account.matchedAssetId = exact.id;
          continue;
        }

        // Case-insensitive substring match
        const partial = existingAssets.find(
          (a) =>
            a.name.toLowerCase().includes(account.name.toLowerCase()) ||
            account.name.toLowerCase().includes(a.name.toLowerCase())
        );
        if (partial) {
          account.action = "match";
          account.matchedAssetId = partial.id;
          continue;
        }

        // No match — default to create
        account.action = "create";
        account.matchedAssetId = null;
      }
    }
  }

  return result;
}
