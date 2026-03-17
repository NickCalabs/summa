import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";
import { parseBody, createPortfolio } from "@/types";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const rows = await db
      .select({
        id: portfolios.id,
        name: portfolios.name,
        currency: portfolios.currency,
        updatedAt: portfolios.updatedAt,
      })
      .from(portfolios)
      .where(eq(portfolios.userId, user.id))
      .orderBy(desc(portfolios.updatedAt));

    return jsonResponse(rows);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, createPortfolio);

    const [portfolio] = await db
      .insert(portfolios)
      .values({
        userId: user.id,
        name: body.name,
        currency: body.currency ?? "USD",
        startDate: body.startDate,
      })
      .returning();

    return jsonResponse(portfolio, 201);
  } catch (error) {
    return handleError(error);
  }
}
