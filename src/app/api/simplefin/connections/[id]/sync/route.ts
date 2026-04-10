import { db } from "@/lib/db";
import {
  assets,
  sections,
  sheets,
  simplefinAccounts,
  simplefinConnections,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import { decrypt } from "@/lib/encryption";
import {
  getSimpleFINAccounts,
  type SimpleFINAccountsResult,
  type SimpleFINProviderError,
} from "@/lib/providers/simplefin";

function formatAssetValue(balance: string | null, sheetType: "assets" | "debts"): string {
  const parsed = balance ? Number(balance) : 0;
  if (!Number.isFinite(parsed)) return "0";
  return (sheetType === "debts" ? Math.abs(parsed) : parsed).toFixed(2);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "connection ID");

    const [connection] = await db
      .select()
      .from(simplefinConnections)
      .where(
        and(
          eq(simplefinConnections.id, id),
          eq(simplefinConnections.userId, user.id)
        )
      )
      .limit(1);

    if (!connection) {
      return errorResponse("Connection not found", 404);
    }

    let result: SimpleFINAccountsResult;
    try {
      result = await getSimpleFINAccounts(decrypt(connection.accessUrlEnc), {
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
          .where(eq(simplefinConnections.id, id));

        return errorResponse(providerError.message, providerError.status, {
          code: providerError.code,
        });
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
            eq(simplefinAccounts.connectionId, id),
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

      await db
        .update(assets)
        .set({
          currentValue: formatAssetValue(
            accountBalance.balance,
            assetInfo[0].sheetType
          ),
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
          eq(simplefinAccounts.connectionId, id),
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
        { assetId: string; balance: string | null; asset: (typeof assetRows)[number] }[]
      >();
      for (const row of trackedRows) {
        const asset = assetById.get(row.assetId!);
        if (!asset) continue;
        const inst = row.institutionName ?? "Unknown";
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
                connectionId: id,
              },
              lastSyncedAt: new Date(),
            })
            .returning();
          parentId = parent.id;
        }

        // Ensure all children point to parent + zero-balance archiving
        for (const { assetId, balance, asset } of group) {
          const isZero = !balance || Number(balance) === 0;
          const updates: Record<string, unknown> = {};

          if (asset.parentAssetId !== parentId) {
            updates.parentAssetId = parentId;
          }
          if (isZero && !asset.isArchived) {
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
        updatedAt: new Date(),
      })
      .where(eq(simplefinConnections.id, id));

    return jsonResponse({
      synced: updatedCount,
      warnings: result.messages,
    });
  } catch (error) {
    return handleError(error);
  }
}
