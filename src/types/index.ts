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
  accounts: z.array(
    z.object({
      plaidAccountId: z.string().min(1),
      sectionId: z.string().uuid(),
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
  accounts: z.array(
    z.object({
      simplefinAccountId: z.string().min(1),
      sectionId: z.string().uuid(),
    })
  ),
});

// ── CSV schemas ──

export const csvImportConfirm = z.object({
  sectionId: z.string().uuid(),
  columnMapping: z.record(z.string(), z.string()),
  defaultCurrency: z.string().length(3).optional(),
  rows: z.array(z.record(z.string(), z.string())),
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
