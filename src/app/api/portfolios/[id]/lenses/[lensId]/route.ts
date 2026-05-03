import { db } from "@/lib/db";
import { lenses } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
  validateUuid,
  errorResponse,
} from "@/lib/api-helpers";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; lensId: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id, lensId } = await params;
    validateUuid(id, "portfolio ID");
    validateUuid(lensId, "lens ID");
    await requirePortfolioOwnership(id, user.id);

    const result = await db
      .delete(lenses)
      .where(and(eq(lenses.id, lensId), eq(lenses.portfolioId, id)))
      .returning();

    if (result.length === 0) throw errorResponse("Lens not found", 404);

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; lensId: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id, lensId } = await params;
    validateUuid(id, "portfolio ID");
    validateUuid(lensId, "lens ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await request.json();
    const updates: Partial<{
      label: string;
      description: string | null;
      color: string | null;
      isPinned: boolean;
      assetIds: string[];
    }> = {};

    if (typeof body.label === "string") {
      const label = body.label.trim();
      if (!label) throw errorResponse("label cannot be empty", 400);
      updates.label = label;
    }
    if (body.description === null || typeof body.description === "string") {
      updates.description =
        typeof body.description === "string"
          ? body.description.trim() || null
          : null;
    }
    if (body.color === null || typeof body.color === "string") {
      updates.color = body.color;
    }
    if (typeof body.isPinned === "boolean") {
      updates.isPinned = body.isPinned;
    }
    if (Array.isArray(body.assetIds)) {
      const assetIds = body.assetIds.filter(
        (v: unknown): v is string => typeof v === "string"
      );
      if (assetIds.length === 0)
        throw errorResponse("assetIds must be a non-empty array", 400);
      updates.assetIds = assetIds;
    }

    if (Object.keys(updates).length === 0) {
      throw errorResponse("no updatable fields provided", 400);
    }

    const [updated] = await db
      .update(lenses)
      .set(updates)
      .where(and(eq(lenses.id, lensId), eq(lenses.portfolioId, id)))
      .returning();

    if (!updated) throw errorResponse("Lens not found", 404);

    return jsonResponse(updated);
  } catch (error) {
    return handleError(error);
  }
}
