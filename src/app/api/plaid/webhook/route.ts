import { db } from "@/lib/db";
import { plaidConnections, plaidAccounts, assets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { getBalances, getPlaidClient } from "@/lib/providers/plaid";

function base64UrlDecode(str: string): Buffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + (4 - (base64.length % 4)) % 4,
    "="
  );
  return Buffer.from(padded, "base64");
}

async function verifyPlaidSignature(
  token: string,
  rawBody: string
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [headerB64, payloadB64, sigB64] = parts;

  let header: { kid?: string };
  let payload: { iat?: number; request_body_sha256?: string };
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return false;
  }

  const { kid } = header;
  if (!kid) return false;

  // Fetch JWK from Plaid for this key ID
  const plaid = getPlaidClient();
  const keyResponse = await plaid.webhookVerificationKeyGet({ key_id: kid });
  const jwk = keyResponse.data.key as unknown as JsonWebKey;

  // Import EC public key
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );

  // Verify JWT signature over "headerB64.payloadB64"
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(sigB64);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    signature,
    signingInput
  );
  if (!valid) return false;

  // Check token freshness — Plaid uses a 5-minute window
  if (payload.iat != null) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - payload.iat > 300) return false;
  }

  // Verify body hash included in the JWT payload
  if (payload.request_body_sha256) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(rawBody)
    );
    const bodyHashHex = Buffer.from(digest).toString("hex");
    if (bodyHashHex !== payload.request_body_sha256) return false;
  }

  return true;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // Signature verification
    const verificationToken = request.headers.get("Plaid-Verification");
    if (!("PLAID_WEBHOOK_SECRET" in process.env)) {
      // Env var not set at all — skip verification (local dev)
      console.warn(
        "[plaid/webhook] PLAID_WEBHOOK_SECRET is not set; skipping signature verification"
      );
    } else if (!verificationToken) {
      console.warn(
        "[plaid/webhook] Missing Plaid-Verification header; rejecting request"
      );
      return new Response("Unauthorized", { status: 401 });
    } else {
      try {
        const valid = await verifyPlaidSignature(verificationToken, rawBody);
        if (!valid) {
          console.warn(
            "[plaid/webhook] Invalid Plaid webhook signature; rejecting request"
          );
          return new Response("Unauthorized", { status: 401 });
        }
      } catch (err) {
        console.error("[plaid/webhook] Signature verification error:", err);
        return new Response("Unauthorized", { status: 401 });
      }
    }

    let body: {
      webhook_type?: string;
      webhook_code?: string;
      item_id?: string;
      error?: Record<string, string>;
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("OK", { status: 200 });
    }

    const { webhook_type, webhook_code, item_id } = body;

    if (!item_id) {
      return new Response("OK", { status: 200 });
    }

    const [connection] = await db
      .select()
      .from(plaidConnections)
      .where(eq(plaidConnections.itemId, item_id))
      .limit(1);

    if (!connection) {
      return new Response("OK", { status: 200 });
    }

    if (webhook_type === "ITEM" && webhook_code === "ERROR") {
      const errorInfo = body.error ?? {};
      const errorExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db
        .update(plaidConnections)
        .set({
          errorCode: errorInfo.error_code ?? "UNKNOWN",
          errorMessage: errorInfo.error_message ?? "An error occurred",
          errorExpiresAt,
          errorRetryCount: 1,
          updatedAt: new Date(),
        })
        .where(eq(plaidConnections.id, connection.id));
      return new Response("OK", { status: 200 });
    }

    if (webhook_type === "ITEM" && webhook_code === "PENDING_EXPIRATION") {
      await db
        .update(plaidConnections)
        .set({
          errorCode: "PENDING_EXPIRATION",
          errorMessage: "Connection will expire soon. Please re-authenticate.",
          errorExpiresAt: null,
          errorRetryCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(plaidConnections.id, connection.id));
      return new Response("OK", { status: 200 });
    }

    // DEFAULT_UPDATE — refresh balances
    if (
      webhook_code === "DEFAULT_UPDATE" ||
      webhook_code === "INITIAL_UPDATE" ||
      webhook_code === "HISTORICAL_UPDATE"
    ) {
      try {
        const accessToken = decrypt(connection.accessTokenEnc);
        const balances = await getBalances(accessToken);

        for (const balance of balances) {
          await db
            .update(plaidAccounts)
            .set({
              currentBalance: balance.currentBalance?.toFixed(2) ?? null,
              availableBalance: balance.availableBalance?.toFixed(2) ?? null,
              updatedAt: new Date(),
            })
            .where(eq(plaidAccounts.plaidAccountId, balance.accountId));

          const [account] = await db
            .select()
            .from(plaidAccounts)
            .where(eq(plaidAccounts.plaidAccountId, balance.accountId))
            .limit(1);

          if (account?.assetId && balance.currentBalance != null) {
            await db
              .update(assets)
              .set({
                currentValue: Math.abs(balance.currentBalance).toFixed(2),
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(assets.id, account.assetId));
          }
        }

        await db
          .update(plaidConnections)
          .set({
            lastSyncedAt: new Date(),
            errorCode: null,
            errorMessage: null,
            errorExpiresAt: null,
            errorRetryCount: 0,
            updatedAt: new Date(),
          })
          .where(eq(plaidConnections.id, connection.id));
      } catch (error) {
        console.error(
          `[plaid-webhook] Balance refresh failed for connection ${connection.id}:`,
          error
        );
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[plaid-webhook] Unhandled webhook error:", error);
    return new Response("OK", { status: 200 });
  }
}
