import { db } from "@/lib/db";
import { assets, coinbaseConnections } from "@/lib/db/schema";
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
      .from(coinbaseConnections)
      .where(
        and(
          eq(coinbaseConnections.id, id),
          eq(coinbaseConnections.userId, user.id)
        )
      )
      .limit(1);

    if (!connection) return errorResponse("Connection not found", 404);

    // Revert the Coinbase parent(s) and their ticker children to manual.
    const coinbaseAssets = await db
      .select()
      .from(assets)
      .where(eq(assets.providerType, "coinbase"));

    const scopedParents = coinbaseAssets.filter(
      (a) => a.providerConfig?.connectionId === id
    );

    for (const parent of scopedParents) {
      const children = await db
        .select()
        .from(assets)
        .where(eq(assets.parentAssetId, parent.id));

      for (const child of children) {
        if (child.providerConfig?.connectionId === id) {
          await db
            .update(assets)
            .set({
              providerType: "manual",
              providerConfig: {},
              parentAssetId: null,
              updatedAt: new Date(),
            })
            .where(eq(assets.id, child.id));
        }
      }

      await db
        .update(assets)
        .set({
          providerType: "manual",
          providerConfig: {},
          updatedAt: new Date(),
        })
        .where(eq(assets.id, parent.id));
    }

    await db.delete(coinbaseConnections).where(eq(coinbaseConnections.id, id));

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
