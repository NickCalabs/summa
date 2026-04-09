import { db } from "@/lib/db";
import {
  assets,
  plaidConnections,
  plaidAccounts,
  simplefinConnections,
  simplefinAccounts,
  exchangeRates,
} from "@/lib/db/schema";
import { eq, and, sql, count } from "drizzle-orm";
import { jsonResponse, handleError, requireAuth } from "@/lib/api-helpers";
import { isPlaidConfigured } from "@/lib/providers/plaid";
import { isEtherscanConfigured } from "@/lib/providers/etherscan";
import { isHeliusConfigured } from "@/lib/providers/helius";

type ConnectionStatus = "ok" | "stale" | "error" | "never" | "unconfigured";

function computeStatus(
  lastSyncedAt: Date | string | null,
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined,
  expectedIntervalMs: number
): ConnectionStatus {
  if (errorCode || errorMessage) return "error";
  if (!lastSyncedAt) return "never";
  const syncAge = Date.now() - new Date(lastSyncedAt).getTime();
  if (syncAge > expectedIntervalMs * 2) return "stale";
  return "ok";
}

// Cron intervals in milliseconds
const INTERVALS = {
  wallet: 30 * 60 * 1000, // 30 min
  plaid: 6 * 60 * 60 * 1000, // 6 hours
  simplefin: 6 * 60 * 60 * 1000, // 6 hours (manual-only, generous window)
  yahoo: 15 * 60 * 1000, // 15 min
  coingecko: 60 * 1000, // 1 min
  frankfurter: 24 * 60 * 60 * 1000, // 24 hours
};

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    // --- Wallets ---
    const walletAssets = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.providerType, "wallet"),
          eq(assets.isArchived, false),
          // Only wallets owned by this user (through section → sheet → portfolio)
          sql`${assets.sectionId} IN (
            SELECT s.id FROM sections s
            JOIN sheets sh ON s.sheet_id = sh.id
            JOIN portfolios p ON sh.portfolio_id = p.id
            WHERE p.user_id = ${user.id}
          )`
        )
      );

    const wallets = walletAssets.map((a) => {
      const cfg = a.providerConfig as {
        chain?: string;
        address?: string;
      } | null;
      const meta = a.metadata as {
        lastSyncError?: string;
        lastSyncStatus?: string;
      } | null;
      return {
        id: a.id,
        name: a.name,
        chain: cfg?.chain ?? "unknown",
        address: cfg?.address ?? "",
        lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
        status: computeStatus(
          a.lastSyncedAt,
          meta?.lastSyncError ? "error" : null,
          meta?.lastSyncError,
          INTERVALS.wallet
        ),
        error: meta?.lastSyncError ?? null,
        currentValue: a.currentValue,
      };
    });

    // --- Plaid ---
    let plaid: Array<{
      id: string;
      institutionName: string;
      lastSyncedAt: string | null;
      status: ConnectionStatus;
      errorCode: string | null;
      errorMessage: string | null;
      accountCount: number;
    }> = [];

    if (isPlaidConfigured()) {
      const connections = await db
        .select()
        .from(plaidConnections)
        .where(eq(plaidConnections.userId, user.id));

      plaid = await Promise.all(
        connections.map(async (c) => {
          const [result] = await db
            .select({ count: count() })
            .from(plaidAccounts)
            .where(eq(plaidAccounts.connectionId, c.id));

          return {
            id: c.id,
            institutionName: c.institutionName,
            lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
            status: computeStatus(
              c.lastSyncedAt,
              c.errorCode,
              c.errorMessage,
              INTERVALS.plaid
            ),
            errorCode: c.errorCode,
            errorMessage: c.errorMessage,
            accountCount: result?.count ?? 0,
          };
        })
      );
    }

    // --- SimpleFIN ---
    const sfConnections = await db
      .select()
      .from(simplefinConnections)
      .where(eq(simplefinConnections.userId, user.id));

    const simplefin = await Promise.all(
      sfConnections.map(async (c) => {
        const [result] = await db
          .select({ count: count() })
          .from(simplefinAccounts)
          .where(eq(simplefinAccounts.connectionId, c.id));

        return {
          id: c.id,
          label: c.label,
          serverUrl: c.serverUrl,
          lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
          status: computeStatus(
            c.lastSyncedAt,
            c.errorCode,
            c.errorMessage,
            INTERVALS.simplefin
          ),
          errorCode: c.errorCode,
          errorMessage: c.errorMessage,
          accountCount: result?.count ?? 0,
        };
      })
    );

    // --- Price feeds (read-only status) ---
    // Yahoo — find the most recently synced ticker asset with source=yahoo
    const [latestYahoo] = await db
      .select({ lastSyncedAt: assets.lastSyncedAt })
      .from(assets)
      .where(
        and(
          eq(assets.providerType, "ticker"),
          sql`${assets.providerConfig}->>'source' = 'yahoo'`,
          sql`${assets.sectionId} IN (
            SELECT s.id FROM sections s
            JOIN sheets sh ON s.sheet_id = sh.id
            JOIN portfolios p ON sh.portfolio_id = p.id
            WHERE p.user_id = ${user.id}
          )`
        )
      )
      .orderBy(sql`${assets.lastSyncedAt} DESC NULLS LAST`)
      .limit(1);

    // CoinGecko — most recently synced ticker with source=coingecko
    const [latestCoinGecko] = await db
      .select({ lastSyncedAt: assets.lastSyncedAt })
      .from(assets)
      .where(
        and(
          eq(assets.providerType, "ticker"),
          sql`${assets.providerConfig}->>'source' = 'coingecko'`,
          sql`${assets.sectionId} IN (
            SELECT s.id FROM sections s
            JOIN sheets sh ON s.sheet_id = sh.id
            JOIN portfolios p ON sh.portfolio_id = p.id
            WHERE p.user_id = ${user.id}
          )`
        )
      )
      .orderBy(sql`${assets.lastSyncedAt} DESC NULLS LAST`)
      .limit(1);

    // Frankfurter — exchange rate cache age
    const [latestFx] = await db
      .select({ fetchedAt: exchangeRates.fetchedAt })
      .from(exchangeRates)
      .orderBy(sql`${exchangeRates.fetchedAt} DESC`)
      .limit(1);

    const priceFeeds = [
      {
        name: "yahoo" as const,
        lastFetchAt: latestYahoo?.lastSyncedAt?.toISOString() ?? null,
        status: computeStatus(
          latestYahoo?.lastSyncedAt ?? null,
          null,
          null,
          INTERVALS.yahoo
        ),
      },
      {
        name: "coingecko" as const,
        lastFetchAt: latestCoinGecko?.lastSyncedAt?.toISOString() ?? null,
        status: computeStatus(
          latestCoinGecko?.lastSyncedAt ?? null,
          null,
          null,
          INTERVALS.coingecko
        ),
      },
      {
        name: "frankfurter" as const,
        lastFetchAt: latestFx?.fetchedAt?.toISOString() ?? null,
        status: computeStatus(
          latestFx?.fetchedAt ?? null,
          null,
          null,
          INTERVALS.frankfurter
        ),
      },
    ];

    // Surface provider configuration status
    const providerStatus = {
      plaid: isPlaidConfigured(),
      etherscan: isEtherscanConfigured(),
      helius: isHeliusConfigured(),
    };

    return jsonResponse({
      wallets,
      plaid,
      simplefin,
      priceFeeds,
      providerStatus,
    });
  } catch (error) {
    return handleError(error);
  }
}
