import { db } from "@/lib/db";
import { portfolios, sheets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const result = await db.transaction(async (tx) => {
      // Check if user already has portfolios (inside transaction for safety)
      const existing = await tx
        .select({ id: portfolios.id })
        .from(portfolios)
        .where(eq(portfolios.userId, user.id))
        .limit(1);

      if (existing.length > 0) {
        return { portfolioId: existing[0].id, created: false };
      }

      const currency =
        (user as Record<string, unknown>).defaultCurrency as string || "USD";

      const [portfolio] = await tx
        .insert(portfolios)
        .values({
          userId: user.id,
          name: "My Net Worth",
          currency,
        })
        .returning();

      await tx.insert(sheets).values({
        portfolioId: portfolio.id,
        name: "Assets",
        type: "assets",
        sortOrder: 0,
      });

      return { portfolioId: portfolio.id, created: true };
    });

    return jsonResponse(result, result.created ? 201 : 200);
  } catch (error) {
    return handleError(error);
  }
}
