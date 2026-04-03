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
        // Only update sections that belong to sheets in this portfolio
        const [section] = await tx
          .select({ id: sections.id })
          .from(sections)
          .innerJoin(sheets, eq(sections.sheetId, sheets.id))
          .where(and(eq(sections.id, item.id), eq(sheets.portfolioId, id)))
          .limit(1);

        if (section) {
          await tx
            .update(sections)
            .set({ sortOrder: item.sortOrder })
            .where(eq(sections.id, item.id));
        }
      }
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
