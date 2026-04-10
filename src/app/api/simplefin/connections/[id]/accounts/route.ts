import { db } from "@/lib/db";
import {
  assets,
  simplefinAccounts,
  simplefinConnections,
} from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requirePortfolioOwnership,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import {
  getInstitutionSectionName,
  inferSimpleFINAssetType,
  inferSimpleFINSheetType,
} from "@/lib/provider-account-grouping";
import { ensurePortfolioInstitutionSection } from "@/lib/provider-section-routing";
import { parseBody, simplefinLinkAccounts } from "@/types";

function getAssetValue(balance: string | null, sheetType: "assets" | "debts"): string {
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

    const body = await parseBody(request, simplefinLinkAccounts);
    await requirePortfolioOwnership(body.portfolioId, user.id);
    const created: string[] = [];

    for (const item of body.accounts) {
      const [account] = await db
        .select()
        .from(simplefinAccounts)
        .where(
          and(
            eq(simplefinAccounts.simplefinAccountId, item.simplefinAccountId),
            eq(simplefinAccounts.connectionId, id)
          )
        )
        .limit(1);

      if (!account || account.assetId) continue;

      const sheetType = inferSimpleFINSheetType({
        accountName: account.accountName,
        balance: account.balance,
      });
      const assetType = inferSimpleFINAssetType({
        accountName: account.accountName,
        balance: account.balance,
      });
      const targetSection = await ensurePortfolioInstitutionSection({
        portfolioId: body.portfolioId,
        sheetType,
        institutionName: getInstitutionSectionName(account.institutionName),
      });

      const [asset] = await db
        .insert(assets)
        .values({
          sectionId: targetSection.id,
          name: account.accountName,
          type: assetType,
          currency: account.currency,
          currentValue: getAssetValue(account.balance, sheetType),
          isCashEquivalent: sheetType === "assets" && assetType === "cash",
          providerType: "simplefin",
          providerConfig: {
            connectionId: id,
            simplefinAccountId: account.simplefinAccountId,
          },
          lastSyncedAt: new Date(),
        })
        .returning();

      await db
        .update(simplefinAccounts)
        .set({
          assetId: asset.id,
          isTracked: true,
          updatedAt: new Date(),
        })
        .where(eq(simplefinAccounts.id, account.id));

      created.push(asset.id);
    }

    // ── Auto-group multi-account institutions ──
    if (created.length > 0) {
      // Fetch all tracked accounts for this connection with their assets
      const allTracked = await db
        .select({
          institutionName: simplefinAccounts.institutionName,
          assetId: simplefinAccounts.assetId,
          balance: simplefinAccounts.balance,
        })
        .from(simplefinAccounts)
        .where(
          and(
            eq(simplefinAccounts.connectionId, id),
            eq(simplefinAccounts.isTracked, true)
          )
        );

      const allAssetIds = allTracked
        .map((r) => r.assetId)
        .filter((aid): aid is string => !!aid);

      if (allAssetIds.length > 0) {
        const assetRows = await db
          .select()
          .from(assets)
          .where(inArray(assets.id, allAssetIds));

        const assetById = new Map(assetRows.map((a) => [a.id, a]));

        // Group by institution
        const byInstitution = new Map<
          string,
          { assetId: string; balance: string | null; asset: (typeof assetRows)[number] }[]
        >();
        for (const row of allTracked) {
          const asset = row.assetId ? assetById.get(row.assetId) : null;
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

          // Set parentAssetId on children + archive zero-balance
          for (const { assetId, balance, asset } of group) {
            const isZero = !balance || Number(balance) === 0;
            const updates: Record<string, unknown> = {};

            if (asset.parentAssetId !== parentId) {
              updates.parentAssetId = parentId;
            }
            if (isZero) {
              updates.isArchived = true;
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
    }

    return jsonResponse({ created });
  } catch (error) {
    return handleError(error);
  }
}
