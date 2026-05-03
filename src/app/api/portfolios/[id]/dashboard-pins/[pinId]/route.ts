import { db } from "@/lib/db";
import { dashboardPins } from "@/lib/db/schema";
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
  { params }: { params: Promise<{ id: string; pinId: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id, pinId } = await params;
    validateUuid(id, "portfolio ID");
    validateUuid(pinId, "pin ID");
    await requirePortfolioOwnership(id, user.id);

    const result = await db
      .delete(dashboardPins)
      .where(
        and(eq(dashboardPins.id, pinId), eq(dashboardPins.portfolioId, id))
      )
      .returning();

    if (result.length === 0) throw errorResponse("Pin not found", 404);

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
