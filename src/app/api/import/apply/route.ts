import { db } from "@/lib/db";
import {
  assets,
  assetSnapshots,
  importLogs,
  importSources,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  requireAssetOwnership,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, importApplyRequest } from "@/types";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, importApplyRequest);

    // Verify ownership of all assets before transaction
    const assetMap = new Map<string, Awaited<ReturnType<typeof requireAssetOwnership>>>();
    for (const update of body.updates) {
      const data = await requireAssetOwnership(update.assetId, user.id);
      assetMap.set(update.assetId, data);
    }

    const today = new Date().toISOString().split("T")[0];
    const results: Array<{
      assetId: string;
      assetName: string;
      previousValue: string;
      newValue: string;
      field: string;
    }> = [];

    await db.transaction(async (tx) => {
      for (const update of body.updates) {
        const { asset } = assetMap.get(update.assetId)!;

        const previousValue =
          update.field === "quantity"
            ? asset.quantity || "0"
            : asset.currentValue;

        const setFields: Record<string, any> = {
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        };

        if (update.field === "quantity") {
          setFields.quantity = update.value;
          if (asset.currentPrice) {
            setFields.currentValue = String(
              Number(update.value) * Number(asset.currentPrice)
            );
          }
        } else {
          setFields.currentValue = update.value;
        }

        if (update.currency) {
          setFields.currency = update.currency;
        }

        await tx
          .update(assets)
          .set(setFields)
          .where(eq(assets.id, update.assetId));

        const snapshotValue = setFields.currentValue || asset.currentValue;

        await tx
          .insert(assetSnapshots)
          .values({
            assetId: update.assetId,
            date: today,
            value: snapshotValue,
            valueInBase: snapshotValue,
            price: asset.currentPrice,
            quantity: setFields.quantity || asset.quantity,
            source: "import",
          })
          .onConflictDoUpdate({
            target: [assetSnapshots.assetId, assetSnapshots.date],
            set: {
              value: snapshotValue,
              valueInBase: snapshotValue,
              price: asset.currentPrice,
              quantity: setFields.quantity || asset.quantity,
              source: "import",
            },
          });

        results.push({
          assetId: update.assetId,
          assetName: asset.name,
          previousValue,
          newValue:
            update.field === "quantity"
              ? update.value
              : setFields.currentValue || asset.currentValue,
          field: update.field,
        });
      }

      if (body.saveSource) {
        await tx.insert(importSources).values({
          userId: user.id,
          name: body.saveSource.name,
          extractionHints: body.saveSource.extractionHints,
          fieldMappings: body.saveSource.fieldMappings,
        });
      }

      if (body.sourceId) {
        await tx
          .update(importSources)
          .set({ lastUsedAt: new Date() })
          .where(
            and(
              eq(importSources.id, body.sourceId),
              eq(importSources.userId, user.id)
            )
          );
      }
    });

    const [log] = await db
      .insert(importLogs)
      .values({
        sourceId: body.sourceId || null,
        userId: user.id,
        filename: body.filename,
        status: "success",
        appliedChanges: results,
      })
      .returning();

    return jsonResponse({ updated: results, logId: log.id });
  } catch (error) {
    return handleError(error);
  }
}
