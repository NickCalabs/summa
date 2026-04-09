import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getBtcBalanceBatch } from "@/lib/providers/blockstream";
import { getCoinGeckoBatchPrices } from "@/lib/providers/coingecko";
import { computeCurrentValueUsd } from "@/lib/btc";

/**
 * Refresh on-chain balances for every active BTC wallet asset.
 *
 * Used by:
 * - the 30-minute cron in `src/lib/cron.ts`
 * - the POST /api/wallets/refresh manual-sync endpoint
 *
 * Strategy:
 * 1. Pull every active `providerType=wallet, chain=btc` row.
 * 2. Hit Blockstream (with Mempool fallback) once per unique address.
 * 3. Pull a single BTC/USD quote from CoinGecko.
 * 4. For each wallet, write the new quantity + value + sync timestamp.
 *    Rows whose fetch failed are left untouched so the UI keeps showing
 *    the last-known-good value instead of dropping to zero.
 *
 * Returns a summary so callers can log / toast a result.
 */
export interface BtcWalletRefreshSummary {
  totalWallets: number;
  updated: number;
  failed: number;
  priceAvailable: boolean;
}

export async function refreshBtcWallets(
  opts: { assetId?: string } = {}
): Promise<BtcWalletRefreshSummary> {
  const ts = new Date().toISOString();

  const whereClauses = [
    eq(assets.providerType, "wallet"),
    eq(assets.isArchived, false),
    sql`${assets.providerConfig}->>'chain' = 'btc'`,
  ];
  if (opts.assetId) {
    whereClauses.push(eq(assets.id, opts.assetId));
  }

  const wallets = await db
    .select()
    .from(assets)
    .where(and(...whereClauses));

  if (wallets.length === 0) {
    return { totalWallets: 0, updated: 0, failed: 0, priceAvailable: false };
  }

  // Gather unique addresses. Multiple asset rows can legitimately point at
  // the same address (e.g. the user adds a watch to the cold wallet in two
  // different sheets). getBtcBalanceBatch already dedupes, but doing it
  // here too means our logs show accurate per-address counts.
  const addresses = [
    ...new Set(
      wallets
        .map((w) => {
          const cfg = w.providerConfig as { address?: string } | null;
          return cfg?.address ?? null;
        })
        .filter((a): a is string => typeof a === "string" && a.length > 0)
    ),
  ];

  const balanceMap = await getBtcBalanceBatch(addresses, {
    skipCache: true,
    onError: (address, err) =>
      console.warn(
        `[wallets] ${ts} BTC balance fetch failed for ${address}: ${
          err instanceof Error ? err.message : String(err)
        }`
      ),
  });

  // One CoinGecko fetch for the whole refresh. If it fails, we still
  // update the quantity (people care most about the BTC number) and leave
  // currentValue at the previous cycle's value.
  let btcUsdPrice: number | null = null;
  try {
    const prices = await getCoinGeckoBatchPrices(["bitcoin"], "USD");
    btcUsdPrice = prices.get("bitcoin")?.price ?? null;
  } catch (err) {
    console.warn(
      `[wallets] ${ts} BTC price fetch failed; skipping price update:`,
      err
    );
  }

  const now = new Date();
  let updated = 0;
  let failed = 0;

  for (const wallet of wallets) {
    const cfg = wallet.providerConfig as { address?: string } | null;
    const address = cfg?.address;
    if (!address) {
      failed++;
      continue;
    }
    const info = balanceMap.get(address);
    if (!info) {
      failed++;
      continue;
    }

    const valueUsd = computeCurrentValueUsd(info.balanceSats, btcUsdPrice);
    const patch: Partial<typeof assets.$inferInsert> = {
      quantity: info.balanceBtcString,
      lastSyncedAt: now,
      updatedAt: now,
    };
    if (valueUsd != null) {
      patch.currentValue = valueUsd;
    }
    if (btcUsdPrice != null) {
      patch.currentPrice = btcUsdPrice.toFixed(8);
    }

    await db.update(assets).set(patch).where(eq(assets.id, wallet.id));
    updated++;
  }

  return {
    totalWallets: wallets.length,
    updated,
    failed,
    priceAvailable: btcUsdPrice != null,
  };
}
