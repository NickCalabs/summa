import { db } from "@/lib/db";
import { lenses, assets, sections, sheets } from "@/lib/db/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
  validateUuid,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const rows = await db
      .select()
      .from(lenses)
      .where(eq(lenses.portfolioId, id))
      .orderBy(asc(lenses.sortOrder), asc(lenses.createdAt));

    // Filter archived asset IDs out of each lens's assetIds at read time.
    // Soft-deleted assets stay in the column but are hidden from views.
    const allIds = Array.from(new Set(rows.flatMap((r) => r.assetIds)));
    if (allIds.length === 0) return jsonResponse(rows);

    const liveAssets = await db
      .select({ id: assets.id })
      .from(assets)
      .innerJoin(sections, eq(assets.sectionId, sections.id))
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .where(
        and(
          eq(sheets.portfolioId, id),
          eq(assets.isArchived, false),
          inArray(assets.id, allIds)
        )
      );

    const liveSet = new Set(liveAssets.map((a) => a.id));
    const filtered = rows.map((r) => ({
      ...r,
      assetIds: r.assetIds.filter((aid) => liveSet.has(aid)),
    }));

    return jsonResponse(filtered);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await request.json();
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : null;
    const color = typeof body.color === "string" ? body.color : null;
    const isPinned = typeof body.isPinned === "boolean" ? body.isPinned : true;
    const assetIds = Array.isArray(body.assetIds)
      ? body.assetIds.filter((v: unknown): v is string => typeof v === "string")
      : [];

    if (!label) throw errorResponse("label is required", 400);
    if (assetIds.length === 0)
      throw errorResponse("assetIds must be a non-empty array", 400);

    const [created] = await db
      .insert(lenses)
      .values({
        portfolioId: id,
        label,
        description,
        color,
        isPinned,
        assetIds,
      })
      .returning();

    return jsonResponse(created, 201);
  } catch (error) {
    return handleError(error);
  }
}
