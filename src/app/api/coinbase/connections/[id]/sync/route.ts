import { db } from "@/lib/db";
import { coinbaseConnections } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import { syncCoinbaseConnection } from "@/lib/coinbase-sync";
import { CoinbaseProviderError } from "@/lib/providers/coinbase";

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
      .from(coinbaseConnections)
      .where(
        and(
          eq(coinbaseConnections.id, id),
          eq(coinbaseConnections.userId, user.id)
        )
      )
      .limit(1);

    if (!connection) return errorResponse("Connection not found", 404);

    try {
      const result = await syncCoinbaseConnection(id);
      return jsonResponse(result);
    } catch (error) {
      if (error instanceof CoinbaseProviderError) {
        return errorResponse(error.message, error.status, { code: error.code });
      }
      throw error;
    }
  } catch (error) {
    return handleError(error);
  }
}
