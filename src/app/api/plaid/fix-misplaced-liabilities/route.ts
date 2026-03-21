import { db } from "@/lib/db";
import { assets, sections, sheets, portfolios } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { jsonResponse, handleError, requireAuth } from "@/lib/api-helpers";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    // Find misplaced liability assets owned by this user
    const misplaced = await db
      .select({
        assetId: assets.id,
        assetName: assets.name,
        assetType: assets.type,
        sectionId: assets.sectionId,
        sheetType: sheets.type,
        portfolioId: sheets.portfolioId,
      })
      .from(assets)
      .innerJoin(sections, eq(assets.sectionId, sections.id))
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .innerJoin(portfolios, eq(sheets.portfolioId, portfolios.id))
      .where(
        and(
          eq(portfolios.userId, user.id),
          eq(sheets.type, "assets"),
          inArray(assets.type, ["credit_card", "loan"])
        )
      );

    if (misplaced.length === 0) {
      return jsonResponse({ moved: 0, details: [] });
    }

    // Group by portfolio to reuse debts sheets
    const byPortfolio = new Map<string, typeof misplaced>();
    for (const row of misplaced) {
      const list = byPortfolio.get(row.portfolioId) ?? [];
      list.push(row);
      byPortfolio.set(row.portfolioId, list);
    }

    const details: { assetId: string; assetName: string; newSectionId: string }[] = [];

    for (const [portfolioId, items] of byPortfolio) {
      // Find or create debts sheet + section for this portfolio
      let targetSectionId: string;

      const [debtsSheet] = await db
        .select()
        .from(sheets)
        .where(and(eq(sheets.portfolioId, portfolioId), eq(sheets.type, "debts")))
        .limit(1);

      if (debtsSheet) {
        const [debtsSection] = await db
          .select()
          .from(sections)
          .where(eq(sections.sheetId, debtsSheet.id))
          .orderBy(sections.sortOrder)
          .limit(1);

        if (debtsSection) {
          targetSectionId = debtsSection.id;
        } else {
          const [newSection] = await db.insert(sections).values({
            sheetId: debtsSheet.id,
            name: "Liabilities",
            sortOrder: 0,
          }).returning();
          targetSectionId = newSection.id;
        }
      } else {
        const [newSheet] = await db.insert(sheets).values({
          portfolioId,
          name: "Debts",
          type: "debts",
          sortOrder: 99,
        }).returning();
        const [newSection] = await db.insert(sections).values({
          sheetId: newSheet.id,
          name: "Liabilities",
          sortOrder: 0,
        }).returning();
        targetSectionId = newSection.id;
      }

      // Move all misplaced assets in this portfolio
      for (const item of items) {
        await db
          .update(assets)
          .set({ sectionId: targetSectionId, updatedAt: new Date() })
          .where(eq(assets.id, item.assetId));
        details.push({
          assetId: item.assetId,
          assetName: item.assetName,
          newSectionId: targetSectionId,
        });
      }
    }

    return jsonResponse({ moved: details.length, details });
  } catch (error) {
    return handleError(error);
  }
}
