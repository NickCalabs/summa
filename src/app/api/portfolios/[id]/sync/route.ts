import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
  validateUuid,
} from "@/lib/api-helpers";
import { refreshPrices, refreshPlaidBalances } from "@/lib/cron";
import { takePortfolioSnapshot } from "@/lib/snapshots";
import { db } from "@/lib/db";
import { simplefinConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { syncSimpleFINConnection } from "@/lib/simplefin-sync";

// Per-portfolio in-memory throttle: 30 seconds between syncs.
// Manual refresh fans out to Yahoo + CoinGecko + Plaid; we don't want a
// user smashing the button to burn through CoinGecko's rate budget.
const MIN_INTERVAL_MS = 30_000;
const lastSyncAt = new Map<string, number>();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const now = Date.now();
    const last = lastSyncAt.get(id) ?? 0;
    if (now - last < MIN_INTERVAL_MS) {
      const retryAfter = Math.ceil((MIN_INTERVAL_MS - (now - last)) / 1000);
      return new Response(
        JSON.stringify({
          error: "Sync requested too soon",
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        }
      );
    }
    lastSyncAt.set(id, now);

    // Sync SimpleFIN connections for this user (direct function call, no HTTP)
    const sfConnections = await db
      .select({
        id: simplefinConnections.id,
        accessUrlEnc: simplefinConnections.accessUrlEnc,
      })
      .from(simplefinConnections)
      .where(eq(simplefinConnections.userId, user.id));

    const simplefinSyncs = sfConnections.map((c) =>
      syncSimpleFINConnection({
        connectionId: c.id,
        accessUrlEnc: c.accessUrlEnc,
      }).catch(() => null)
    );

    // Fan out: prices + Plaid + SimpleFIN all run in parallel.
    // Snapshot runs after all settle so it captures the latest values.
    const results = await Promise.allSettled([
      refreshPrices(),
      refreshPlaidBalances(),
      ...simplefinSyncs,
    ]);

    const snapshot = await takePortfolioSnapshot(id);

    return jsonResponse({
      ok: true,
      prices: results[0].status,
      plaid: results[1].status,
      simplefin: sfConnections.length > 0 ? "fulfilled" : "skipped",
      snapshot,
    });
  } catch (error) {
    return handleError(error);
  }
}
