import { db } from "@/lib/db";
import { assets, sections, sheets, portfolios } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  requireAssetOwnership,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, moveAsset } from "@/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    await requireAssetOwnership(id, user.id);

    const body = await parseBody(request, moveAsset);

    // Verify destination section belongs to a portfolio owned by this user
    const rows = await db
      .select({ sectionId: sections.id })
      .from(sections)
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .innerJoin(portfolios, eq(sheets.portfolioId, portfolios.id))
      .where(and(eq(sections.id, body.sectionId), eq(portfolios.userId, user.id)))
      .limit(1);

    if (rows.length === 0) {
      return jsonResponse({ error: "Destination section not found" }, 404);
    }

    const updateData: Record<string, unknown> = {
      sectionId: body.sectionId,
      updatedAt: new Date(),
    };
    if (body.sortOrder !== undefined) {
      updateData.sortOrder = body.sortOrder;
    }

    const [updated] = await db
      .update(assets)
      .set(updateData)
      .where(eq(assets.id, id))
      .returning();

    return jsonResponse(updated);
  } catch (error) {
    return handleError(error);
  }
}
