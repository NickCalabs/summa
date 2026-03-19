import { jsonResponse, errorResponse, handleError, requireAuth } from "@/lib/api-helpers";
import { isPlaidConfigured, createLinkToken } from "@/lib/providers/plaid";
import { db } from "@/lib/db";
import { plaidConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    if (!isPlaidConfigured()) {
      return errorResponse("Plaid is not configured", 400);
    }

    // Optional connectionId for update mode (reconnect flow)
    let connectionId: string | undefined;
    try {
      const body = await request.json();
      connectionId = body?.connectionId;
    } catch {
      // no body — new connection flow
    }

    let accessToken: string | undefined;
    if (connectionId) {
      const [connection] = await db
        .select()
        .from(plaidConnections)
        .where(
          and(
            eq(plaidConnections.id, connectionId),
            eq(plaidConnections.userId, user.id)
          )
        )
        .limit(1);

      if (!connection) {
        return errorResponse("Connection not found", 404);
      }

      accessToken = decrypt(connection.accessTokenEnc);
    }

    const linkToken = await createLinkToken(user.id, accessToken);
    return jsonResponse({ linkToken });
  } catch (error) {
    return handleError(error);
  }
}
