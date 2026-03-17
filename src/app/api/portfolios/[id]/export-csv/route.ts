import { db } from "@/lib/db";
import { assets, sections, sheets } from "@/lib/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { requireAuth, requirePortfolioOwnership, handleError, errorResponse } from "@/lib/api-helpers";
import { sanitizeCsvValue } from "@/lib/csv-utils";
import Papa from "papaparse";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    const portfolio = await requirePortfolioOwnership(id, user.id);

    const url = new URL(request.url);
    const sheetIdFilter = url.searchParams.get("sheetId");

    // Fetch sheets
    let sheetRows = await db
      .select()
      .from(sheets)
      .where(eq(sheets.portfolioId, id))
      .orderBy(asc(sheets.sortOrder));

    if (sheetIdFilter) {
      sheetRows = sheetRows.filter((s) => s.id === sheetIdFilter);
    }

    if (sheetRows.length === 0) {
      return errorResponse("No sheets found", 404);
    }

    const sheetIds = sheetRows.map((s) => s.id);
    const sheetMap = new Map(sheetRows.map((s) => [s.id, s.name]));

    // Fetch sections
    const sectionRows = await db
      .select()
      .from(sections)
      .where(inArray(sections.sheetId, sheetIds))
      .orderBy(asc(sections.sortOrder));

    const sectionIds = sectionRows.map((s) => s.id);
    const sectionMap = new Map(sectionRows.map((s) => [s.id, s]));

    if (sectionIds.length === 0) {
      return errorResponse("No sections found", 404);
    }

    // Fetch assets
    const assetRows = await db
      .select()
      .from(assets)
      .where(inArray(assets.sectionId, sectionIds))
      .orderBy(asc(assets.sortOrder));

    const csvData = assetRows
      .filter((a) => !a.isArchived)
      .map((a) => {
        const section = sectionMap.get(a.sectionId);
        const sheetName = section ? sheetMap.get(section.sheetId) ?? "" : "";
        const sectionName = section?.name ?? "";

        return {
          name: sanitizeCsvValue(a.name),
          type: a.type,
          currency: a.currency,
          value: a.currentValue,
          quantity: a.quantity ?? "",
          price: a.currentPrice ?? "",
          cost_basis: a.costBasis ?? "",
          ownership_pct: a.ownershipPct,
          notes: sanitizeCsvValue(a.notes ?? ""),
          sheet: sanitizeCsvValue(sheetName),
          section: sanitizeCsvValue(sectionName),
        };
      });

    const csv = Papa.unparse(csvData);
    const filename = `${portfolio.name.replace(/[^a-zA-Z0-9]/g, "_")}_export.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
