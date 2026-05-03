import { db } from "@/lib/db";
import { dashboardPins } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
  validateUuid,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const pins = await db
      .select()
      .from(dashboardPins)
      .where(eq(dashboardPins.portfolioId, id))
      .orderBy(asc(dashboardPins.sortOrder), asc(dashboardPins.createdAt));

    return jsonResponse(pins);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await request.json();
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const assetIds = Array.isArray(body.assetIds)
      ? body.assetIds.filter((v: unknown): v is string => typeof v === "string")
      : [];

    if (!label) throw errorResponse("label is required", 400);
    if (assetIds.length === 0) throw errorResponse("assetIds must be a non-empty array", 400);

    const [created] = await db
      .insert(dashboardPins)
      .values({
        portfolioId: id,
        label,
        assetIds,
      })
      .returning();

    return jsonResponse(created, 201);
  } catch (error) {
    return handleError(error);
  }
}
