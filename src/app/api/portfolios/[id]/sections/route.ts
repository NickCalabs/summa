import { db } from "@/lib/db";
import { sections, sheets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
  validateUuid,
} from "@/lib/api-helpers";
import { parseBody, createSection, updateSection, deleteSection } from "@/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, createSection);

    // Verify sheet belongs to this portfolio
    const [sheet] = await db
      .select()
      .from(sheets)
      .where(and(eq(sheets.id, body.sheetId), eq(sheets.portfolioId, id)))
      .limit(1);

    if (!sheet) {
      return jsonResponse({ error: "Sheet not found in this portfolio" }, 404);
    }

    const [section] = await db
      .insert(sections)
      .values({
        sheetId: body.sheetId,
        name: body.name,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    return jsonResponse(section, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, updateSection);

    // Verify section belongs to a sheet in this portfolio
    const rows = await db
      .select({ section: sections })
      .from(sections)
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .where(and(eq(sections.id, body.id), eq(sheets.portfolioId, id)))
      .limit(1);

    if (rows.length === 0) {
      return jsonResponse({ error: "Section not found" }, 404);
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;

    const [updated] = await db
      .update(sections)
      .set(updateData)
      .where(eq(sections.id, body.id))
      .returning();

    return jsonResponse(updated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, deleteSection);

    // Verify section belongs to a sheet in this portfolio
    const rows = await db
      .select({ section: sections })
      .from(sections)
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .where(and(eq(sections.id, body.id), eq(sheets.portfolioId, id)))
      .limit(1);

    if (rows.length === 0) {
      return jsonResponse({ error: "Section not found" }, 404);
    }

    await db.delete(sections).where(eq(sections.id, body.id));

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
