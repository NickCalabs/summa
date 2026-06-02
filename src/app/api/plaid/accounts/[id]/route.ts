import { db } from "@/lib/db";
import { assets, plaidAccounts, plaidConnections } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAssetOwnership,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import { decrypt } from "@/lib/encryption";
import { getCryptoHoldings } from "@/lib/providers/plaid";
import { computePlaidTakeover, isCryptoTakeover } from "@/lib/plaid-relink";
import { z } from "zod";

const relinkBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("unlink") }),
  z.object({ action: z.literal("relink"), assetId: z.string().uuid() }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "account ID");

    const body = relinkBody.parse(await request.json());

    // Find the Plaid account + owning connection, verify ownership
    const [row] = await db
      .select({ account: plaidAccounts, connection: plaidConnections })
      .from(plaidAccounts)
      .innerJoin(
        plaidConnections,
        eq(plaidAccounts.connectionId, plaidConnections.id)
      )
      .where(eq(plaidAccounts.id, id))
      .limit(1);

    if (!row || row.connection.userId !== user.id) {
      return errorResponse("Account not found", 404);
    }
    const plaidAccount = row.account;

    if (body.action === "unlink") {
      // Revert old asset to manual if it exists
      if (plaidAccount.assetId) {
        await db
          .update(assets)
          .set({ providerType: "manual", providerConfig: {}, updatedAt: new Date() })
          .where(eq(assets.id, plaidAccount.assetId));
      }
      // Mark account as untracked
      await db
        .update(plaidAccounts)
        .set({ assetId: null, isTracked: false, updatedAt: new Date() })
        .where(eq(plaidAccounts.id, id));
      return jsonResponse({ success: true });
    }

    // action === "relink"
    const targetAssetId = body.assetId;
    const { asset: targetAsset } = await requireAssetOwnership(targetAssetId, user.id);

    // Target must not already be linked to a different tracked Plaid account
    const [existingLink] = await db
      .select({ id: plaidAccounts.id })
      .from(plaidAccounts)
      .where(
        and(
          eq(plaidAccounts.assetId, targetAssetId),
          eq(plaidAccounts.isTracked, true)
        )
      )
      .limit(1);
    if (existingLink && existingLink.id !== id) {
      return errorResponse("Asset is already linked to a Plaid account", 400);
    }

    // If this Plaid account was linked to a different asset, revert that one
    if (plaidAccount.assetId && plaidAccount.assetId !== targetAssetId) {
      await db
        .update(assets)
        .set({ providerType: "manual", providerConfig: {}, updatedAt: new Date() })
        .where(eq(assets.id, plaidAccount.assetId));
    }

    // For a crypto takeover, pull the coin quantity from holdings
    let holdingQuantity: number | null = null;
    if (isCryptoTakeover(plaidAccount.type, targetAsset.type)) {
      const accessToken = decrypt(row.connection.accessTokenEnc);
      const holdings = await getCryptoHoldings(accessToken);
      holdingQuantity = holdings.get(plaidAccount.plaidAccountId)?.quantity ?? null;
    }

    const patch = computePlaidTakeover(
      {
        connectionId: plaidAccount.connectionId,
        plaidAccountId: plaidAccount.plaidAccountId,
        type: plaidAccount.type,
        currentBalance: plaidAccount.currentBalance,
      },
      {
        type: targetAsset.type,
        currentPrice: targetAsset.currentPrice,
        quantity: targetAsset.quantity,
        providerConfig: targetAsset.providerConfig ?? {},
      },
      holdingQuantity
    );

    await db
      .update(assets)
      .set({ ...patch, lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(assets.id, targetAssetId));

    await db
      .update(plaidAccounts)
      .set({ assetId: targetAssetId, isTracked: true, updatedAt: new Date() })
      .where(eq(plaidAccounts.id, id));

    return jsonResponse({ success: true, assetId: targetAssetId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request body", 400);
    }
    return handleError(error);
  }
}
