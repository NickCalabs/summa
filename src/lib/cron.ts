import cron from "node-cron";
import { db } from "@/lib/db";
import { assets, portfolios, plaidConnections, plaidAccounts } from "@/lib/db/schema";
import { eq, isNull, or, lt } from "drizzle-orm";
import { getYahooBatchPrices } from "@/lib/providers/yahoo";
import { getCoinGeckoBatchPrices } from "@/lib/providers/coingecko";
import { takePortfolioSnapshot } from "@/lib/snapshots";
import { refreshAndStoreRates } from "@/lib/providers/exchange-rates";
import { isPlaidConfigured, getBalances } from "@/lib/providers/plaid";
import { decrypt } from "@/lib/encryption";

let started = false;

// Concurrency guards — prevent overlapping job executions
const running = {
  prices: false,
  plaid: false,
  snapshots: false,
};

// Maximum backoff: 7 days in ms
const MAX_BACKOFF_MS = 7 * 24 * 60 * 60 * 1000;

function nextBackoffMs(retryCount: number): number {
  const ms = 24 * 60 * 60 * 1000 * Math.pow(2, retryCount - 1);
  return Math.min(ms, MAX_BACKOFF_MS);
}

async function refreshPrices() {
  const ts = new Date().toISOString();
  console.log(`[cron] ${ts} Starting price refresh...`);

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
        }
      } catch (error) {
        console.error(`[cron] ${ts} Error refreshing group ${key}:`, error);
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

async function refreshPlaidBalances() {
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
          isNull(plaidConnections.errorExpiresAt),
          lt(plaidConnections.errorExpiresAt, now)
        )
      );

    let updatedCount = 0;

    for (const connection of connections) {
      // PENDING_EXPIRATION requires user re-auth — skip auto-retry
      if (connection.errorCode === "PENDING_EXPIRATION") continue;

      try {
        const accessToken = decrypt(connection.accessTokenEnc);
        const balances = await getBalances(accessToken);

        for (const balance of balances) {
          await db
            .update(plaidAccounts)
            .set({
              currentBalance: balance.currentBalance?.toFixed(2) ?? null,
              availableBalance: balance.availableBalance?.toFixed(2) ?? null,
              updatedAt: new Date(),
            })
            .where(eq(plaidAccounts.plaidAccountId, balance.accountId));

          const [account] = await db
            .select()
            .from(plaidAccounts)
            .where(eq(plaidAccounts.plaidAccountId, balance.accountId))
            .limit(1);

          if (account?.assetId && balance.currentBalance != null) {
            await db
              .update(assets)
              .set({
                currentValue: Math.abs(balance.currentBalance).toFixed(2),
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(assets.id, account.assetId));
            updatedCount++;
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

export function startCronJobs() {
  if (started) return;
  started = true;

  console.log(`[cron] ${new Date().toISOString()} Registering cron jobs...`);

  // Every 15 minutes — refresh ticker-based asset prices
  cron.schedule("*/15 * * * *", () => {
    if (running.prices) return;
    running.prices = true;
    refreshPrices()
      .catch((err) => console.error("[cron] Unhandled error in refreshPrices:", err))
      .finally(() => { running.prices = false; });
  });

  // Every 6 hours — refresh Plaid balances
  cron.schedule("0 */6 * * *", () => {
    if (running.plaid) return;
    running.plaid = true;
    refreshPlaidBalances()
      .catch((err) => console.error("[cron] Unhandled error in refreshPlaidBalances:", err))
      .finally(() => { running.plaid = false; });
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
