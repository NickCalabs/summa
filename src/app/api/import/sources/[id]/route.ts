import { db } from "@/lib/db";
import { importSources } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  validateUuid,
  jsonResponse,
  errorResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, updateImportSource } from "@/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "source ID");
    const body = await parseBody(request, updateImportSource);

    const [updated] = await db
      .update(importSources)
      .set({ ...body, updatedAt: new Date() })
      .where(
        and(eq(importSources.id, id), eq(importSources.userId, user.id))
      )
      .returning();

    if (!updated) return errorResponse("Source not found", 404);
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
    validateUuid(id, "source ID");

    const [deleted] = await db
      .delete(importSources)
      .where(
        and(eq(importSources.id, id), eq(importSources.userId, user.id))
      )
      .returning();

    if (!deleted) return errorResponse("Source not found", 404);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
