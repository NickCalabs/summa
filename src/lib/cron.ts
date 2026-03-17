import cron from "node-cron";
import { db } from "@/lib/db";
import { assets, portfolios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getYahooBatchPrices } from "@/lib/providers/yahoo";
import { getCoinGeckoBatchPrices } from "@/lib/providers/coingecko";
import { takePortfolioSnapshot } from "@/lib/snapshots";
import { refreshAndStoreRates } from "@/lib/providers/exchange-rates";

let started = false;

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

export function startCronJobs() {
  if (started) return;
  started = true;

  console.log(`[cron] ${new Date().toISOString()} Registering cron jobs...`);

  // Every 15 minutes — refresh ticker-based asset prices
  cron.schedule("*/15 * * * *", () => {
    refreshPrices();
  });

  // Midnight UTC — refresh exchange rates then take daily portfolio snapshots
  cron.schedule("0 0 * * *", async () => {
    await refreshExchangeRates();
    await dailySnapshots();
  }, { timezone: "UTC" });

  console.log(`[cron] ${new Date().toISOString()} Cron jobs registered`);
}
