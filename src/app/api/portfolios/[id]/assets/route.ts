import { db } from "@/lib/db";
import { assets, sections, sheets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
  validateUuid,
} from "@/lib/api-helpers";
import { parseBody, createAsset } from "@/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, createAsset);

    // Verify sectionId chain: section → sheet → this portfolio
    const rows = await db
      .select({ sectionId: sections.id })
      .from(sections)
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .where(and(eq(sections.id, body.sectionId), eq(sheets.portfolioId, id)))
      .limit(1);

    if (rows.length === 0) {
      return jsonResponse({ error: "Section not found in this portfolio" }, 404);
    }

    const [asset] = await db
      .insert(assets)
      .values({
        sectionId: body.sectionId,
        name: body.name,
        type: body.type ?? "other",
        currency: body.currency ?? "USD",
        quantity: body.quantity,
        costBasis: body.costBasis,
        currentValue: body.currentValue ?? "0",
        currentPrice: body.currentPrice,
        isInvestable: body.isInvestable ?? true,
        isCashEquivalent: body.isCashEquivalent ?? false,
        providerType: body.providerType ?? "manual",
        providerConfig: body.providerConfig ?? {},
        ownershipPct: body.ownershipPct ?? "100",
        notes: body.notes,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    return jsonResponse(asset, 201);
  } catch (error) {
    return handleError(error);
  }
}
