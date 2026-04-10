import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  handleError,
  jsonResponse,
  requireAuth,
  requirePortfolioOwnership,
} from "@/lib/api-helpers";
import { parseBody, brokerageImportRequest } from "@/types";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, brokerageImportRequest);
    await requirePortfolioOwnership(body.portfolioId, user.id);

    // Verify section belongs to this portfolio (via sheets)
    const result = await db.transaction(async (tx) => {
      // Create parent asset
      const [parent] = await tx
        .insert(assets)
        .values({
          sectionId: body.sectionId,
          name: body.accountName,
          type: "investment",
          currentValue: "0",
          providerType: "manual",
          lastSyncedAt: new Date(),
        })
        .returning();

      // Create child assets (ticker-based)
      let totalValue = 0;
      let holdingsCreated = 0;

      for (const pos of body.positions) {
        await tx.insert(assets).values({
          sectionId: body.sectionId,
          parentAssetId: parent.id,
          name: pos.name,
          type: "investment",
          quantity: String(pos.quantity),
          currentPrice: String(pos.price),
          currentValue: String(pos.value),
          providerType: "ticker",
          providerConfig: { ticker: pos.symbol },
          lastSyncedAt: new Date(),
        });

        totalValue += pos.value;
        holdingsCreated++;
      }

      return { parentAssetId: parent.id, holdingsCreated, totalValue };
    });

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
}
