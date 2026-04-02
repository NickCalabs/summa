import { db } from "@/lib/db";
import {
  simplefinConnections,
  simplefinAccounts,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAuth,
} from "@/lib/api-helpers";
import { encrypt } from "@/lib/encryption";
import {
  claimSimpleFINAccessUrl,
  getSimpleFINAccounts,
  getSimpleFINServerUrl,
  normalizeSimpleFINAccessUrl,
  type SimpleFINProviderError,
} from "@/lib/providers/simplefin";
import { parseBody, simplefinCreateConnection } from "@/types";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const connections = await db
      .select()
      .from(simplefinConnections)
      .where(eq(simplefinConnections.userId, user.id));

    const connectionIds = connections.map((connection) => connection.id);
    let accounts: (typeof simplefinAccounts.$inferSelect)[] = [];

    if (connectionIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      accounts = await db
        .select()
        .from(simplefinAccounts)
        .where(inArray(simplefinAccounts.connectionId, connectionIds));
    }

    const accountsByConnection = new Map<string, typeof accounts>();
    for (const account of accounts) {
      const list = accountsByConnection.get(account.connectionId) ?? [];
      list.push(account);
      accountsByConnection.set(account.connectionId, list);
    }

    return jsonResponse(
      connections.map((connection) => ({
        id: connection.id,
        serverUrl: connection.serverUrl,
        label: connection.label,
        errorCode: connection.errorCode,
        errorMessage: connection.errorMessage,
        lastSyncedAt: connection.lastSyncedAt,
        createdAt: connection.createdAt,
        accounts: (accountsByConnection.get(connection.id) ?? []).map((account) => ({
          id: account.id,
          simplefinAccountId: account.simplefinAccountId,
          assetId: account.assetId,
          connectionName: account.connectionName,
          institutionName: account.institutionName,
          accountName: account.accountName,
          currency: account.currency,
          balance: account.balance,
          availableBalance: account.availableBalance,
          balanceDate: account.balanceDate,
          isTracked: account.isTracked,
        })),
      }))
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, simplefinCreateConnection);

    const accessUrl = body.accessUrl
      ? normalizeSimpleFINAccessUrl(body.accessUrl.trim())
      : await claimSimpleFINAccessUrl(body.setupToken!.trim());

    const { accounts, messages } = await getSimpleFINAccounts(accessUrl, {
      balancesOnly: true,
    });

    if (accounts.length === 0) {
      return errorResponse("SimpleFIN did not return any accounts", 400);
    }

    const serverUrl = getSimpleFINServerUrl(accessUrl);
    const uniqueInstitutions = new Set(
      accounts
        .map((account) => account.institutionName ?? account.connectionName)
        .filter((value): value is string => !!value)
    );

    const [connection] = await db
      .insert(simplefinConnections)
      .values({
        userId: user.id,
        serverUrl,
        label:
          uniqueInstitutions.size === 1
            ? [...uniqueInstitutions][0]!
            : "SimpleFIN Bridge",
        accessUrlEnc: encrypt(accessUrl),
      })
      .returning();

    const accountRows = await db
      .insert(simplefinAccounts)
      .values(
        accounts.map((account) => ({
          connectionId: connection.id,
          simplefinAccountId: account.accountId,
          connectionName: account.connectionName,
          institutionName: account.institutionName,
          accountName: account.accountName,
          currency: account.currency,
          balance: account.balance,
          availableBalance: account.availableBalance,
          balanceDate: account.balanceDate,
        }))
      )
      .returning();

    return jsonResponse({
      connection: {
        id: connection.id,
        label: connection.label,
        serverUrl: connection.serverUrl,
      },
      accounts: accountRows,
      warnings: messages,
    });
  } catch (error) {
    const providerError = error as SimpleFINProviderError;
    if (providerError?.name === "SimpleFINProviderError") {
      return errorResponse(providerError.message, providerError.status, {
        code: providerError.code,
      });
    }
    return handleError(error);
  }
}
