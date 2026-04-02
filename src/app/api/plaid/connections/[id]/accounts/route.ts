import { db } from "@/lib/db";
import {
  plaidConnections,
  plaidAccounts,
  assets,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  jsonResponse,
  errorResponse,
  handleError,
  requirePortfolioOwnership,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import { parseBody, plaidLinkAccounts } from "@/types";
import { plaidTypeToAssetType, isDepositoryAccount, isLiabilityAccount } from "@/lib/providers/plaid";
import { getInstitutionSectionName } from "@/lib/provider-account-grouping";
import { ensurePortfolioInstitutionSection } from "@/lib/provider-section-routing";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "connection ID");

    // Verify connection ownership
    const [connection] = await db
      .select()
      .from(plaidConnections)
      .where(
        and(eq(plaidConnections.id, id), eq(plaidConnections.userId, user.id))
      )
      .limit(1);

    if (!connection) {
      return errorResponse("Connection not found", 404);
    }

    const body = await parseBody(request, plaidLinkAccounts);
    await requirePortfolioOwnership(body.portfolioId, user.id);
    const created: string[] = [];

    for (const item of body.accounts) {
      // Get plaid account info
      const [plaidAccount] = await db
        .select()
        .from(plaidAccounts)
        .where(
          and(
            eq(plaidAccounts.plaidAccountId, item.plaidAccountId),
            eq(plaidAccounts.connectionId, id)
          )
        )
        .limit(1);

      if (!plaidAccount) continue;

      // If already tracked with an asset, skip
      if (plaidAccount.assetId) continue;

      const sheetType = isLiabilityAccount(plaidAccount.type) ? "debts" : "assets";
      const targetSection = await ensurePortfolioInstitutionSection({
        portfolioId: body.portfolioId,
        sheetType,
        institutionName: getInstitutionSectionName(connection.institutionName),
      });

      const assetType = plaidTypeToAssetType(
        plaidAccount.type,
        plaidAccount.subtype
      );
      const isCash = isDepositoryAccount(plaidAccount.type);

      // Create asset
      const [newAsset] = await db
        .insert(assets)
        .values({
          sectionId: targetSection.id,
          name: plaidAccount.officialName ?? plaidAccount.name,
          type: assetType,
          currency: plaidAccount.isoCurrencyCode ?? "USD",
          currentValue: plaidAccount.currentBalance
            ? Math.abs(Number(plaidAccount.currentBalance)).toFixed(2)
            : "0",
          isCashEquivalent: isCash,
          providerType: "plaid",
          providerConfig: {
            connectionId: id,
            plaidAccountId: plaidAccount.plaidAccountId,
          },
          lastSyncedAt: new Date(),
        })
        .returning();

      // Link plaid account to asset
      await db
        .update(plaidAccounts)
        .set({
          assetId: newAsset.id,
          isTracked: true,
          updatedAt: new Date(),
        })
        .where(eq(plaidAccounts.id, plaidAccount.id));

      created.push(newAsset.id);
    }

    return jsonResponse({ created });
  } catch (error) {
    return handleError(error);
  }
}
