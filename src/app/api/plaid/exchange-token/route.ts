import { db } from "@/lib/db";
import { plaidConnections, plaidAccounts } from "@/lib/db/schema";
import { jsonResponse, errorResponse, handleError, requireAuth } from "@/lib/api-helpers";
import { parseBody, plaidExchangeToken } from "@/types";
import { isPlaidConfigured, exchangePublicToken, getAccounts } from "@/lib/providers/plaid";
import { encrypt } from "@/lib/encryption";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    if (!isPlaidConfigured()) {
      return errorResponse("Plaid is not configured", 400);
    }

    const body = await parseBody(request, plaidExchangeToken);
    const { accessToken, itemId } = await exchangePublicToken(body.publicToken);

    // Encrypt and store the access token
    const accessTokenEnc = encrypt(accessToken);

    const [connection] = await db
      .insert(plaidConnections)
      .values({
        userId: user.id,
        institutionId: body.institutionId,
        institutionName: body.institutionName,
        accessTokenEnc,
        itemId,
      })
      .returning();

    // Fetch and store accounts
    const accounts = await getAccounts(accessToken);
    const accountRows = await db
      .insert(plaidAccounts)
      .values(
        accounts.map((a) => ({
          connectionId: connection.id,
          plaidAccountId: a.accountId,
          name: a.name,
          officialName: a.officialName,
          type: a.type,
          subtype: a.subtype,
          mask: a.mask,
          currentBalance: a.currentBalance?.toFixed(2) ?? null,
          availableBalance: a.availableBalance?.toFixed(2) ?? null,
          isoCurrencyCode: a.isoCurrencyCode ?? "USD",
        }))
      )
      .returning();

    return jsonResponse({
      connection: {
        id: connection.id,
        institutionName: connection.institutionName,
        itemId: connection.itemId,
      },
      accounts: accountRows,
    });
  } catch (error) {
    return handleError(error);
  }
}
