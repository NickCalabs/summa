import { db } from "@/lib/db";
import { plaidConnections, plaidAccounts, assets } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { jsonResponse, errorResponse, handleError, requireAuth, validateUuid } from "@/lib/api-helpers";
import { decrypt } from "@/lib/encryption";
import { getBalances } from "@/lib/providers/plaid";

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
      const [updated] = await db
        .update(plaidAccounts)
        .set({
          currentBalance: balance.currentBalance?.toFixed(2) ?? null,
          availableBalance: balance.availableBalance?.toFixed(2) ?? null,
          creditLimit: balance.limit?.toFixed(2) ?? null,
          updatedAt: new Date(),
        })
        .where(eq(plaidAccounts.plaidAccountId, balance.accountId))
        .returning();

      if (updated?.assetId && balance.currentBalance != null) {
        const limitPatch =
          balance.limit != null ? { creditLimit: balance.limit } : null;
        await db
          .update(assets)
          .set({
            currentValue: Math.abs(balance.currentBalance).toFixed(2),
            ...(limitPatch && {
              providerConfig: sql`coalesce(${assets.providerConfig}, '{}'::jsonb) || ${JSON.stringify(limitPatch)}::jsonb`,
            }),
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(assets.id, updated.assetId));
        updatedCount++;
      }
    }

    // Mark assets for accounts not returned by Plaid as stale
    const returnedAccountIds = new Set(balances.map((b) => b.accountId));
    const allAccounts = await db
      .select({ plaidAccountId: plaidAccounts.plaidAccountId, assetId: plaidAccounts.assetId })
      .from(plaidAccounts)
      .where(eq(plaidAccounts.connectionId, id));

    for (const acct of allAccounts) {
      if (!returnedAccountIds.has(acct.plaidAccountId) && acct.assetId) {
        await db
          .update(assets)
          .set({ lastSyncedAt: null, updatedAt: new Date() })
          .where(eq(assets.id, acct.assetId));
      }
    }

    // Update connection sync time and clear errors
    await db
      .update(plaidConnections)
      .set({
        lastSyncedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        errorExpiresAt: null,
        errorRetryCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(plaidConnections.id, id));

    return jsonResponse({ synced: updatedCount });
  } catch (error) {
    return handleError(error);
  }
}
