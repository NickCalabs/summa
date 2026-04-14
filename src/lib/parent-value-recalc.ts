import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";

// Recompute currentValue for every asset that has non-archived children.
// Child price updates (Yahoo/CoinGecko cron, wallet refreshers, Coinbase sync)
// only touch child rows, leaving a stale total on the parent until the parent's
// own provider re-syncs. Running this after a price refresh keeps parent
// totals aligned with the sum of their active children.
export async function recomputeParentValues(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE ${assets} parent
    SET
      current_value = COALESCE(child_totals.sum_value, 0),
      last_synced_at = NOW(),
      updated_at = NOW()
    FROM (
      SELECT parent_asset_id, SUM(current_value)::numeric(20, 2) AS sum_value
      FROM ${assets}
      WHERE parent_asset_id IS NOT NULL AND is_archived = FALSE
      GROUP BY parent_asset_id
    ) AS child_totals
    WHERE parent.id = child_totals.parent_asset_id
      AND parent.current_value IS DISTINCT FROM COALESCE(child_totals.sum_value, 0)
  `);

  // postgres-js returns rows in `.count` on update queries; `rowCount` in pg.
  // Fall back to 0 if the driver doesn't surface it.
  const updated =
    (result as { count?: number; rowCount?: number }).count ??
    (result as { rowCount?: number }).rowCount ??
    0;
  return updated;
}

// Single-parent variant — cheaper when we know exactly which parent to refresh
// (e.g., right after a Coinbase sync updates one hierarchy).
export async function recomputeParentValue(parentId: string): Promise<void> {
  const children = await db
    .select({ currentValue: assets.currentValue, isArchived: assets.isArchived })
    .from(assets)
    .where(eq(assets.parentAssetId, parentId));

  const total = children
    .filter((c) => !c.isArchived)
    .reduce((sum, c) => sum + Number(c.currentValue ?? 0), 0);

  await db
    .update(assets)
    .set({
      currentValue: total.toFixed(2),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(assets.id, parentId));
}

