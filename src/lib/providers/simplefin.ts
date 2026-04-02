const SIMPLEFIN_API_VERSION = "2";

export class SimpleFINProviderError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "SIMPLEFIN_ERROR") {
    super(message);
    this.name = "SimpleFINProviderError";
    this.status = status;
    this.code = code;
  }
}

interface SimpleFINConnectionPayload {
  id?: string;
  name?: string;
  domain?: string;
  url?: string;
  "sfin-url"?: string;
}

interface SimpleFINOrgPayload {
  name?: string;
  domain?: string;
  url?: string;
  "sfin-url"?: string;
}

interface SimpleFINAccountPayload {
  id?: string;
  conn_id?: string;
  name?: string;
  currency?: string;
  balance?: string;
  "available-balance"?: string;
  "balance-date"?: number;
  org?: SimpleFINOrgPayload;
}

interface SimpleFINAccountSetPayload {
  accounts?: SimpleFINAccountPayload[];
  errors?: unknown[];
  errlist?: unknown[];
  connections?: SimpleFINConnectionPayload[];
}

export interface SimpleFINAccountInfo {
  accountId: string;
  connectionId: string | null;
  connectionName: string | null;
  institutionName: string | null;
  accountName: string;
  currency: string;
  balance: string | null;
  availableBalance: string | null;
  balanceDate: Date | null;
}

export interface SimpleFINAccountsResult {
  accounts: SimpleFINAccountInfo[];
  messages: string[];
}

function ensureHttpsUrl(rawUrl: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SimpleFINProviderError(`Invalid ${label}`, 400, "INVALID_URL");
  }

  if (parsed.protocol !== "https:") {
    throw new SimpleFINProviderError(
      `${label} must use HTTPS`,
      400,
      "INVALID_PROTOCOL"
    );
  }

  return parsed;
}

function buildBasicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function stripAuth(url: URL): URL {
  const next = new URL(url.toString());
  next.username = "";
  next.password = "";
  next.search = "";
  next.hash = "";
  if (next.pathname.endsWith("/") && next.pathname !== "/") {
    next.pathname = next.pathname.slice(0, -1);
  }
  return next;
}

function describeConnection(payload: SimpleFINConnectionPayload | undefined): string | null {
  if (!payload) return null;
  return payload.name ?? payload.domain ?? payload.url ?? payload["sfin-url"] ?? payload.id ?? null;
}

function describeOrg(payload: SimpleFINOrgPayload | undefined): string | null {
  if (!payload) return null;
  return payload.name ?? payload.domain ?? payload.url ?? payload["sfin-url"] ?? null;
}

function normalizeCurrency(value: string | undefined): string {
  const trimmed = value?.trim().toUpperCase();
  if (trimmed && /^[A-Z]{3}$/.test(trimmed)) {
    return trimmed;
  }
  return "USD";
}

function normalizeDecimalString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(2);
}

function extractMessages(payload: SimpleFINAccountSetPayload): string[] {
  const messages: string[] = [];

  for (const entry of payload.errors ?? []) {
    if (typeof entry === "string" && entry.trim()) {
      messages.push(entry.trim());
    }
  }

  for (const entry of payload.errlist ?? []) {
    if (typeof entry === "string" && entry.trim()) {
      messages.push(entry.trim());
      continue;
    }

    if (!entry || typeof entry !== "object") continue;

    const candidate = entry as Record<string, unknown>;
    const message =
      typeof candidate.message === "string"
        ? candidate.message
        : typeof candidate.title === "string"
          ? candidate.title
          : typeof candidate.detail === "string"
            ? candidate.detail
            : typeof candidate.code === "string"
              ? candidate.code
              : null;

    if (message?.trim()) {
      messages.push(message.trim());
    }
  }

  return [...new Set(messages)];
}

function normalizeAccountSet(
  payload: SimpleFINAccountSetPayload
): SimpleFINAccountsResult {
  const connectionsById = new Map<string, SimpleFINConnectionPayload>();

  for (const connection of payload.connections ?? []) {
    if (connection.id) {
      connectionsById.set(connection.id, connection);
    }
  }

  const accounts = (payload.accounts ?? [])
    .filter((account): account is SimpleFINAccountPayload & { id: string; name: string } =>
      !!account?.id && !!account?.name
    )
    .map((account) => ({
      accountId: account.id,
      connectionId: account.conn_id ?? null,
      connectionName: describeConnection(
        account.conn_id ? connectionsById.get(account.conn_id) : undefined
      ),
      institutionName:
        describeOrg(account.org) ??
        describeConnection(
          account.conn_id ? connectionsById.get(account.conn_id) : undefined
        ),
      accountName: account.name,
      currency: normalizeCurrency(account.currency),
      balance: normalizeDecimalString(account.balance),
      availableBalance: normalizeDecimalString(account["available-balance"]),
      balanceDate:
        typeof account["balance-date"] === "number" &&
        Number.isFinite(account["balance-date"])
          ? new Date(account["balance-date"] * 1000)
          : null,
    }));

  return {
    accounts,
    messages: extractMessages(payload),
  };
}

function parseJsonResponse(text: string): SimpleFINAccountSetPayload {
  try {
    return JSON.parse(text) as SimpleFINAccountSetPayload;
  } catch {
    throw new SimpleFINProviderError(
      "SimpleFIN returned invalid JSON",
      502,
      "INVALID_RESPONSE"
    );
  }
}

function getFetchErrorMessage(status: number): { message: string; code: string } {
  switch (status) {
    case 402:
      return {
        message: "SimpleFIN access requires payment or an active Bridge subscription",
        code: "PAYMENT_REQUIRED",
      };
    case 403:
      return {
        message: "SimpleFIN access was rejected. Reconnect with a fresh setup token or access URL.",
        code: "AUTH_FAILED",
      };
    default:
      return {
        message: "SimpleFIN request failed",
        code: "REQUEST_FAILED",
      };
  }
}

export function decodeSimpleFINToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new SimpleFINProviderError(
      "SimpleFIN token is required",
      400,
      "MISSING_TOKEN"
    );
  }

  let decoded = "";
  try {
    decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
  } catch {
    throw new SimpleFINProviderError(
      "SimpleFIN token is not valid Base64",
      400,
      "INVALID_TOKEN"
    );
  }

  if (!decoded) {
    throw new SimpleFINProviderError(
      "SimpleFIN token is not valid Base64",
      400,
      "INVALID_TOKEN"
    );
  }

  return ensureHttpsUrl(decoded, "SimpleFIN claim URL").toString();
}

export function normalizeSimpleFINAccessUrl(accessUrl: string): string {
  const parsed = ensureHttpsUrl(accessUrl.trim(), "SimpleFIN access URL");

  if (!parsed.username || !parsed.password) {
    throw new SimpleFINProviderError(
      "SimpleFIN access URL must include credentials",
      400,
      "MISSING_CREDENTIALS"
    );
  }

  return parsed.toString();
}

export function getSimpleFINServerUrl(accessUrl: string): string {
  const parsed = new URL(normalizeSimpleFINAccessUrl(accessUrl));
  return stripAuth(parsed).toString();
}

export async function claimSimpleFINAccessUrl(setupToken: string): Promise<string> {
  const claimUrl = decodeSimpleFINToken(setupToken);
  const response = await fetch(claimUrl, {
    method: "POST",
    headers: { "Content-Length": "0" },
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    const { message, code } = getFetchErrorMessage(response.status);
    throw new SimpleFINProviderError(message, response.status, code);
  }

  const accessUrl = (await response.text()).trim();
  return normalizeSimpleFINAccessUrl(accessUrl);
}

export async function getSimpleFINAccounts(
  accessUrl: string,
  options?: { balancesOnly?: boolean }
): Promise<SimpleFINAccountsResult> {
  const parsed = new URL(normalizeSimpleFINAccessUrl(accessUrl));
  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const requestUrl = stripAuth(parsed);

  requestUrl.pathname = `${requestUrl.pathname.replace(/\/$/, "")}/accounts`;
  requestUrl.searchParams.set("version", SIMPLEFIN_API_VERSION);
  if (options?.balancesOnly) {
    requestUrl.searchParams.set("balances-only", "1");
  }

  const response = await fetch(requestUrl, {
    method: "GET",
    headers: {
      Authorization: buildBasicAuthHeader(username, password),
      Accept: "application/json",
    },
    cache: "no-store",
    redirect: "follow",
  });

  const text = await response.text();
  if (!response.ok) {
    const { message, code } = getFetchErrorMessage(response.status);
    throw new SimpleFINProviderError(message, response.status, code);
  }

  return normalizeAccountSet(parseJsonResponse(text));
}
