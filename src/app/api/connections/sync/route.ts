import { jsonResponse, errorResponse, handleError, requireAuth } from "@/lib/api-helpers";
import { refreshPlaidBalances, refreshPrices } from "@/lib/cron";
import { refreshBtcWallets, refreshEthWallets, refreshSolWallets } from "@/lib/wallets";

// Per-user sync lock to prevent concurrent sync-all calls
const syncLocks = new Map<string, boolean>();

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    if (syncLocks.get(user.id)) {
      return errorResponse("Sync already in progress", 409);
    }

    syncLocks.set(user.id, true);

    try {
      const results = await Promise.allSettled([
        refreshBtcWallets(),
        refreshEthWallets(),
        refreshSolWallets(),
        refreshPlaidBalances(),
        refreshPrices(),
      ]);

      const summary = {
        btc: results[0].status === "fulfilled" ? results[0].value : { error: "failed" },
        eth: results[1].status === "fulfilled" ? results[1].value : { error: "failed" },
        sol: results[2].status === "fulfilled" ? results[2].value : { error: "failed" },
        plaid: results[3].status === "fulfilled" ? "ok" : "failed",
        prices: results[4].status === "fulfilled" ? "ok" : "failed",
      };

      return jsonResponse(summary);
    } finally {
      syncLocks.delete(user.id);
    }
  } catch (error) {
    return handleError(error);
  }
}
