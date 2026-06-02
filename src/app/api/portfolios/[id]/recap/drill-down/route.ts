import { db } from "@/lib/db";
import { portfolios, assets, sections, sheets } from "@/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
  validateUuid,
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

    const url = new URL(request.url);
    const assetIdsParam = url.searchParams.get("assetIds");
    const from = url.searchParams.get("from");

    if (!assetIdsParam) {
      return jsonResponse({ error: "assetIds parameter required" }, 400);
    }

    const assetIds = assetIdsParam.split(",").filter(Boolean);
    if (assetIds.length === 0) {
      return jsonResponse({ error: "No asset IDs provided" }, 400);
    }

    // Verify all assets belong to this portfolio
    const assetRows = await db
      .select({ id: assets.id, ownershipPct: assets.ownershipPct })
      .from(assets)
      .innerJoin(sections, eq(assets.sectionId, sections.id))
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .where(
        and(
          eq(sheets.portfolioId, id),
          inArray(assets.id, assetIds)
        )
      );

    const verifiedIds = assetRows.map((r) => r.id);
    if (verifiedIds.length === 0) {
      return jsonResponse({ series: [] });
    }

    const ownershipMap = new Map(
      assetRows.map((r) => [r.id, Number(r.ownershipPct ?? 100) / 100])
    );

    // Build ownership-weighted SUM expression
    const ownershipCases = assetRows.map(
      (r) => `WHEN asset_id = '${r.id}' THEN ${ownershipMap.get(r.id) ?? 1}`
    );
    const ownershipExpr = ownershipCases.length > 0
      ? `CASE ${ownershipCases.join(" ")} ELSE 1 END`
      : "1";

    const fromClause = from
      ? sql`AND s.date >= ${from}::date`
      : sql``;

    const idValues = sql.join(
      verifiedIds.map((id) => sql`(${id}::uuid)`),
      sql`, `
    );

    const result = await db.execute(sql`
      SELECT
        s.date::text AS date,
        SUM(s.value_in_base::numeric * (${sql.raw(ownershipExpr)})) AS total,
        SUM(s.value_in_btc::numeric * (${sql.raw(ownershipExpr)})) AS total_btc
      FROM asset_snapshots s
      WHERE s.asset_id IN (SELECT id FROM (VALUES ${idValues}) AS v(id))
        ${fromClause}
      GROUP BY s.date
      ORDER BY s.date ASC
    `);

    const series = (
      result as unknown as {
        date: string;
        total: string;
        total_btc: string | null;
      }[]
    ).map((row) => ({
      date: row.date,
      value: Number(Number(row.total).toFixed(2)),
      // Charted in BTC mode without re-dividing — uses each day's captured rate
      // so pure-BTC lenses produce a stable line instead of drift.
      valueInBtc:
        row.total_btc != null
          ? Number(Number(row.total_btc).toFixed(10))
          : null,
    }));

    return jsonResponse({ series });
  } catch (error) {
    return handleError(error);
  }
}
