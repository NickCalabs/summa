import cron from "node-cron";
import { db } from "@/lib/db";
import {
  assets,
  portfolios,
  plaidConnections,
  plaidAccounts,
  coinbaseConnections,
} from "@/lib/db/schema";
import { eq, isNull, isNotNull, ne, and, or, lt } from "drizzle-orm";
import { getYahooBatchPrices } from "@/lib/providers/yahoo";
import { getCoinGeckoBatchPrices } from "@/lib/providers/coingecko";
import { getCoinbaseSpotPrices } from "@/lib/providers/coinbase";
import { takePortfolioSnapshot } from "@/lib/snapshots";
import { refreshAndStoreRates } from "@/lib/providers/exchange-rates";
import { isPlaidConfigured, getBalances } from "@/lib/providers/plaid";
import { decrypt } from "@/lib/encryption";
import { refreshBtcWallets, refreshEthWallets, refreshSolWallets } from "@/lib/wallets";
import { syncCoinbaseConnection } from "@/lib/coinbase-sync";
import { recomputeParentValues } from "@/lib/parent-value-recalc";

let started = false;

// Concurrency guards — prevent overlapping job executions
const running = {
  prices: false,
  cryptoPrices: false,
  plaid: false,
  coinbase: false,
  snapshots: false,
  btcWallets: false,
  ethWallets: false,
  solWallets: false,
};

// Maximum backoff: 7 days in ms
const MAX_BACKOFF_MS = 7 * 24 * 60 * 60 * 1000;

function nextBackoffMs(retryCount: number): number {
  const ms = 24 * 60 * 60 * 1000 * Math.pow(2, retryCount - 1);
  return Math.min(ms, MAX_BACKOFF_MS);
}

export async function refreshPrices(opts: { sources?: string[] } = {}) {
  const ts = new Date().toISOString();
  const sourceFilter = opts.sources ? new Set(opts.sources) : null;
  const label = sourceFilter
    ? `(${[...sourceFilter].join(",")})`
    : "(all sources)";
  console.log(`[cron] ${ts} Starting price refresh ${label}...`);

  try {
    const tickerAssets = await db
      .select()
      .from(assets)
      .where(eq(assets.providerType, "ticker"));

    const activeAssets = tickerAssets.filter((a) => !a.isArchived);

    if (activeAssets.length === 0) {
      console.log(`[cron] ${ts} No ticker assets to refresh`);
      return;
    }

    // Group by source + currency → "yahoo:USD", "coingecko:usd"
    const groups = new Map<string, typeof activeAssets>();
    for (const asset of activeAssets) {
      const source = asset.providerConfig?.source ?? "yahoo";
      if (sourceFilter && !sourceFilter.has(source)) continue;
      const currency = asset.currency ?? "USD";
      const key = `${source}:${currency}`;
      const group = groups.get(key) ?? [];
      group.push(asset);
      groups.set(key, group);
    }

    let updatedCount = 0;

    for (const [key, groupAssets] of groups) {
      const [source, currency] = key.split(":");
      try {
        if (source === "yahoo") {
          const symbols = groupAssets
            .map((a) => a.providerConfig?.ticker)
            .filter(Boolean) as string[];
          if (symbols.length === 0) continue;

          const prices = await getYahooBatchPrices(symbols);

          for (const asset of groupAssets) {
            const ticker = asset.providerConfig?.ticker;
            if (!ticker) continue;
            const result = prices.get(ticker);
            if (!result) continue;
            if (result.price <= 0) {
              console.warn(`[cron] Skipping price update for ${ticker}: received invalid price ${result.price}`);
              continue;
            }

            const qty = asset.quantity ? Number(asset.quantity) : null;
            const newValue = qty != null ? (qty * result.price).toFixed(2) : result.price.toFixed(2);

            await db
              .update(assets)
              .set({
                currentPrice: result.price.toFixed(8),
                currentValue: newValue,
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(assets.id, asset.id));
            updatedCount++;
          }
        } else if (source === "coingecko") {
          const coinIds = groupAssets
            .map((a) => a.providerConfig?.ticker)
            .filter(Boolean) as string[];
          if (coinIds.length === 0) continue;

          const prices = await getCoinGeckoBatchPrices(coinIds, currency);

          for (const asset of groupAssets) {
            const coinId = asset.providerConfig?.ticker;
            if (!coinId) continue;
            const result = prices.get(coinId);
            if (!result) continue;

            const qty = asset.quantity ? Number(asset.quantity) : null;
            const newValue = qty != null ? (qty * result.price).toFixed(2) : result.price.toFixed(2);

            await db
              .update(assets)
              .set({
                currentPrice: result.price.toFixed(8),
                currentValue: newValue,
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(assets.id, asset.id));
            updatedCount++;
          }
        } else if (source === "coinbase") {
          // providerConfig.nativeCurrency is the underlying coin symbol
          // (e.g. "BTC", "PENGU"). The ticker field looks like "BTC-USD"
          // but we need just the symbol for the spot price lookup.
          const symbols = groupAssets
            .map(
              (a) =>
                (a.providerConfig as { nativeCurrency?: string } | null)
                  ?.nativeCurrency ??
                (a.providerConfig?.ticker?.split("-")[0] ?? null)
            )
            .filter((s): s is string => !!s);
          if (symbols.length === 0) continue;

          const prices = await getCoinbaseSpotPrices(symbols);

          for (const asset of groupAssets) {
            const symbol =
              (asset.providerConfig as { nativeCurrency?: string } | null)
                ?.nativeCurrency ??
              asset.providerConfig?.ticker?.split("-")[0] ??
              null;
            if (!symbol) continue;
            const price = prices.get(symbol.toUpperCase());
            if (price == null) continue;

            const qty = asset.quantity ? Number(asset.quantity) : null;
            const newValue =
              qty != null ? (qty * price).toFixed(2) : price.toFixed(2);

            await db
              .update(assets)
              .set({
                currentPrice: price.toFixed(8),
                currentValue: newValue,
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(assets.id, asset.id));
            updatedCount++;
          }
        }
      } catch (error) {
        console.error(`[cron] ${ts} Error refreshing group ${key}:`, error);
      }
    }

    if (updatedCount > 0) {
      try {
        const parentsUpdated = await recomputeParentValues();
        if (parentsUpdated > 0) {
          console.log(
            `[cron] ${ts} Recomputed ${parentsUpdated} parent asset values`
          );
        }
      } catch (error) {
        console.error(`[cron] ${ts} Parent value recompute failed:`, error);
      }
    }

    console.log(`[cron] ${ts} Price refresh complete: ${updatedCount} assets updated`);
  } catch (error) {
    console.error(`[cron] ${ts} Price refresh failed:`, error);
  }
}

async function dailySnapshots() {
  const ts = new Date().toISOString();
  console.log(`[cron] ${ts} Starting daily snapshots...`);

  try {
    const allPortfolios = await db.select().from(portfolios);
    let successCount = 0;
    let failCount = 0;

    for (const portfolio of allPortfolios) {
      try {
        await takePortfolioSnapshot(portfolio.id);
        successCount++;
      } catch (error) {
        failCount++;
        console.error(
          `[cron] ${ts} Snapshot failed for portfolio ${portfolio.id}:`,
          error
        );
      }
    }

    console.log(
      `[cron] ${ts} Daily snapshots complete: ${successCount} succeeded, ${failCount} failed`
    );
  } catch (error) {
    console.error(`[cron] ${ts} Daily snapshots failed:`, error);
  }
}

async function refreshExchangeRates() {
  const ts = new Date().toISOString();
  console.log(`[cron] ${ts} Refreshing exchange rates...`);

  try {
    const allPortfolios = await db.select().from(portfolios);
    const currencies = [...new Set(allPortfolios.map((p) => p.currency))];

    for (const currency of currencies) {
      try {
        await refreshAndStoreRates(currency);
        console.log(`[cron] ${ts} Refreshed rates for ${currency}`);
      } catch (error) {
        console.error(
          `[cron] ${ts} Failed to refresh rates for ${currency}:`,
          error
        );
      }
    }

    console.log(
      `[cron] ${ts} Exchange rate refresh complete: ${currencies.length} currencies`
    );
  } catch (error) {
    console.error(`[cron] ${ts} Exchange rate refresh failed:`, error);
  }
}

export async function refreshPlaidBalances() {
  if (!isPlaidConfigured()) return;

  const ts = new Date().toISOString();
  const now = new Date();
  console.log(`[cron] ${ts} Starting Plaid balance refresh...`);

  try {
    // Include connections that:
    //   1. Have no error (healthy), OR
    //   2. Have an error with no expiry set (legacy records — treat as expired), OR
    //   3. Have an error whose expiry has passed (time to retry)
    const connections = await db
      .select()
      .from(plaidConnections)
      .where(
        or(
          isNull(plaidConnections.errorCode),
          and(
            isNotNull(plaidConnections.errorCode),
            ne(plaidConnections.errorCode, "PENDING_EXPIRATION"),
            isNull(plaidConnections.errorExpiresAt)
          ),
          lt(plaidConnections.errorExpiresAt, now)
        )
      );

    let updatedCount = 0;

    for (const connection of connections) {

      try {
        const accessToken = decrypt(connection.accessTokenEnc);
        const balances = await getBalances(accessToken);

        for (const balance of balances) {
          const [updated] = await db
            .update(plaidAccounts)
            .set({
              currentBalance: balance.currentBalance?.toFixed(2) ?? null,
              availableBalance: balance.availableBalance?.toFixed(2) ?? null,
              updatedAt: new Date(),
            })
            .where(eq(plaidAccounts.plaidAccountId, balance.accountId))
            .returning();

          if (updated?.assetId && balance.currentBalance != null) {
            await db
              .update(assets)
              .set({
                currentValue: Math.abs(balance.currentBalance).toFixed(2),
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(assets.id, updated.assetId));
            updatedCount++;
          }
        }

        // Mark assets for accounts not returned by Plaid as stale
        const returnedAccountIds = new Set(balances.map((b) => b.accountId));
        const allAccounts = await db
          .select({ plaidAccountId: plaidAccounts.plaidAccountId, assetId: plaidAccounts.assetId })
          .from(plaidAccounts)
          .where(eq(plaidAccounts.connectionId, connection.id));

        for (const acct of allAccounts) {
          if (!returnedAccountIds.has(acct.plaidAccountId) && acct.assetId) {
            await db
              .update(assets)
              .set({ lastSyncedAt: null, updatedAt: new Date() })
              .where(eq(assets.id, acct.assetId));
          }
        }

        await db
          .update(plaidConnections)
          .set({
            lastSyncedAt: new Date(),
            errorCode: null,
            errorMessage: null,
            errorExpiresAt: null,
            errorRetryCount: 0,
            updatedAt: new Date(),
          })
          .where(eq(plaidConnections.id, connection.id));
      } catch (error: any) {
        console.error(
          `[cron] ${ts} Plaid refresh failed for connection ${connection.id}:`,
          error
        );
        // Exponential backoff: 24h → 48h → 96h, capped at 7 days
        const nextRetryCount = (connection.errorRetryCount ?? 0) + 1;
        const errorExpiresAt = new Date(Date.now() + nextBackoffMs(nextRetryCount));
        await db
          .update(plaidConnections)
          .set({
            errorCode: error?.response?.data?.error_code ?? "SYNC_ERROR",
            errorMessage:
              error?.response?.data?.error_message ?? "Balance sync failed",
            errorExpiresAt,
            errorRetryCount: nextRetryCount,
            updatedAt: new Date(),
          })
          .where(eq(plaidConnections.id, connection.id));
      }
    }

    console.log(
      `[cron] ${ts} Plaid balance refresh complete: ${updatedCount} assets updated`
    );
  } catch (error) {
    console.error(`[cron] ${ts} Plaid balance refresh failed:`, error);
  }
}

export async function refreshCoinbaseConnections() {
  const ts = new Date().toISOString();
  console.log(`[cron] ${ts} Starting Coinbase sync...`);

  try {
    const connections = await db.select().from(coinbaseConnections);

    if (connections.length === 0) return;

    let total = 0;
    for (const connection of connections) {
      try {
        const result = await syncCoinbaseConnection(connection.id);
        total += result.synced + result.created;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[cron] ${ts} Coinbase sync failed for connection ${connection.id}:`,
          message
        );
      }
    }

    console.log(
      `[cron] ${ts} Coinbase sync complete: ${total} assets updated across ${connections.length} connections`
    );
  } catch (error) {
    console.error(`[cron] ${ts} Coinbase sync failed:`, error);
  }
}

export function startCronJobs() {
  if (started) return;
  started = true;

  console.log(`[cron] ${new Date().toISOString()} Registering cron jobs...`);

  // Every 15 minutes — refresh stock/ETF prices via Yahoo.
  // Yahoo's free tier is 15-min delayed for most tickers, so polling
  // faster than this buys nothing during market hours.
  cron.schedule("*/15 * * * *", () => {
    if (running.prices) return;
    running.prices = true;
    refreshPrices({ sources: ["yahoo"] })
      .catch((err) => console.error("[cron] Unhandled error in refreshPrices:", err))
      .finally(() => { running.prices = false; });
  });

  // Every minute — refresh crypto prices via CoinGecko + Coinbase.
  // Crypto moves continuously and both providers support single-round
  // pulls for every holding, so this comfortably fits inside their
  // rate limits (CoinGecko 25 req/min bucket, Coinbase 10k req/hr).
  cron.schedule("* * * * *", () => {
    if (running.cryptoPrices) return;
    running.cryptoPrices = true;
    refreshPrices({ sources: ["coingecko", "coinbase"] })
      .catch((err) =>
        console.error("[cron] Unhandled error in crypto refreshPrices:", err)
      )
      .finally(() => {
        running.cryptoPrices = false;
      });
  });

  // Every 6 hours — refresh Plaid balances
  cron.schedule("0 */6 * * *", () => {
    if (running.plaid) return;
    running.plaid = true;
    refreshPlaidBalances()
      .catch((err) => console.error("[cron] Unhandled error in refreshPlaidBalances:", err))
      .finally(() => { running.plaid = false; });
  });

  // Every 15 minutes — refresh Coinbase balances.
  // Coinbase allows 10,000 req/hr and balance reads are cheap, so a tight
  // cadence keeps the portfolio fresh with the crypto market.
  cron.schedule("*/15 * * * *", () => {
    if (running.coinbase) return;
    running.coinbase = true;
    refreshCoinbaseConnections()
      .catch((err) =>
        console.error("[cron] Unhandled error in refreshCoinbaseConnections:", err)
      )
      .finally(() => {
        running.coinbase = false;
      });
  });

  // Every 30 minutes — refresh BTC watch-only wallets via Blockstream.
  // On-chain data doesn't move fast enough to justify tighter polling:
  // new blocks land every ~10 min and our users don't need sub-block
  // latency for net-worth tracking. 30-min is also gentle on the public
  // Blockstream/Mempool endpoints.
  cron.schedule("*/30 * * * *", () => {
    if (running.btcWallets) return;
    running.btcWallets = true;
    const ts = new Date().toISOString();
    refreshBtcWallets()
      .then((summary) => {
        if (summary.totalWallets === 0) return;
        console.log(
          `[cron] ${ts} BTC wallet refresh: ${summary.updated}/${summary.totalWallets} updated, ${summary.failed} failed${summary.priceAvailable ? "" : " (price unavailable)"}`
        );
      })
      .catch((err) =>
        console.error("[cron] Unhandled error in refreshBtcWallets:", err)
      )
      .finally(() => {
        running.btcWallets = false;
      });
  });

  // Every 30 minutes — refresh ETH watch-only wallets via Etherscan.
  // Same cadence as BTC. Token prices are aggressively cached by CoinGecko,
  // so the main cost per cycle is the Etherscan balance/tokentx calls.
  cron.schedule("*/30 * * * *", () => {
    if (running.ethWallets) return;
    running.ethWallets = true;
    const ts = new Date().toISOString();
    refreshEthWallets()
      .then((summary) => {
        if (summary.totalWallets === 0) return;
        console.log(
          `[cron] ${ts} ETH wallet refresh: ${summary.updated}/${summary.totalWallets} updated, ${summary.failed} failed${summary.priceAvailable ? "" : " (price unavailable)"}`
        );
      })
      .catch((err) =>
        console.error("[cron] Unhandled error in refreshEthWallets:", err)
      )
      .finally(() => {
        running.ethWallets = false;
      });
  });

  // Every 30 minutes — refresh SOL watch-only wallets via Helius DAS.
  // Same cadence as BTC/ETH. Helius returns prices inline, so the main
  // cost per cycle is just the DAS call per wallet.
  cron.schedule("*/30 * * * *", () => {
    if (running.solWallets) return;
    running.solWallets = true;
    const ts = new Date().toISOString();
    refreshSolWallets()
      .then((summary) => {
        if (summary.totalWallets === 0) return;
        console.log(
          `[cron] ${ts} SOL wallet refresh: ${summary.updated}/${summary.totalWallets} updated, ${summary.failed} failed${summary.priceAvailable ? "" : " (price unavailable)"}`
        );
      })
      .catch((err) =>
        console.error("[cron] Unhandled error in refreshSolWallets:", err)
      )
      .finally(() => {
        running.solWallets = false;
      });
  });

  // Midnight UTC — refresh exchange rates then take daily portfolio snapshots
  cron.schedule("0 0 * * *", () => {
    if (running.snapshots) return;
    running.snapshots = true;
    refreshExchangeRates()
      .then(() => dailySnapshots())
      .catch((err) => console.error("[cron] Unhandled error in daily jobs:", err))
      .finally(() => { running.snapshots = false; });
  }, { timezone: "UTC" });

  console.log(`[cron] ${new Date().toISOString()} Cron jobs registered`);
}
