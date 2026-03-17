import { db } from "@/lib/db";
import { portfolioSnapshots } from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    await requirePortfolioOwnership(id, user.id);

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const conditions = [eq(portfolioSnapshots.portfolioId, id)];
    if (from) conditions.push(gte(portfolioSnapshots.date, from));
    if (to) conditions.push(lte(portfolioSnapshots.date, to));

    const snapshots = await db
      .select()
      .from(portfolioSnapshots)
      .where(and(...conditions))
      .orderBy(desc(portfolioSnapshots.date));

    return jsonResponse(snapshots);
  } catch (error) {
    return handleError(error);
  }
}
