import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assets,
  coinbaseConnections,
  portfolios,
  sections,
  sheets,
} from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import {
  getCoinbaseAccounts,
  getCoinbaseSpotPrices,
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

  // Prefer the user-pinned section (set at connect time / remembered from
  // previous syncs). Verify it still exists and still belongs to this user's
  // portfolio before using it — fall back to the auto-created institution
  // section if the pinned one was deleted or moved out of the portfolio.
  let section: { id: string; sheetId: string; name: string } | null = null;
  if (connection.sectionId) {
    const [owned] = await db
      .select({ id: sections.id, sheetId: sections.sheetId, name: sections.name })
      .from(sections)
      .innerJoin(sheets, eq(sheets.id, sections.sheetId))
      .where(
        and(
          eq(sections.id, connection.sectionId),
          eq(sheets.portfolioId, portfolio.id)
        )
      )
      .limit(1);
    if (owned) section = owned;
  }

  if (!section) {
    section = await ensurePortfolioInstitutionSection({
      portfolioId: portfolio.id,
      sheetType: "assets",
      institutionName: connection.label,
    });
  }

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
  // If the parent exists, keep it (and its children) where the user put it.
  // If we're creating a new parent/child, follow the pinned section.
  const targetSectionId = existingParent?.sectionId ?? section.id;

  if (existingParent) {
    parentId = existingParent.id;
  } else {
    const [created] = await db
      .insert(assets)
      .values({
        sectionId: targetSectionId,
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

  // Fetch authoritative USD spot prices from Coinbase for every currency we
  // see. The CDP-authenticated /v2/accounts endpoint doesn't return
  // native_balance, so Yahoo Finance was our only other option — and Yahoo
  // doesn't cover many altcoins (PENGU, BOND, ANKR, etc.), leaving them at $0.
  // Coinbase's public spot endpoint covers every coin they list.
  const currencies = accounts.map((a) => a.currency).filter(Boolean);
  const spotPrices = await getCoinbaseSpotPrices(currencies);

  let created = 0;
  let synced = 0;
  let archived = 0;
  const seenAccountIds = new Set<string>();

  for (const account of accounts) {
    seenAccountIds.add(account.accountId);

    const balance = Number(account.balance);
    const existing = childByAccountId.get(account.accountId);

    // Skip zero-balance accounts we're not already tracking.
    if ((!Number.isFinite(balance) || balance === 0) && !existing) continue;

    const nativeCurrency = account.currency || "USD";
    const ticker = `${nativeCurrency.toUpperCase()}-USD`;

    // Price priority:
    //   1. Fresh Coinbase spot price (authoritative, covers every Coinbase coin)
    //   2. Previously-stored currentPrice (preserves a usable value when
    //      spot lookup failed this pass — e.g. transient network blip)
    //   3. null (no way to value the asset yet)
    const spot = spotPrices.get(nativeCurrency.toUpperCase()) ?? null;
    const priceToStore =
      spot != null
        ? asFixed(spot, 8)
        : existing?.currentPrice ?? null;

    // USD value = quantity × known price; 0 if no price is available.
    // Never fall back to the native quantity as a fake dollar value.
    const currentValueUsd =
      priceToStore != null ? Number(priceToStore) * balance : 0;

    // All Summa ticker-provider assets store currentValue in USD and set
    // currency = "USD". The native crypto unit lives in quantity +
    // providerConfig.nativeCurrency; using the native symbol as the
    // currency breaks the app's FX conversion path.
    const currency = "USD";
    const isStable = STABLECOINS.has(nativeCurrency.toUpperCase());

    if (existing) {
      const shouldArchive = balance === 0;
      const updates: Record<string, unknown> = {
        name: account.name,
        quantity: asFixed(balance, 8),
        currentValue: asFixed(currentValueUsd, 2),
        currentPrice: priceToStore,
        currency,
        parentAssetId: parentId,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
        providerConfig: {
          ...(existing.providerConfig ?? {}),
          ticker,
          source: "coinbase",
          connectionId,
          coinbaseAccountId: account.accountId,
          nativeCurrency,
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
        sectionId: targetSectionId,
        parentAssetId: parentId,
        name: account.name,
        type: "crypto",
        currency,
        quantity: asFixed(balance, 8),
        currentValue: asFixed(currentValueUsd, 2),
        currentPrice: priceToStore,
        providerType: "ticker",
        providerConfig: {
          ticker,
          source: "coinbase",
          connectionId,
          coinbaseAccountId: account.accountId,
          nativeCurrency,
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
