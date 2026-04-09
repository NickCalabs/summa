import { db } from "@/lib/db";
import { assets, assetSnapshots, sheets, sections } from "@/lib/db/schema";
import {
  jsonResponse,
  errorResponse,
  requireAuth,
  requirePortfolioOwnership,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, kuberaImportRequest } from "@/types";
import { eq, inArray } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, kuberaImportRequest);
    await requirePortfolioOwnership(body.portfolioId, user.id);

    // Fetch existing sheets for this portfolio
    const existingSheets = await db
      .select()
      .from(sheets)
      .where(eq(sheets.portfolioId, body.portfolioId));

    // Fetch sections scoped to this portfolio's sheets only (not globally)
    const existingSheetIds = existingSheets.map((s) => s.id);
    const allSectionRows =
      existingSheetIds.length > 0
        ? await db
            .select()
            .from(sections)
            .where(inArray(sections.sheetId, existingSheetIds))
        : [];

    let assetsCreated = 0;
    let assetsMatched = 0;
    let assetsSkipped = 0;
    let snapshotsInserted = 0;
    let sheetsCreated = 0;
    let sectionsCreated = 0;
    const errors: string[] = [];

    // Track sheets/sections by name for reuse within this import
    const sheetIdByName = new Map<string, string>();
    for (const s of existingSheets) {
      sheetIdByName.set(s.name, s.id);
    }

    const sectionIdByKey = new Map<string, string>();
    for (const sec of allSectionRows) {
      const sheet = existingSheets.find((s) => s.id === sec.sheetId);
      if (sheet) {
        sectionIdByKey.set(`${sheet.name}::${sec.name}`, sec.id);
      }
    }

    await db.transaction(async (tx) => {
      for (const item of body.actions) {
        try {
          if (item.action === "skip") {
            assetsSkipped++;
            continue;
          }

          if (item.action === "match") {
            assetsMatched++;
            continue;
          }

          // action === "create"

          // 1. Ensure sheet exists
          let sheetId = sheetIdByName.get(item.sheetName);
          if (!sheetId) {
            const sheetType = item.category === "debt" ? "debts" : "assets";
            const [newSheet] = await tx
              .insert(sheets)
              .values({
                portfolioId: body.portfolioId,
                name: item.sheetName,
                type: sheetType,
                sortOrder: existingSheets.length + sheetsCreated,
              })
              .returning();
            sheetId = newSheet.id;
            sheetIdByName.set(item.sheetName, sheetId);
            sheetsCreated++;
          }

          // 2. Ensure section exists
          const sectionKey = `${item.sheetName}::${item.sectionName}`;
          let sectionId = sectionIdByKey.get(sectionKey);
          if (!sectionId) {
            const [newSection] = await tx
              .insert(sections)
              .values({
                sheetId,
                name: item.sectionName,
                sortOrder: sectionsCreated,
              })
              .returning();
            sectionId = newSection.id;
            sectionIdByKey.set(sectionKey, sectionId);
            sectionsCreated++;
          }

          // 3. Create asset
          const [newAsset] = await tx
            .insert(assets)
            .values({
              sectionId,
              name: item.name,
              type: item.assetType,
              currency: item.currency,
              currentValue: item.value.toFixed(2),
              currentPrice: item.price != null ? item.price.toFixed(8) : null,
              quantity: item.quantity != null ? item.quantity.toFixed(8) : null,
              costBasis: item.costBasis != null ? item.costBasis.toFixed(2) : null,
              ownershipPct: item.ownership.toFixed(2),
              isInvestable: item.isInvestable,
              isCashEquivalent: item.isCashEquivalent,
              providerType: item.providerType,
              providerConfig: item.ticker ? { ticker: item.ticker } : {},
              notes: item.notes,
              sortOrder: assetsCreated,
            })
            .returning();
          assetsCreated++;

          // 4. Create snapshot
          await tx
            .insert(assetSnapshots)
            .values({
              assetId: newAsset.id,
              date: body.exportDate,
              value: item.value.toFixed(2),
              valueInBase: item.value.toFixed(2),
              price: item.price != null ? item.price.toFixed(8) : null,
              quantity: item.quantity != null ? item.quantity.toFixed(8) : null,
              source: "import",
            })
            .onConflictDoUpdate({
              target: [assetSnapshots.assetId, assetSnapshots.date],
              set: {
                value: item.value.toFixed(2),
                valueInBase: item.value.toFixed(2),
                price: item.price != null ? item.price.toFixed(8) : null,
                quantity: item.quantity != null ? item.quantity.toFixed(8) : null,
              },
            });
          snapshotsInserted++;
        } catch (err) {
          errors.push(
            `${item.name}: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }
    });

    return jsonResponse({
      assetsCreated,
      assetsMatched,
      assetsSkipped,
      snapshotsInserted,
      sheetsCreated,
      sectionsCreated,
      errors,
    });
  } catch (error) {
    return handleError(error);
  }
}
