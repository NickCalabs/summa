import { db } from "@/lib/db";
import { coinbaseConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAuth,
} from "@/lib/api-helpers";
import { encrypt } from "@/lib/encryption";
import {
  verifyCoinbaseCredentials,
  CoinbaseProviderError,
} from "@/lib/providers/coinbase";
import { syncCoinbaseConnection } from "@/lib/coinbase-sync";
import { coinbaseCreateConnection, parseBody } from "@/types";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const connections = await db
      .select()
      .from(coinbaseConnections)
      .where(eq(coinbaseConnections.userId, user.id));

    return jsonResponse(
      connections.map((c) => ({
        id: c.id,
        label: c.label,
        errorCode: c.errorCode,
        errorMessage: c.errorMessage,
        lastSyncedAt: c.lastSyncedAt,
        createdAt: c.createdAt,
      }))
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, coinbaseCreateConnection);

    try {
      await verifyCoinbaseCredentials(body.keyName, body.privateKey);
    } catch (error) {
      if (error instanceof CoinbaseProviderError) {
        return errorResponse(error.message, error.status, { code: error.code });
      }
      throw error;
    }

    const [connection] = await db
      .insert(coinbaseConnections)
      .values({
        userId: user.id,
        label: body.label ?? "Coinbase",
        apiKeyEnc: encrypt(body.keyName),
        apiSecretEnc: encrypt(body.privateKey),
      })
      .returning();

    try {
      const syncResult = await syncCoinbaseConnection(connection.id);
      return jsonResponse({
        connection: {
          id: connection.id,
          label: connection.label,
          lastSyncedAt: new Date().toISOString(),
          errorCode: null,
          errorMessage: null,
        },
        syncResult,
      });
    } catch (error) {
      // Connection saved, but initial sync failed. Return OK so the UI shows
      // the error state and lets the user retry.
      if (error instanceof CoinbaseProviderError) {
        return jsonResponse({
          connection: {
            id: connection.id,
            label: connection.label,
            lastSyncedAt: null,
            errorCode: error.code,
            errorMessage: error.message,
          },
          syncResult: null,
        });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof CoinbaseProviderError) {
      return errorResponse(error.message, error.status, { code: error.code });
    }
    return handleError(error);
  }
}
