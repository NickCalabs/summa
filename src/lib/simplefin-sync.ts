import { db } from "@/lib/db";
import {
  assets,
  sections,
  sheets,
  simplefinAccounts,
  simplefinConnections,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import {
  getSimpleFINAccounts,
  type SimpleFINProviderError,
} from "@/lib/providers/simplefin";

export interface SyncInput {
  connectionId: string;
  accessUrlEnc: string;
}

export interface SyncResult {
  ok: boolean;
  synced: number;
  warnings?: string[];
  errorCode?: string;
  errorMessage?: string;
  errorStatus?: number;
}

function formatAssetValue(
  balance: string | null,
  sheetType: "assets" | "debts"
): string {
  const parsed = balance ? Number(balance) : 0;
  if (!Number.isFinite(parsed)) return "0";
  return (sheetType === "debts" ? Math.abs(parsed) : parsed).toFixed(2);
}

export async function syncSimpleFINConnection(
  input: SyncInput
): Promise<SyncResult> {
  const { connectionId, accessUrlEnc } = input;

  let result;
  try {
    result = await getSimpleFINAccounts(decrypt(accessUrlEnc), {
      balancesOnly: true,
    });
  } catch (error) {
    const providerError = error as SimpleFINProviderError;
    if (providerError?.name === "SimpleFINProviderError") {
      await db
        .update(simplefinConnections)
        .set({
          errorCode: providerError.code,
          errorMessage: providerError.message,
          updatedAt: new Date(),
        })
        .where(eq(simplefinConnections.id, connectionId));

      return {
        ok: false,
        synced: 0,
        errorCode: providerError.code,
        errorMessage: providerError.message,
        errorStatus: providerError.status,
      };
    }

    throw error;
  }

  let updatedCount = 0;

  for (const accountBalance of result.accounts) {
    const [account] = await db
      .select()
      .from(simplefinAccounts)
      .where(
        and(
          eq(simplefinAccounts.connectionId, connectionId),
          eq(simplefinAccounts.simplefinAccountId, accountBalance.accountId)
        )
      )
      .limit(1);

    if (!account) continue;

    await db
      .update(simplefinAccounts)
      .set({
        connectionName: accountBalance.connectionName,
        institutionName: accountBalance.institutionName,
        accountName: accountBalance.accountName,
        currency: accountBalance.currency,
        balance: accountBalance.balance,
        availableBalance: accountBalance.availableBalance,
        balanceDate: accountBalance.balanceDate,
        updatedAt: new Date(),
      })
      .where(eq(simplefinAccounts.id, account.id));

    if (!account.assetId) continue;

    const assetInfo = await db
      .select({
        assetId: assets.id,
        sheetType: sheets.type,
      })
      .from(assets)
      .innerJoin(sections, eq(assets.sectionId, sections.id))
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .where(eq(assets.id, account.assetId))
      .limit(1);

    if (assetInfo.length === 0) continue;

    // Compute credit limit for debt accounts when SimpleFIN reports
    // both balance (debt owed) and available-balance (credit remaining).
    const limitPatch =
      assetInfo[0].sheetType === "debts" &&
      accountBalance.balance != null &&
      accountBalance.availableBalance != null
        ? (() => {
            const limit =
              Math.abs(Number(accountBalance.balance)) +
              Number(accountBalance.availableBalance);
            return Number.isFinite(limit) && limit > 0
              ? { creditLimit: limit }
              : null;
          })()
        : null;

    await db
      .update(assets)
      .set({
        currentValue: formatAssetValue(
          accountBalance.balance,
          assetInfo[0].sheetType
        ),
        ...(limitPatch && {
          providerConfig: sql`coalesce(${assets.providerConfig}, '{}'::jsonb) || ${JSON.stringify(limitPatch)}::jsonb`,
        }),
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(assets.id, account.assetId));

    updatedCount++;
  }

  // ── Auto-group by institution ──
  // Fetch all tracked accounts with their linked assets
  const trackedRows = await db
    .select({
      institutionName: simplefinAccounts.institutionName,
      assetId: simplefinAccounts.assetId,
      balance: simplefinAccounts.balance,
    })
    .from(simplefinAccounts)
    .where(
      and(
        eq(simplefinAccounts.connectionId, connectionId),
        eq(simplefinAccounts.isTracked, true),
        isNotNull(simplefinAccounts.assetId)
      )
    );

  const trackedAssetIds = trackedRows
    .map((r) => r.assetId!)
    .filter(Boolean);

  if (trackedAssetIds.length > 0) {
    const assetRows = await db
      .select()
      .from(assets)
      .where(inArray(assets.id, trackedAssetIds));

    const assetById = new Map(assetRows.map((a) => [a.id, a]));

    // Group by institution
    const byInstitution = new Map<
      string,
      {
        assetId: string;
        balance: string | null;
        asset: (typeof assetRows)[number];
      }[]
    >();
    for (const row of trackedRows) {
      const asset = assetById.get(row.assetId!);
      if (!asset) continue;
      // Skip grouping for accounts with no institution name
      const inst = row.institutionName?.trim();
      if (!inst) continue;
      const list = byInstitution.get(inst) ?? [];
      list.push({ assetId: row.assetId!, balance: row.balance, asset });
      byInstitution.set(inst, list);
    }

    for (const [institutionName, group] of byInstitution) {
      if (group.length < 2) continue;

      // Find existing parent or create one
      const childWithParent = group.find((g) => g.asset.parentAssetId);
      let parentId: string;

      if (childWithParent) {
        parentId = childWithParent.asset.parentAssetId!;
      } else {
        // Create parent in same section as first child
        const firstChild = group[0].asset;
        const [parent] = await db
          .insert(assets)
          .values({
            sectionId: firstChild.sectionId,
            name: institutionName,
            type: firstChild.type,
            currency: firstChild.currency,
            currentValue: "0",
            providerType: "simplefin",
            providerConfig: {
              isGroupParent: true,
              institutionName,
              connectionId,
            },
            lastSyncedAt: new Date(),
          })
          .returning();
        parentId = parent.id;
      }

      // Ensure all children point to parent + zero-balance archiving
      // (only for non-debt assets — a $0 credit card is still active)
      for (const { assetId, balance, asset } of group) {
        const isZero = !balance || Number(balance) === 0;
        const isDebt =
          asset.type === "credit_card" ||
          asset.type === "creditcard" ||
          asset.type === "loan";
        const updates: Record<string, unknown> = {};

        if (asset.parentAssetId !== parentId) {
          updates.parentAssetId = parentId;
        }
        if (!isDebt && isZero && !asset.isArchived) {
          updates.isArchived = true;
        } else if (!isZero && asset.isArchived) {
          updates.isArchived = false;
        }

        if (Object.keys(updates).length > 0) {
          await db
            .update(assets)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(assets.id, assetId));
        }
      }
    }
  }

  await db
    .update(simplefinConnections)
    .set({
      lastSyncedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      errorExpiresAt: null,
      errorRetryCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(simplefinConnections.id, connectionId));

  return {
    ok: true,
    synced: updatedCount,
    warnings: result.messages.length > 0 ? result.messages : undefined,
  };
}
