import { db } from "@/lib/db";
import { assets, assetSnapshots } from "@/lib/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import {
  requireAuth,
  requireAssetOwnership,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, updateAsset } from "@/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    const { asset } = await requireAssetOwnership(id, user.id);

    // Last 30 days of snapshots
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromDate = thirtyDaysAgo.toISOString().split("T")[0];

    const snapshots = await db
      .select()
      .from(assetSnapshots)
      .where(
        and(eq(assetSnapshots.assetId, id), gte(assetSnapshots.date, fromDate))
      )
      .orderBy(desc(assetSnapshots.date));

    return jsonResponse({ ...asset, snapshots });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    const { asset } = await requireAssetOwnership(id, user.id);

    const body = await parseBody(request, updateAsset);

    const updateData: Record<string, unknown> = {};

    // Copy simple fields
    const simpleFields = [
      "name", "type", "currency", "isInvestable", "isCashEquivalent",
      "providerType", "providerConfig", "ownershipPct", "notes",
      "staleDays", "linkedDebtId", "costBasis",
    ] as const;

    for (const field of simpleFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Asset PATCH recalculation — 3 mutually exclusive modes:
    const hasCurrentValue = body.currentValue !== undefined;
    const hasQuantity = body.quantity !== undefined;
    const hasCurrentPrice = body.currentPrice !== undefined;

    if (hasCurrentValue && !hasQuantity && !hasCurrentPrice) {
      // Mode 1: Value-only — user typed a value directly
      updateData.currentValue = body.currentValue;
      updateData.currentPrice = null;
    } else if ((hasQuantity || hasCurrentPrice) && !hasCurrentValue) {
      // Mode 2: Price-driven — recalc currentValue = quantity × currentPrice
      const quantity = hasQuantity ? Number(body.quantity) : Number(asset.quantity ?? 0);
      const price = hasCurrentPrice ? Number(body.currentPrice) : Number(asset.currentPrice ?? 0);
      const computed = quantity * price;

      if (hasQuantity) updateData.quantity = body.quantity;
      if (hasCurrentPrice) updateData.currentPrice = body.currentPrice;
      updateData.currentValue = computed.toFixed(2);
    } else if (hasCurrentValue && (hasQuantity || hasCurrentPrice)) {
      // Mode 3: Explicit all-fields — store as-is
      updateData.currentValue = body.currentValue;
      if (hasQuantity) updateData.quantity = body.quantity;
      if (hasCurrentPrice) updateData.currentPrice = body.currentPrice;
    }

    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(assets)
      .set(updateData)
      .where(eq(assets.id, id))
      .returning();

    return jsonResponse(updated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    await requireAssetOwnership(id, user.id);

    // Soft delete
    const [updated] = await db
      .update(assets)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(assets.id, id))
      .returning();

    return jsonResponse(updated);
  } catch (error) {
    return handleError(error);
  }
}
