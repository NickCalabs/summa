import { randomBytes } from "crypto";
import { importPKCS8, importJWK, SignJWT } from "jose";

type SigningKey = Awaited<ReturnType<typeof importJWK>>;

const API_HOST = "api.coinbase.com";
const BASE_URL = `https://${API_HOST}`;

export class CoinbaseProviderError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "COINBASE_ERROR") {
    super(message);
    this.name = "CoinbaseProviderError";
    this.status = status;
    this.code = code;
  }
}

export interface CoinbaseAccountInfo {
  accountId: string;
  name: string;
  currency: string;
  balance: string;
  nativeBalance: string | null;
  nativeCurrency: string | null;
  type: string;
}

// Coinbase's JSON key download escapes newlines as literal "\n" and often
// wraps the whole blob in quotes. Unescape + strip before loading.
function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, "\n");
  return key;
}

async function loadPrivateKey(pem: string): Promise<SigningKey> {
  const normalized = normalizePrivateKey(pem);

  // CDP retail keys are issued as EC (P-256) in SEC1 format:
  //   -----BEGIN EC PRIVATE KEY-----
  // jose's importPKCS8 only handles PKCS#8 ("BEGIN PRIVATE KEY"), so for
  // SEC1 we convert via a lightweight parser into a JWK.
  if (normalized.includes("BEGIN EC PRIVATE KEY")) {
    const jwk = sec1PemToJwk(normalized);
    return await importJWK(jwk, "ES256");
  }

  if (normalized.includes("BEGIN PRIVATE KEY")) {
    return await importPKCS8(normalized, "ES256");
  }

  throw new CoinbaseProviderError(
    "Unrecognized private key format — expected an EC/PKCS#8 PEM block",
    400,
    "INVALID_KEY_FORMAT"
  );
}

// Decode SEC1 EC PRIVATE KEY PEM → JWK (P-256 / ES256 only).
// RFC 5915 ECPrivateKey ::= SEQUENCE {
//   version INTEGER,
//   privateKey OCTET STRING,         -- 32 bytes for P-256
//   parameters [0] ECParameters OPTIONAL,
//   publicKey  [1] BIT STRING OPTIONAL   -- uncompressed: 0x04 || X || Y
// }
// Rather than a full ASN.1 parser, locate the 32-byte privateKey OCTET STRING
// (tag 0x04, length 0x20) and the 66-byte publicKey BIT STRING
// (tag 0x03, length 0x42, unused-bits 0x00, uncompressed marker 0x04, X, Y).
export function sec1PemToJwk(pem: string): {
  kty: "EC";
  crv: "P-256";
  d: string;
  x: string;
  y: string;
} {
  const base64 = pem
    .replace(/-----BEGIN EC PRIVATE KEY-----/g, "")
    .replace(/-----END EC PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Buffer.from(base64, "base64");

  let privKey: Buffer | null = null;
  let pubKey: Buffer | null = null;

  for (let i = 0; i < der.length - 34; i++) {
    if (!privKey && der[i] === 0x04 && der[i + 1] === 0x20) {
      privKey = der.subarray(i + 2, i + 2 + 32);
      i += 33;
      continue;
    }
    if (
      !pubKey &&
      der[i] === 0x03 &&
      der[i + 1] === 0x42 &&
      der[i + 2] === 0x00 &&
      der[i + 3] === 0x04
    ) {
      pubKey = der.subarray(i + 4, i + 4 + 64);
      i += 67;
      continue;
    }
    if (privKey && pubKey) break;
  }

  if (!privKey || !pubKey) {
    throw new CoinbaseProviderError(
      "Could not parse EC private key — expected P-256 SEC1 PEM",
      400,
      "INVALID_KEY_PARSE"
    );
  }

  return {
    kty: "EC",
    crv: "P-256",
    d: privKey.toString("base64url"),
    x: pubKey.subarray(0, 32).toString("base64url"),
    y: pubKey.subarray(32, 64).toString("base64url"),
  };
}

export async function buildCoinbaseJwt(input: {
  keyName: string;
  privateKeyPem: string;
  method: string;
  path: string;
}): Promise<string> {
  const key = await loadPrivateKey(input.privateKeyPem);
  const nonce = randomBytes(16).toString("hex");
  const uri = `${input.method.toUpperCase()} ${API_HOST}${input.path}`;

  return await new SignJWT({ uri })
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: input.keyName, nonce })
    .setIssuer("cdp")
    .setSubject(input.keyName)
    .setNotBefore("0s")
    .setExpirationTime("2m")
    .sign(key);
}

async function coinbaseFetch(input: {
  keyName: string;
  privateKeyPem: string;
  method: "GET";
  path: string;
}): Promise<unknown> {
  // Coinbase signs the path only, not the query component.
  const pathOnly = input.path.split("?")[0];

  const jwt = await buildCoinbaseJwt({
    keyName: input.keyName,
    privateKeyPem: input.privateKeyPem,
    method: input.method,
    path: pathOnly,
  });

  const res = await fetch(BASE_URL + input.path, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    let errorMessage = `Coinbase ${input.method} ${input.path} failed (${res.status})`;
    let errorCode = "COINBASE_ERROR";
    try {
      const data = (await res.json()) as {
        errors?: Array<{ id?: string; message?: string }>;
        error?: string;
        message?: string;
      };
      const firstError = data?.errors?.[0];
      if (firstError?.message) errorMessage = firstError.message;
      else if (data?.message) errorMessage = data.message;
      else if (data?.error) errorMessage = data.error;
      if (firstError?.id) errorCode = firstError.id;
    } catch {
      // Non-JSON error body — fall back to generic message.
    }

    if (res.status === 401) {
      throw new CoinbaseProviderError(
        "Invalid Coinbase API credentials",
        401,
        "UNAUTHORIZED"
      );
    }
    throw new CoinbaseProviderError(errorMessage, res.status, errorCode);
  }

  return res.json();
}

export async function verifyCoinbaseCredentials(
  keyName: string,
  privateKeyPem: string
): Promise<void> {
  await coinbaseFetch({
    keyName,
    privateKeyPem,
    method: "GET",
    path: "/v2/user",
  });
}

interface CoinbaseAccountRaw {
  id?: string;
  name?: string;
  type?: string;
  balance?: { amount?: string | number; currency?: string };
  native_balance?: { amount?: string | number; currency?: string };
  currency?: { code?: string; name?: string };
}

interface CoinbaseAccountsResponse {
  data?: CoinbaseAccountRaw[];
  pagination?: { next_uri?: string | null };
}

// Coinbase's /v2/prices/<currency>-USD/spot endpoint is public (no auth
// required) and returns an authoritative spot price for every coin
// Coinbase lists — including altcoins Yahoo Finance doesn't index. The
// CDP-authenticated /v2/accounts endpoint dropped native_balance from its
// response, so we price Coinbase holdings ourselves rather than relying
// on Yahoo to reconstruct values.
//
// Returns a map of currency code → USD spot price. Entries where the
// price lookup fails are omitted; callers should treat a missing entry
// as "unknown price".
export async function getCoinbaseSpotPrices(
  currencies: string[]
): Promise<Map<string, number>> {
  const unique = [...new Set(currencies.map((c) => c.toUpperCase()))].filter(
    (c) => c && c !== "USD"
  );
  const out = new Map<string, number>();

  const results = await Promise.all(
    unique.map(async (currency) => {
      try {
        const res = await fetch(
          `${BASE_URL}/v2/prices/${encodeURIComponent(currency)}-USD/spot`
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {
          data?: { amount?: string | number };
        };
        const amount = data?.data?.amount;
        const price = amount != null ? Number(amount) : NaN;
        if (!Number.isFinite(price) || price <= 0) return null;
        return [currency, price] as const;
      } catch {
        return null;
      }
    })
  );

  for (const entry of results) {
    if (entry) out.set(entry[0], entry[1]);
  }
  return out;
}

export async function getCoinbaseAccounts(
  keyName: string,
  privateKeyPem: string
): Promise<CoinbaseAccountInfo[]> {
  const all: CoinbaseAccountInfo[] = [];
  let path: string | null = "/v2/accounts?limit=100";

  while (path) {
    const data = (await coinbaseFetch({
      keyName,
      privateKeyPem,
      method: "GET",
      path,
    })) as CoinbaseAccountsResponse;

    for (const raw of data?.data ?? []) {
      const balance = raw?.balance ?? {};
      const native = raw?.native_balance ?? null;
      all.push({
        accountId: String(raw?.id ?? ""),
        name: String(raw?.name ?? raw?.currency?.name ?? "Unknown"),
        currency: String(balance?.currency ?? raw?.currency?.code ?? ""),
        balance: String(balance?.amount ?? "0"),
        nativeBalance: native?.amount != null ? String(native.amount) : null,
        nativeCurrency: native?.currency != null ? String(native.currency) : null,
        type: String(raw?.type ?? "wallet"),
      });
    }

    const next = data?.pagination?.next_uri ?? null;
    path = next && typeof next === "string" ? next : null;
  }

  return all;
}
