import { db } from "@/lib/db";
import {
  portfolios,
  sheets,
  sections,
  assets,
} from "@/lib/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, updatePortfolio } from "@/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    const portfolio = await requirePortfolioOwnership(id, user.id);

    // Fetch sheets
    const sheetRows = await db
      .select()
      .from(sheets)
      .where(eq(sheets.portfolioId, id))
      .orderBy(asc(sheets.sortOrder));

    if (sheetRows.length === 0) {
      return jsonResponse({
        ...portfolio,
        sheets: [],
        aggregates: { totalAssets: 0, totalDebts: 0, netWorth: 0, cashOnHand: 0 },
      });
    }

    const sheetIds = sheetRows.map((s) => s.id);

    // Fetch sections
    const sectionRows = await db
      .select()
      .from(sections)
      .where(inArray(sections.sheetId, sheetIds))
      .orderBy(asc(sections.sortOrder));

    const sectionIds = sectionRows.map((s) => s.id);

    // Fetch non-archived assets
    const assetRows =
      sectionIds.length > 0
        ? await db
            .select()
            .from(assets)
            .where(inArray(assets.sectionId, sectionIds))
            .orderBy(asc(assets.sortOrder))
            .then((rows) => rows.filter((a) => !a.isArchived))
        : [];

    // Build maps
    const assetsBySection = new Map<string, typeof assetRows>();
    for (const asset of assetRows) {
      const list = assetsBySection.get(asset.sectionId) ?? [];
      list.push(asset);
      assetsBySection.set(asset.sectionId, list);
    }

    const sectionsBySheet = new Map<string, (typeof sectionRows[number] & { assets: typeof assetRows })[]>();
    for (const section of sectionRows) {
      const list = sectionsBySheet.get(section.sheetId) ?? [];
      list.push({ ...section, assets: assetsBySection.get(section.id) ?? [] });
      sectionsBySheet.set(section.sheetId, list);
    }

    const tree = sheetRows.map((sheet) => ({
      ...sheet,
      sections: sectionsBySheet.get(sheet.id) ?? [],
    }));

    // TODO: Sprint 9 — convert asset values to portfolio base currency using exchange rates before aggregating
    // Compute aggregates
    let totalAssets = 0;
    let totalDebts = 0;
    let cashOnHand = 0;

    for (const sheet of tree) {
      for (const section of sheet.sections) {
        for (const asset of section.assets) {
          const val = Number(asset.currentValue);
          if (sheet.type === "debts") {
            totalDebts += val;
          } else {
            totalAssets += val;
          }
          if (asset.isCashEquivalent) {
            cashOnHand += val;
          }
        }
      }
    }

    const netWorth = totalAssets - totalDebts;

    return jsonResponse({
      ...portfolio,
      sheets: tree,
      aggregates: {
        totalAssets: Number(totalAssets.toFixed(2)),
        totalDebts: Number(totalDebts.toFixed(2)),
        netWorth: Number(netWorth.toFixed(2)),
        cashOnHand: Number(cashOnHand.toFixed(2)),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, updatePortfolio);

    const [updated] = await db
      .update(portfolios)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(portfolios.id, id))
      .returning();

    return jsonResponse(updated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    await requirePortfolioOwnership(id, user.id);

    await db.delete(portfolios).where(eq(portfolios.id, id));

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
