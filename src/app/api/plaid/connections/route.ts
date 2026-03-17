import { db } from "@/lib/db";
import { plaidConnections, plaidAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, handleError, requireAuth } from "@/lib/api-helpers";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const connections = await db
      .select()
      .from(plaidConnections)
      .where(eq(plaidConnections.userId, user.id));

    const connectionIds = connections.map((c) => c.id);

    let accounts: (typeof plaidAccounts.$inferSelect)[] = [];
    if (connectionIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      accounts = await db
        .select()
        .from(plaidAccounts)
        .where(inArray(plaidAccounts.connectionId, connectionIds));
    }

    const accountsByConnection = new Map<string, typeof accounts>();
    for (const account of accounts) {
      const list = accountsByConnection.get(account.connectionId) ?? [];
      list.push(account);
      accountsByConnection.set(account.connectionId, list);
    }

    const result = connections.map((c) => ({
      id: c.id,
      institutionId: c.institutionId,
      institutionName: c.institutionName,
      itemId: c.itemId,
      errorCode: c.errorCode,
      errorMessage: c.errorMessage,
      lastSyncedAt: c.lastSyncedAt,
      consentExpiration: c.consentExpiration,
      createdAt: c.createdAt,
      accounts: (accountsByConnection.get(c.id) ?? []).map((a) => ({
        id: a.id,
        plaidAccountId: a.plaidAccountId,
        assetId: a.assetId,
        name: a.name,
        officialName: a.officialName,
        type: a.type,
        subtype: a.subtype,
        mask: a.mask,
        currentBalance: a.currentBalance,
        availableBalance: a.availableBalance,
        isoCurrencyCode: a.isoCurrencyCode,
        isTracked: a.isTracked,
      })),
    }));

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
}
