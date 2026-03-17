import { db } from "@/lib/db";
import { sheets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, createSheet, updateSheet, deleteSheet } from "@/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, createSheet);

    const [sheet] = await db
      .insert(sheets)
      .values({
        portfolioId: id,
        name: body.name,
        type: body.type ?? "assets",
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    return jsonResponse(sheet, 201);
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
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, updateSheet);

    // Verify sheet belongs to this portfolio
    const [existing] = await db
      .select()
      .from(sheets)
      .where(and(eq(sheets.id, body.id), eq(sheets.portfolioId, id)))
      .limit(1);

    if (!existing) {
      return jsonResponse({ error: "Sheet not found" }, 404);
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;

    const [updated] = await db
      .update(sheets)
      .set(updateData)
      .where(eq(sheets.id, body.id))
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
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, deleteSheet);

    // Verify sheet belongs to this portfolio
    const [existing] = await db
      .select()
      .from(sheets)
      .where(and(eq(sheets.id, body.id), eq(sheets.portfolioId, id)))
      .limit(1);

    if (!existing) {
      return jsonResponse({ error: "Sheet not found" }, 404);
    }

    await db.delete(sheets).where(eq(sheets.id, body.id));

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
