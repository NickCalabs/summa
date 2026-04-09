import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getBtcBalanceBatch } from "@/lib/providers/blockstream";
import { getEthBalanceBatch, isEtherscanConfigured } from "@/lib/providers/etherscan";
import { getCoinGeckoBatchPrices, getCoinGeckoTokenPrice } from "@/lib/providers/coingecko";
import { computeCurrentValueUsd } from "@/lib/btc";
import { truncateEthQuantity, weiToEthString, isStablecoinContract } from "@/lib/eth";

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

// ── ETH wallet refresh ──

export interface EthWalletRefreshSummary {
  totalWallets: number;
  updated: number;
  failed: number;
  priceAvailable: boolean;
}

/**
 * Refresh on-chain balances for every active ETH wallet asset.
 *
 * Strategy:
 * 1. Pull every active `providerType=wallet, chain=eth` row.
 * 2. Hit Etherscan for each address (ETH + tokens).
 * 3. Pull an ETH/USD quote from CoinGecko.
 * 4. For each token, get USD price from CoinGecko contract lookup.
 * 5. Write new quantity + token metadata + total value to the asset row.
 */
export async function refreshEthWallets(
  opts: { assetId?: string } = {}
): Promise<EthWalletRefreshSummary> {
  if (!isEtherscanConfigured()) {
    return { totalWallets: 0, updated: 0, failed: 0, priceAvailable: false };
  }

  const ts = new Date().toISOString();

  const whereClauses = [
    eq(assets.providerType, "wallet"),
    eq(assets.isArchived, false),
    sql`${assets.providerConfig}->>'chain' = 'eth'`,
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

  const balanceMap = await getEthBalanceBatch(addresses, {
    skipCache: true,
    onError: (address, err) =>
      console.warn(
        `[wallets] ${ts} ETH balance fetch failed for ${address}: ${
          err instanceof Error ? err.message : String(err)
        }`
      ),
  });

  // ETH/USD price from CoinGecko
  let ethUsdPrice: number | null = null;
  try {
    const prices = await getCoinGeckoBatchPrices(["ethereum"], "USD");
    ethUsdPrice = prices.get("ethereum")?.price ?? null;
  } catch (err) {
    console.warn(
      `[wallets] ${ts} ETH price fetch failed; skipping price update:`,
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

    try {
      // Price each token
      const tokenList = await Promise.all(
        info.tokens.map(async (t) => {
          let priceUsd = 0;
          try {
            priceUsd = (await getCoinGeckoTokenPrice(t.contractAddress)) ?? 0;
          } catch {
            // CoinGecko miss — priceUsd stays 0
          }
          const balance = Number(t.formattedBalance);
          return {
            symbol: t.symbol,
            name: t.name,
            contractAddress: t.contractAddress,
            decimals: t.decimals,
            balance: t.formattedBalance,
            priceUsd,
            valueUsd: balance * priceUsd,
            isStablecoin: isStablecoinContract(t.contractAddress),
          };
        })
      );

      tokenList.sort((a, b) => b.valueUsd - a.valueUsd);
      const topTokens = tokenList.slice(0, 50);

      const ethValueUsd =
        ethUsdPrice != null ? info.ethBalanceFormatted * ethUsdPrice : 0;
      const tokenValueUsd = topTokens.reduce((sum, t) => sum + t.valueUsd, 0);
      const totalUsd = ethValueUsd + tokenValueUsd;

      const ethQty = truncateEthQuantity(weiToEthString(info.ethBalanceWei));

      const patch: Partial<typeof assets.$inferInsert> = {
        quantity: ethQty,
        currentValue: totalUsd.toFixed(2),
        metadata: {
          ...(wallet.metadata as Record<string, unknown> | null),
          ethBalance: ethQty,
          ethPriceUsd: ethUsdPrice,
          tokens: topTokens,
          totalUsd,
          lastSync: now.toISOString(),
        },
        lastSyncedAt: now,
        updatedAt: now,
      };
      if (ethUsdPrice != null) {
        patch.currentPrice = ethUsdPrice.toFixed(8);
      }

      await db.update(assets).set(patch).where(eq(assets.id, wallet.id));
      updated++;
    } catch (err) {
      console.error(`[wallets] ${ts} ETH wallet ${wallet.id} refresh failed:`, err);
      failed++;
    }
  }

  return {
    totalWallets: wallets.length,
    updated,
    failed,
    priceAvailable: ethUsdPrice != null,
  };
}
