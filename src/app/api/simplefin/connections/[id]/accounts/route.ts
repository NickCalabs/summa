import { db } from "@/lib/db";
import {
  assets,
  simplefinAccounts,
  simplefinConnections,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requirePortfolioOwnership,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import {
  getInstitutionSectionName,
  inferSimpleFINAssetType,
  inferSimpleFINSheetType,
} from "@/lib/provider-account-grouping";
import { ensurePortfolioInstitutionSection } from "@/lib/provider-section-routing";
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
    await requirePortfolioOwnership(body.portfolioId, user.id);
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

      const sheetType = inferSimpleFINSheetType({
        accountName: account.accountName,
        balance: account.balance,
      });
      const assetType = inferSimpleFINAssetType({
        accountName: account.accountName,
        balance: account.balance,
      });
      const targetSection = await ensurePortfolioInstitutionSection({
        portfolioId: body.portfolioId,
        sheetType,
        institutionName: getInstitutionSectionName(account.institutionName),
      });

      const [asset] = await db
        .insert(assets)
        .values({
          sectionId: targetSection.id,
          name: account.accountName,
          type: assetType,
          currency: account.currency,
          currentValue: getAssetValue(account.balance, sheetType),
          isCashEquivalent: sheetType === "assets" && assetType === "cash",
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
