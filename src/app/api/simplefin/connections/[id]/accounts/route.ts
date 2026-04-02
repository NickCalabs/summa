import { db } from "@/lib/db";
import {
  assets,
  portfolios,
  sections,
  sheets,
  simplefinAccounts,
  simplefinConnections,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import { parseBody, simplefinLinkAccounts } from "@/types";

function getAssetValue(balance: string | null, sheetType: "assets" | "debts"): string {
  const parsed = balance ? Number(balance) : 0;
  if (!Number.isFinite(parsed)) return "0";
  return (sheetType === "debts" ? Math.abs(parsed) : parsed).toFixed(2);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "connection ID");

    const [connection] = await db
      .select()
      .from(simplefinConnections)
      .where(
        and(
          eq(simplefinConnections.id, id),
          eq(simplefinConnections.userId, user.id)
        )
      )
      .limit(1);

    if (!connection) {
      return errorResponse("Connection not found", 404);
    }

    const body = await parseBody(request, simplefinLinkAccounts);
    const created: string[] = [];

    for (const item of body.accounts) {
      const [account] = await db
        .select()
        .from(simplefinAccounts)
        .where(
          and(
            eq(simplefinAccounts.simplefinAccountId, item.simplefinAccountId),
            eq(simplefinAccounts.connectionId, id)
          )
        )
        .limit(1);

      if (!account || account.assetId) continue;

      const sectionInfo = await db
        .select({
          sheetType: sheets.type,
        })
        .from(sections)
        .innerJoin(sheets, eq(sections.sheetId, sheets.id))
        .innerJoin(portfolios, eq(sheets.portfolioId, portfolios.id))
        .where(
          and(eq(sections.id, item.sectionId), eq(portfolios.userId, user.id))
        )
        .limit(1);

      if (sectionInfo.length === 0) continue;

      const sheetType = sectionInfo[0].sheetType;
      const [asset] = await db
        .insert(assets)
        .values({
          sectionId: item.sectionId,
          name: account.accountName,
          type: sheetType === "debts" ? "loan" : "cash",
          currency: account.currency,
          currentValue: getAssetValue(account.balance, sheetType),
          isCashEquivalent: sheetType === "assets",
          providerType: "simplefin",
          providerConfig: {
            connectionId: id,
            simplefinAccountId: account.simplefinAccountId,
          },
          lastSyncedAt: new Date(),
        })
        .returning();

      await db
        .update(simplefinAccounts)
        .set({
          assetId: asset.id,
          isTracked: true,
          updatedAt: new Date(),
        })
        .where(eq(simplefinAccounts.id, account.id));

      created.push(asset.id);
    }

    return jsonResponse({ created });
  } catch (error) {
    return handleError(error);
  }
}
