import { db } from "@/lib/db";
import { plaidConnections, plaidAccounts, assets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { getBalances } from "@/lib/providers/plaid";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { webhook_type, webhook_code, item_id } = body;

    if (!item_id) {
      return new Response("OK", { status: 200 });
    }

    const [connection] = await db
      .select()
      .from(plaidConnections)
      .where(eq(plaidConnections.itemId, item_id))
      .limit(1);

    if (!connection) {
      return new Response("OK", { status: 200 });
    }

    if (webhook_type === "ITEM" && webhook_code === "ERROR") {
      const errorInfo = body.error ?? {};
      const errorExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db
        .update(plaidConnections)
        .set({
          errorCode: errorInfo.error_code ?? "UNKNOWN",
          errorMessage: errorInfo.error_message ?? "An error occurred",
          errorExpiresAt,
          errorRetryCount: 1,
          updatedAt: new Date(),
        })
        .where(eq(plaidConnections.id, connection.id));
      return new Response("OK", { status: 200 });
    }

    if (webhook_type === "ITEM" && webhook_code === "PENDING_EXPIRATION") {
      await db
        .update(plaidConnections)
        .set({
          errorCode: "PENDING_EXPIRATION",
          errorMessage: "Connection will expire soon. Please re-authenticate.",
          errorExpiresAt: null,
          errorRetryCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(plaidConnections.id, connection.id));
      return new Response("OK", { status: 200 });
    }

    // DEFAULT_UPDATE — refresh balances
    if (
      webhook_code === "DEFAULT_UPDATE" ||
      webhook_code === "INITIAL_UPDATE" ||
      webhook_code === "HISTORICAL_UPDATE"
    ) {
      try {
        const accessToken = decrypt(connection.accessTokenEnc);
        const balances = await getBalances(accessToken);

        for (const balance of balances) {
          await db
            .update(plaidAccounts)
            .set({
              currentBalance: balance.currentBalance?.toFixed(2) ?? null,
              availableBalance: balance.availableBalance?.toFixed(2) ?? null,
              updatedAt: new Date(),
            })
            .where(eq(plaidAccounts.plaidAccountId, balance.accountId));

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
          }
        }

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
          .where(eq(plaidConnections.id, connection.id));
      } catch (error) {
        console.error(`[plaid-webhook] Balance refresh failed for connection ${connection.id}:`, error);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[plaid-webhook] Unhandled webhook error:", error);
    return new Response("OK", { status: 200 });
  }
}
