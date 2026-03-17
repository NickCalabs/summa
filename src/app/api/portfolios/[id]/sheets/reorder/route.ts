import { db } from "@/lib/db";
import { sheets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, reorderItems } from "@/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, reorderItems);

    await db.transaction(async (tx) => {
      for (const item of body.items) {
        await tx
          .update(sheets)
          .set({ sortOrder: item.sortOrder })
          .where(and(eq(sheets.id, item.id), eq(sheets.portfolioId, id)));
      }
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
