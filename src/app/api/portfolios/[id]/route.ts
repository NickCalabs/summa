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
  validateUuid,
} from "@/lib/api-helpers";
import { parseBody, updatePortfolio } from "@/types";
import { getExchangeRates } from "@/lib/providers/exchange-rates";
import { convertToBase } from "@/lib/currency";
import { isLiabilityAsset } from "@/lib/portfolio-utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
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

    // Fetch all assets (including archived, needed for child counting)
    const allAssetRows =
      sectionIds.length > 0
        ? await db
            .select()
            .from(assets)
            .where(inArray(assets.sectionId, sectionIds))
            .orderBy(asc(assets.sortOrder))
        : [];

    // Separate children from top-level and group by parent
    const activeChildrenByParent = new Map<string, typeof allAssetRows>();
    const allChildrenByParent = new Map<string, typeof allAssetRows>();
    const topLevelRows: typeof allAssetRows = [];

    for (const asset of allAssetRows) {
      if (asset.parentAssetId) {
        const allList = allChildrenByParent.get(asset.parentAssetId) ?? [];
        allList.push(asset);
        allChildrenByParent.set(asset.parentAssetId, allList);
        if (!asset.isArchived) {
          const activeList = activeChildrenByParent.get(asset.parentAssetId) ?? [];
          activeList.push(asset);
          activeChildrenByParent.set(asset.parentAssetId, activeList);
        }
      } else {
        topLevelRows.push(asset);
      }
    }

    // Build enhanced top-level assets with children attached
    type DbAssetRow = (typeof allAssetRows)[number];
    type EnhancedAsset = DbAssetRow & {
      children?: (DbAssetRow & { isChild: boolean })[];
      childCount?: number;
      isChild: boolean;
    };

    const assetRows: EnhancedAsset[] = [];
    for (const asset of topLevelRows) {
      const isParent = allChildrenByParent.has(asset.id);
      // Filter out archived non-parent assets (current behavior preserved)
      if (asset.isArchived && !isParent) continue;

      if (isParent) {
        const activeChildren = activeChildrenByParent.get(asset.id) ?? [];
        const computedValue = activeChildren.reduce(
          (sum, c) => sum + Number(c.currentValue),
          0
        );
        assetRows.push({
          ...asset,
          currentValue: computedValue.toFixed(2),
          children: activeChildren.map((c) => ({ ...c, isChild: true as const })),
          childCount: allChildrenByParent.get(asset.id)!.length,
          isChild: false,
        });
      } else {
        assetRows.push({ ...asset, isChild: false });
      }
    }

    // Build maps
    const assetsBySection = new Map<string, EnhancedAsset[]>();
    for (const asset of assetRows) {
      const list = assetsBySection.get(asset.sectionId) ?? [];
      list.push(asset);
      assetsBySection.set(asset.sectionId, list);
    }

    const sectionsBySheet = new Map<string, (typeof sectionRows[number] & { assets: EnhancedAsset[] })[]>();
    for (const section of sectionRows) {
      const list = sectionsBySheet.get(section.sheetId) ?? [];
      list.push({ ...section, assets: assetsBySection.get(section.id) ?? [] });
      sectionsBySheet.set(section.sheetId, list);
    }

    const tree = sheetRows.map((sheet) => ({
      ...sheet,
      sections: sectionsBySheet.get(sheet.id) ?? [],
    }));

    // Fetch exchange rates if any asset has a different currency
    const hasMixedCurrencies = assetRows.some(
      (a) => a.currency !== portfolio.currency
    );
    const rates = hasMixedCurrencies
      ? await getExchangeRates(portfolio.currency)
      : {};

    // Compute aggregates with currency conversion
    let totalAssets = 0;
    let totalDebts = 0;
    let cashOnHand = 0;

    for (const sheet of tree) {
      for (const section of sheet.sections) {
        for (const asset of section.assets) {
          const ownership = Number(asset.ownershipPct ?? 100) / 100;
          const val = convertToBase(
            Number(asset.currentValue) * ownership,
            asset.currency,
            portfolio.currency,
            rates
          );
          if (isLiabilityAsset(sheet, { type: asset.type })) {
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
      rates,
      ratesBase: portfolio.currency,
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
    validateUuid(id, "portfolio ID");
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
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    await db.delete(portfolios).where(eq(portfolios.id, id));

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
