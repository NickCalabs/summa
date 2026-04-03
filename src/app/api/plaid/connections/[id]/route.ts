import { db } from "@/lib/db";
import { plaidConnections, plaidAccounts, assets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { jsonResponse, errorResponse, handleError, requireAuth, validateUuid } from "@/lib/api-helpers";
import { decrypt } from "@/lib/encryption";
import { removeItem } from "@/lib/providers/plaid";

export async function DELETE(
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

    // Remove item from Plaid
    try {
      const accessToken = decrypt(connection.accessTokenEnc);
      await removeItem(accessToken);
    } catch {
      // Best-effort removal from Plaid — continue even if it fails
    }

    // Revert linked assets to manual
    const linkedAccounts = await db
      .select()
      .from(plaidAccounts)
      .where(eq(plaidAccounts.connectionId, id));

    for (const account of linkedAccounts) {
      if (account.assetId) {
        await db
          .update(assets)
          .set({
            providerType: "manual",
            providerConfig: {},
            updatedAt: new Date(),
          })
          .where(eq(assets.id, account.assetId));
      }
    }

    // Delete connection (cascades to plaid_accounts)
    await db.delete(plaidConnections).where(eq(plaidConnections.id, id));

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
