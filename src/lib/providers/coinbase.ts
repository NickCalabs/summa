import { createHmac } from "crypto";

const BASE_URL = "https://api.coinbase.com";
const API_VERSION = "2024-01-01";

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

export function signCoinbaseRequest(input: {
  secret: string;
  timestamp: string;
  method: string;
  path: string;
  body: string;
}): string {
  const message = input.timestamp + input.method.toUpperCase() + input.path + input.body;
  return createHmac("sha256", input.secret).update(message).digest("hex");
}

async function coinbaseFetch(input: {
  apiKey: string;
  apiSecret: string;
  method: "GET";
  path: string;
}): Promise<unknown> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signCoinbaseRequest({
    secret: input.apiSecret,
    timestamp,
    method: input.method,
    path: input.path,
    body: "",
  });

  const res = await fetch(BASE_URL + input.path, {
    method: input.method,
    headers: {
      "CB-ACCESS-KEY": input.apiKey,
      "CB-ACCESS-SIGN": signature,
      "CB-ACCESS-TIMESTAMP": timestamp,
      "CB-VERSION": API_VERSION,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    let errorMessage = `Coinbase ${input.method} ${input.path} failed (${res.status})`;
    let errorCode = "COINBASE_ERROR";
    try {
      const data = (await res.json()) as {
        errors?: Array<{ id?: string; message?: string }>;
      };
      const firstError = data?.errors?.[0];
      if (firstError?.message) errorMessage = firstError.message;
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
  apiKey: string,
  apiSecret: string
): Promise<void> {
  await coinbaseFetch({ apiKey, apiSecret, method: "GET", path: "/v2/user" });
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

export async function getCoinbaseAccounts(
  apiKey: string,
  apiSecret: string
): Promise<CoinbaseAccountInfo[]> {
  const all: CoinbaseAccountInfo[] = [];
  let path: string | null = "/v2/accounts?limit=100";

  while (path) {
    const data = (await coinbaseFetch({
      apiKey,
      apiSecret,
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
