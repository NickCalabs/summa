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
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";

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

    const linkedAccounts = await db
      .select()
      .from(simplefinAccounts)
      .where(eq(simplefinAccounts.connectionId, id));

    for (const account of linkedAccounts) {
      if (!account.assetId) continue;

      await db
        .update(assets)
        .set({
          providerType: "manual",
          providerConfig: {},
          updatedAt: new Date(),
        })
        .where(eq(assets.id, account.assetId));
    }

    await db
      .delete(simplefinConnections)
      .where(eq(simplefinConnections.id, id));

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
