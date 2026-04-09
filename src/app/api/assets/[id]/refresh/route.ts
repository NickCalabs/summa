import {
  requireAuth,
  requireAssetOwnership,
  jsonResponse,
  errorResponse,
  handleError,
  validateUuid,
} from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { refreshBtcWallets, refreshEthWallets, refreshSolWallets } from "@/lib/wallets";

/**
 * POST /api/assets/:id/refresh
 *
 * Manual sync trigger for wallet assets. Bypasses the 30-minute cron so
 * the user can click "Sync now" in the detail panel and see fresh data
 * immediately. Reuses the exact same code path the cron uses.
 *
 * Currently only BTC wallets (providerType=wallet, chain=btc) are
 * supported. Calling this on a non-wallet asset returns 400.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "asset ID");
    const { asset } = await requireAssetOwnership(id, user.id);

    if (asset.providerType !== "wallet") {
      return errorResponse("Asset is not a wallet", 400);
    }
    const cfg = asset.providerConfig as { chain?: string } | null;
    if (cfg?.chain !== "btc" && cfg?.chain !== "eth" && cfg?.chain !== "sol") {
      return errorResponse(
        "Unsupported wallet chain for refresh",
        400
      );
    }

    const summary =
      cfg.chain === "sol"
        ? await refreshSolWallets({ assetId: id })
        : cfg.chain === "eth"
          ? await refreshEthWallets({ assetId: id })
          : await refreshBtcWallets({ assetId: id });

    // Return the refreshed asset row so the client can update its cache
    // without a second fetch.
    const [refreshed] = await db
      .select()
      .from(assets)
      .where(eq(assets.id, id))
      .limit(1);

    return jsonResponse({ asset: refreshed, summary });
  } catch (error) {
    return handleError(error);
  }
}
