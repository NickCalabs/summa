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
import { parseBody, reorderItems } from "@/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, reorderItems);

    await db.transaction(async (tx) => {
      for (const item of body.items) {
        // Verify asset belongs to this portfolio via section → sheet chain
        const rows = await tx
          .select({ id: assets.id })
          .from(assets)
          .innerJoin(sections, eq(assets.sectionId, sections.id))
          .innerJoin(sheets, eq(sections.sheetId, sheets.id))
          .where(and(eq(assets.id, item.id), eq(sheets.portfolioId, id)))
          .limit(1);

        if (rows.length > 0) {
          await tx
            .update(assets)
            .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
            .where(eq(assets.id, item.id));
        }
      }
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
