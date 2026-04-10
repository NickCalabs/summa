import { db } from "@/lib/db";
import { assets, simplefinAccounts, simplefinConnections } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
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

    // Find the SimpleFIN account and verify ownership
    const [account] = await db
      .select({
        account: simplefinAccounts,
        connectionUserId: simplefinConnections.userId,
      })
      .from(simplefinAccounts)
      .innerJoin(
        simplefinConnections,
        eq(simplefinAccounts.connectionId, simplefinConnections.id)
      )
      .where(eq(simplefinAccounts.id, id))
      .limit(1);

    if (!account || account.connectionUserId !== user.id) {
      return errorResponse("Account not found", 404);
    }

    const sfAccount = account.account;

    if (body.action === "unlink") {
      // Revert old asset to manual if it exists
      if (sfAccount.assetId) {
        await db
          .update(assets)
          .set({
            providerType: "manual",
            providerConfig: {},
            updatedAt: new Date(),
          })
          .where(eq(assets.id, sfAccount.assetId));
      }

      // Mark account as untracked
      await db
        .update(simplefinAccounts)
        .set({
          assetId: null,
          isTracked: false,
          updatedAt: new Date(),
        })
        .where(eq(simplefinAccounts.id, id));

      return jsonResponse({ success: true });
    }

    // action === "relink"
    const targetAssetId = body.assetId;

    // Verify target asset exists
    const [targetAsset] = await db
      .select()
      .from(assets)
      .where(eq(assets.id, targetAssetId))
      .limit(1);

    if (!targetAsset) {
      return errorResponse("Target asset not found", 404);
    }

    // Check target isn't already linked to another SimpleFIN account
    const [existingLink] = await db
      .select({ id: simplefinAccounts.id })
      .from(simplefinAccounts)
      .where(
        and(
          eq(simplefinAccounts.assetId, targetAssetId),
          eq(simplefinAccounts.isTracked, true)
        )
      )
      .limit(1);

    if (existingLink && existingLink.id !== id) {
      return errorResponse(
        "Asset is already linked to a SimpleFIN account",
        400
      );
    }

    // If previously linked to a different asset, revert it
    if (sfAccount.assetId && sfAccount.assetId !== targetAssetId) {
      await db
        .update(assets)
        .set({
          providerType: "manual",
          providerConfig: {},
          updatedAt: new Date(),
        })
        .where(eq(assets.id, sfAccount.assetId));
    }

    // Takeover target asset
    const balanceValue = sfAccount.balance ? Number(sfAccount.balance) : 0;
    await db
      .update(assets)
      .set({
        providerType: "simplefin",
        providerConfig: {
          connectionId: sfAccount.connectionId,
          simplefinAccountId: sfAccount.simplefinAccountId,
        },
        currentValue: Math.abs(balanceValue).toFixed(2),
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(assets.id, targetAssetId));

    // Update SimpleFIN account link
    await db
      .update(simplefinAccounts)
      .set({
        assetId: targetAssetId,
        isTracked: true,
        updatedAt: new Date(),
      })
      .where(eq(simplefinAccounts.id, id));

    return jsonResponse({ success: true, assetId: targetAssetId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request body", 400);
    }
    return handleError(error);
  }
}
