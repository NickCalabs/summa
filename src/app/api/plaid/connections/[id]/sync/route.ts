import { db } from "@/lib/db";
import { plaidConnections, plaidAccounts, assets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { jsonResponse, errorResponse, handleError, requireAuth } from "@/lib/api-helpers";
import { decrypt } from "@/lib/encryption";
import { getBalances } from "@/lib/providers/plaid";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;

    const [connection] = await db
      .select()
      .from(plaidConnections)
      .where(and(eq(plaidConnections.id, id), eq(plaidConnections.userId, user.id)))
      .limit(1);

    if (!connection) {
      return errorResponse("Connection not found", 404);
    }

    const accessToken = decrypt(connection.accessTokenEnc);
    const balances = await getBalances(accessToken);

    let updatedCount = 0;
    for (const balance of balances) {
      // Update plaid_accounts
      await db
        .update(plaidAccounts)
        .set({
          currentBalance: balance.currentBalance?.toFixed(2) ?? null,
          availableBalance: balance.availableBalance?.toFixed(2) ?? null,
          updatedAt: new Date(),
        })
        .where(eq(plaidAccounts.plaidAccountId, balance.accountId));

      // Update linked asset
      const [account] = await db
        .select()
        .from(plaidAccounts)
        .where(eq(plaidAccounts.plaidAccountId, balance.accountId))
        .limit(1);

      if (account?.assetId && balance.currentBalance != null) {
        await db
          .update(assets)
          .set({
            currentValue: Math.abs(balance.currentBalance).toFixed(2),
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(assets.id, account.assetId));
        updatedCount++;
      }
    }

    // Update connection sync time and clear errors
    await db
      .update(plaidConnections)
      .set({
        lastSyncedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(plaidConnections.id, id));

    return jsonResponse({ synced: updatedCount });
  } catch (error) {
    return handleError(error);
  }
}
