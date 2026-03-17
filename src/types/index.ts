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
    ])
    .optional(),
  providerConfig: z.record(z.string(), z.unknown()).optional(),
  ownershipPct: z.string().optional(),
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
    ])
    .optional(),
  providerConfig: z.record(z.string(), z.unknown()).optional(),
  ownershipPct: z.string().optional(),
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
