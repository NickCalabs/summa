import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, assets, sections, sheets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status: number, details?: unknown) {
  const body: Record<string, unknown> = { error: message };
  if (details !== undefined) body.details = details;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function requireAuth(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  if (!session) {
    throw errorResponse("Unauthorized", 401);
  }
  return session;
}

export async function requirePortfolioOwnership(portfolioId: string, userId: string) {
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)))
    .limit(1);

  if (!portfolio) {
    throw errorResponse("Portfolio not found", 404);
  }
  return portfolio;
}

export async function requireAssetOwnership(assetId: string, userId: string) {
  const rows = await db
    .select({
      asset: assets,
      portfolioId: portfolios.id,
    })
    .from(assets)
    .innerJoin(sections, eq(assets.sectionId, sections.id))
    .innerJoin(sheets, eq(sections.sheetId, sheets.id))
    .innerJoin(portfolios, eq(sheets.portfolioId, portfolios.id))
    .where(and(eq(assets.id, assetId), eq(portfolios.userId, userId)))
    .limit(1);

  if (rows.length === 0) {
    throw errorResponse("Asset not found", 404);
  }

  return { asset: rows[0].asset, portfolioId: rows[0].portfolioId };
}

export function handleError(error: unknown) {
  if (error instanceof Response) return error;
  console.error("Unhandled API error:", error);
  return errorResponse("Internal server error", 500);
}
