import { z } from "zod";

// ── Portfolio schemas ──

export const createPortfolio = z.object({
  name: z.string().min(1, "Name is required").max(100),
  currency: z.string().length(3).optional(),
  startDate: z.string().date().optional(),
});

export const updatePortfolio = z.object({
  name: z.string().min(1).max(100).optional(),
  currency: z.string().length(3).optional(),
  startDate: z.string().date().nullable().optional(),
});

// ── Sheet schemas ──

export const createSheet = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["assets", "debts"]).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const updateSheet = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  type: z.enum(["assets", "debts"]).optional(),
});

export const deleteSheet = z.object({
  id: z.string().uuid(),
});

// ── Section schemas ──

export const createSection = z.object({
  sheetId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const updateSection = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
});

export const deleteSection = z.object({
  id: z.string().uuid(),
});

// ── Reorder schema ──

export const reorderItems = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int().nonnegative(),
    })
  ),
});

// ── Asset schemas ──

export const createAsset = z.object({
  sectionId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(200),
  type: z.string().max(50).optional(),
  currency: z.string().length(3).optional(),
  quantity: z.string().optional(),
  costBasis: z.string().optional(),
  currentValue: z.string().optional(),
  currentPrice: z.string().optional(),
  isInvestable: z.boolean().optional(),
  isCashEquivalent: z.boolean().optional(),
  providerType: z
    .enum([
      "manual",
      "ticker",
      "wallet",
      "exchange",
      "simplefin",
      "snaptrade",
      "zillow",
      "vin",
      "custom",
      "plaid",
      "coinbase",
    ])
    .optional(),
  providerConfig: z.record(z.string(), z.unknown()).optional(),
  ownershipPct: z.string().optional(),
  taxStatus: z.enum(["taxable", "tax_deferred", "tax_free"]).nullable().optional(),
  notes: z.string().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const updateAsset = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.string().max(50).optional(),
  currency: z.string().length(3).optional(),
  quantity: z.string().optional(),
  costBasis: z.string().nullable().optional(),
  currentValue: z.string().optional(),
  currentPrice: z.string().nullable().optional(),
  isInvestable: z.boolean().optional(),
  isCashEquivalent: z.boolean().optional(),
  providerType: z
    .enum([
      "manual",
      "ticker",
      "wallet",
      "exchange",
      "simplefin",
      "snaptrade",
      "zillow",
      "vin",
      "custom",
      "plaid",
      "coinbase",
    ])
    .optional(),
  providerConfig: z.record(z.string(), z.unknown()).optional(),
  ownershipPct: z.string().optional(),
  taxStatus: z.enum(["taxable", "tax_deferred", "tax_free"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  staleDays: z.number().int().nonnegative().nullable().optional(),
  linkedDebtId: z.string().uuid().nullable().optional(),
});

export const moveAsset = z.object({
  sectionId: z.string().uuid(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const takeSnapshot = z.object({
  portfolioId: z.string().uuid(),
});

// ── Transaction schemas ──

export const createTransaction = z.object({
  type: z.enum(["buy", "sell", "deposit", "withdraw"]),
  quantity: z.string().optional(),
  price: z.string().optional(),
  total: z.string(),
  commission: z.string().optional(),
  date: z.string().date(),
  notes: z.string().optional(),
});

// ── Plaid schemas ──

export const plaidExchangeToken = z.object({
  publicToken: z.string().min(1),
  institutionId: z.string().min(1),
  institutionName: z.string().min(1),
});

export const plaidLinkAccounts = z.object({
  portfolioId: z.string().uuid(),
  accounts: z.array(
    z.object({
      plaidAccountId: z.string().min(1),
      sectionId: z.string().uuid().optional(),
    })
  ),
});

// ── SimpleFIN schemas ──

export const simplefinCreateConnection = z
  .object({
    setupToken: z.string().trim().min(1).optional(),
    accessUrl: z.string().trim().min(1).optional(),
  })
  .refine((value) => !!(value.setupToken || value.accessUrl), {
    message: "Provide a setup token or access URL",
    path: ["setupToken"],
  });

export const simplefinLinkAccounts = z.object({
  portfolioId: z.string().uuid(),
  accounts: z.array(
    z.object({
      simplefinAccountId: z.string().min(1),
      sectionId: z.string().uuid().optional(),
    })
  ),
});

// ── Coinbase schemas ──

export const coinbaseCreateConnection = z.object({
  apiKey: z.string().trim().min(1, "API key is required").max(256),
  apiSecret: z.string().trim().min(1, "API secret is required").max(256),
  label: z.string().trim().min(1).max(100).optional(),
});

// ── CSV schemas ──

export const csvImportConfirm = z.object({
  sectionId: z.string().uuid(),
  columnMapping: z.record(z.string(), z.string()),
  defaultCurrency: z.string().length(3).optional(),
  rows: z.array(z.record(z.string(), z.string())),
});

// ── Kubera import ──

export const kuberaImportAction = z
  .object({
    kuberaId: z.string(),
    action: z.enum(["create", "match", "skip"]),
    summaAssetId: z.string().uuid().optional(),
    name: z.string(),
    category: z.enum(["asset", "debt"]),
    sheetName: z.string(),
    sectionName: z.string(),
    value: z.number(),
    currency: z.string().default("USD"),
    ticker: z.string().nullable(),
    quantity: z.number().nullable(),
    price: z.number().nullable(),
    ownership: z.number().min(0).max(100).default(100),
    costBasis: z.number().nullable(),
    isInvestable: z.boolean().default(true),
    isCashEquivalent: z.boolean().default(false),
    assetType: z.string().default("other"),
    providerType: z.enum(["manual", "ticker"]).default("manual"),
    purchaseDate: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .refine((v) => v.action !== "match" || !!v.summaAssetId, {
    message: "summaAssetId required when action is match",
    path: ["summaAssetId"],
  });

export const kuberaImportRequest = z.object({
  exportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  portfolioId: z.string().uuid(),
  actions: z.array(kuberaImportAction).min(1, "At least one account required"),
});

// ── Brokerage import schemas ──

export const brokerageImportPosition = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number(),
  price: z.number(),
  value: z.number(),
});

export const brokerageImportRequest = z.object({
  portfolioId: z.string().uuid(),
  accountName: z.string().min(1).max(200),
  sectionId: z.string().uuid(),
  positions: z.array(brokerageImportPosition).min(1, "At least one position required"),
});

// ── Parse helper ──

export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<T> {
  const body = await request.json();
  const result = z.safeParse(schema, body);
  if (!result.success) {
    const flat = z.flattenError(result.error);
    throw new Response(
      JSON.stringify({ error: "Validation failed", details: flat.fieldErrors }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  return result.data;
}
