import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, coinbaseConnections, portfolios } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import {
  getCoinbaseAccounts,
  type CoinbaseAccountInfo,
  CoinbaseProviderError,
} from "@/lib/providers/coinbase";
import { ensurePortfolioInstitutionSection } from "@/lib/provider-section-routing";

const STABLECOINS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "BUSD",
  "USDP",
  "PYUSD",
  "GUSD",
  "TUSD",
]);

function asFixed(value: string | number | null | undefined, decimals: number): string {
  const n = value == null ? 0 : Number(value);
  if (!Number.isFinite(n)) return (0).toFixed(decimals);
  return n.toFixed(decimals);
}

export interface CoinbaseSyncResult {
  synced: number;
  created: number;
  archived: number;
}

export async function syncCoinbaseConnection(
  connectionId: string
): Promise<CoinbaseSyncResult> {
  const [connection] = await db
    .select()
    .from(coinbaseConnections)
    .where(eq(coinbaseConnections.id, connectionId))
    .limit(1);

  if (!connection) {
    throw new CoinbaseProviderError(
      `Coinbase connection ${connectionId} not found`,
      404,
      "NOT_FOUND"
    );
  }

  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, connection.userId))
    .limit(1);

  if (!portfolio) {
    throw new CoinbaseProviderError(
      "No portfolio found for user",
      400,
      "NO_PORTFOLIO"
    );
  }

  const keyName = decrypt(connection.apiKeyEnc);
  const privateKey = decrypt(connection.apiSecretEnc);

  let accounts: CoinbaseAccountInfo[];
  try {
    accounts = await getCoinbaseAccounts(keyName, privateKey);
  } catch (error) {
    const providerError = error as CoinbaseProviderError;
    await db
      .update(coinbaseConnections)
      .set({
        errorCode: providerError?.code ?? "SYNC_ERROR",
        errorMessage: providerError?.message ?? "Sync failed",
        updatedAt: new Date(),
      })
      .where(eq(coinbaseConnections.id, connectionId));
    throw error;
  }

  const section = await ensurePortfolioInstitutionSection({
    portfolioId: portfolio.id,
    sheetType: "assets",
    institutionName: connection.label,
  });

  const existingParents = await db
    .select()
    .from(assets)
    .where(eq(assets.providerType, "coinbase"));

  const scopedParents = existingParents.filter(
    (a) => a.providerConfig?.connectionId === connectionId
  );

  const existingParent = scopedParents.find(
    (a) => a.providerConfig?.isGroupParent === true
  );

  const tickerAssets = await db
    .select()
    .from(assets)
    .where(eq(assets.providerType, "ticker"));

  const scopedChildren = tickerAssets.filter(
    (a) => a.providerConfig?.connectionId === connectionId
  );

  let parentId: string;
  if (existingParent) {
    parentId = existingParent.id;
  } else {
    const [created] = await db
      .insert(assets)
      .values({
        sectionId: section.id,
        name: connection.label,
        type: "crypto",
        currency: "USD",
        currentValue: "0",
        providerType: "coinbase",
        providerConfig: {
          isGroupParent: true,
          connectionId,
          institutionName: connection.label,
        },
        lastSyncedAt: new Date(),
      })
      .returning();
    parentId = created.id;
  }

  const childByAccountId = new Map<string, (typeof scopedChildren)[number]>();
  for (const child of scopedChildren) {
    const cbId = child.providerConfig?.coinbaseAccountId;
    if (cbId) childByAccountId.set(cbId, child);
  }

  let created = 0;
  let synced = 0;
  let archived = 0;
  const seenAccountIds = new Set<string>();

  for (const account of accounts) {
    seenAccountIds.add(account.accountId);

    const balance = Number(account.balance);
    const nativeBalance =
      account.nativeBalance != null ? Number(account.nativeBalance) : null;
    const existing = childByAccountId.get(account.accountId);

    // Skip zero-balance accounts we're not already tracking.
    if ((!Number.isFinite(balance) || balance === 0) && !existing) continue;

    const currency = account.currency || "USD";
    const ticker = `${currency.toUpperCase()}-USD`;
    const price =
      nativeBalance != null && balance > 0 ? nativeBalance / balance : null;
    const currentValueUsd = nativeBalance != null ? nativeBalance : balance;
    const isStable = STABLECOINS.has(currency.toUpperCase());

    if (existing) {
      const shouldArchive = balance === 0;
      const updates: Record<string, unknown> = {
        name: account.name,
        quantity: asFixed(balance, 8),
        currentValue: asFixed(currentValueUsd, 2),
        currentPrice: price != null ? asFixed(price, 8) : existing.currentPrice,
        currency,
        parentAssetId: parentId,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
        providerConfig: {
          ...(existing.providerConfig ?? {}),
          ticker,
          source: "yahoo",
          connectionId,
          coinbaseAccountId: account.accountId,
        },
        isCashEquivalent: isStable,
      };

      if (shouldArchive && !existing.isArchived) {
        updates.isArchived = true;
        archived++;
      } else if (!shouldArchive && existing.isArchived) {
        updates.isArchived = false;
      }

      await db.update(assets).set(updates).where(eq(assets.id, existing.id));
      synced++;
    } else {
      await db.insert(assets).values({
        sectionId: section.id,
        parentAssetId: parentId,
        name: account.name,
        type: "crypto",
        currency,
        quantity: asFixed(balance, 8),
        currentValue: asFixed(currentValueUsd, 2),
        currentPrice: price != null ? asFixed(price, 8) : null,
        providerType: "ticker",
        providerConfig: {
          ticker,
          source: "yahoo",
          connectionId,
          coinbaseAccountId: account.accountId,
        },
        isCashEquivalent: isStable,
        lastSyncedAt: new Date(),
      });
      created++;
    }
  }

  // Archive children whose Coinbase account disappeared.
  for (const child of scopedChildren) {
    const cbId = child.providerConfig?.coinbaseAccountId;
    if (cbId && !seenAccountIds.has(cbId) && !child.isArchived) {
      await db
        .update(assets)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(assets.id, child.id));
      archived++;
    }
  }

  // Recalculate parent value from non-archived children.
  const freshChildren = await db
    .select({
      currentValue: assets.currentValue,
      isArchived: assets.isArchived,
    })
    .from(assets)
    .where(eq(assets.parentAssetId, parentId));

  const parentValue = freshChildren
    .filter((c) => !c.isArchived)
    .reduce((sum, c) => sum + Number(c.currentValue ?? 0), 0);

  await db
    .update(assets)
    .set({
      currentValue: parentValue.toFixed(2),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(assets.id, parentId));

  await db
    .update(coinbaseConnections)
    .set({
      lastSyncedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(coinbaseConnections.id, connectionId));

  return { synced, created, archived };
}
