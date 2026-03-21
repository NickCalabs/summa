import { db } from "@/lib/db";
import {
  plaidConnections,
  plaidAccounts,
  assets,
  sections,
  sheets,
  portfolios,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  jsonResponse,
  errorResponse,
  handleError,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import { parseBody, plaidLinkAccounts } from "@/types";
import { plaidTypeToAssetType, isDepositoryAccount, isLiabilityAccount } from "@/lib/providers/plaid";

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

      let targetSectionId = item.sectionId;

      // Verify section belongs to user and get the sheet type
      const sectionInfo = await db
        .select({
          portfolioUserId: portfolios.userId,
          portfolioId: portfolios.id,
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

      // If this is a liability account (credit card, loan) but the target
      // section is in an assets sheet, find or create a debts sheet + section
      if (
        isLiabilityAccount(plaidAccount.type) &&
        sectionInfo[0].sheetType === "assets"
      ) {
        const pid = sectionInfo[0].portfolioId;

        // Find existing debts sheet
        let [debtsSheet] = await db
          .select()
          .from(sheets)
          .where(
            and(eq(sheets.portfolioId, pid), eq(sheets.type, "debts"))
          )
          .limit(1);

        // Create debts sheet if none exists
        if (!debtsSheet) {
          [debtsSheet] = await db
            .insert(sheets)
            .values({
              portfolioId: pid,
              name: "Debts",
              type: "debts",
              sortOrder: 1,
            })
            .returning();
        }

        // Find or create a section in the debts sheet
        let [debtsSection] = await db
          .select()
          .from(sections)
          .where(eq(sections.sheetId, debtsSheet.id))
          .limit(1);

        if (!debtsSection) {
          [debtsSection] = await db
            .insert(sections)
            .values({
              sheetId: debtsSheet.id,
              name: "Liabilities",
              sortOrder: 0,
            })
            .returning();
        }

        targetSectionId = debtsSection.id;
      }

      const assetType = plaidTypeToAssetType(
        plaidAccount.type,
        plaidAccount.subtype
      );
      const isCash = isDepositoryAccount(plaidAccount.type);

      // Create asset
      const [newAsset] = await db
        .insert(assets)
        .values({
          sectionId: targetSectionId,
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
