import { db } from "@/lib/db";
import { portfolios, sheets, sections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    // Check if user already has portfolios
    const existing = await db
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(eq(portfolios.userId, user.id))
      .limit(1);

    if (existing.length > 0) {
      return jsonResponse({ portfolioId: existing[0].id, created: false });
    }

    const currency =
      (user as Record<string, unknown>).defaultCurrency as string || "USD";

    // Create default portfolio
    const [portfolio] = await db
      .insert(portfolios)
      .values({
        userId: user.id,
        name: "My Net Worth",
        currency,
      })
      .returning();

    // Create default sheet
    const [sheet] = await db
      .insert(sheets)
      .values({
        portfolioId: portfolio.id,
        name: "Assets",
        type: "assets",
        sortOrder: 0,
      })
      .returning();

    // Create default section
    await db.insert(sections).values({
      sheetId: sheet.id,
      name: "Getting Started",
      sortOrder: 0,
    });

    return jsonResponse({ portfolioId: portfolio.id, created: true }, 201);
  } catch (error) {
    return handleError(error);
  }
}
