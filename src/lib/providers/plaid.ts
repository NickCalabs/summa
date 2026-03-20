import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";

let client: PlaidApi | null = null;

const DEFAULT_PRODUCTS: Products[] = [
  Products.Transactions,
  Products.Investments,
  Products.Liabilities,
];

function getPlaidProducts(): Products[] {
  const env = process.env.PLAID_PRODUCTS;
  if (!env) return DEFAULT_PRODUCTS;
  const parsed = env
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is Products => Object.values(Products).includes(p as Products));
  return parsed.length > 0 ? parsed : DEFAULT_PRODUCTS;
}

export function isPlaidConfigured(): boolean {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function getPlaidClient(): PlaidApi {
  if (client) return client;

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;

  if (!clientId || !secret) {
    throw new Error("Plaid is not configured: PLAID_CLIENT_ID and PLAID_SECRET are required");
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  client = new PlaidApi(configuration);
  return client;
}

export async function createLinkToken(
  userId: string,
  accessToken?: string
): Promise<string> {
  const plaid = getPlaidClient();

  const request: any = {
    user: { client_user_id: userId },
    client_name: "Summa",
    language: "en",
    country_codes: [CountryCode.Us],
  };

  if (accessToken) {
    // Update mode
    request.access_token = accessToken;
  } else {
    request.products = getPlaidProducts();
  }

  const response = await plaid.linkTokenCreate(request);
  return response.data.link_token;
}

export async function exchangePublicToken(
  publicToken: string
): Promise<{ accessToken: string; itemId: string }> {
  const plaid = getPlaidClient();
  const response = await plaid.itemPublicTokenExchange({
    public_token: publicToken,
  });
  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
  };
}

export interface PlaidAccountInfo {
  accountId: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  isoCurrencyCode: string | null;
}

export async function getAccounts(
  accessToken: string
): Promise<PlaidAccountInfo[]> {
  const plaid = getPlaidClient();
  const response = await plaid.accountsBalanceGet({
    access_token: accessToken,
  });

  return response.data.accounts.map((a) => ({
    accountId: a.account_id,
    name: a.name,
    officialName: a.official_name ?? null,
    type: a.type,
    subtype: a.subtype ?? null,
    mask: a.mask ?? null,
    currentBalance: a.balances.current ?? null,
    availableBalance: a.balances.available ?? null,
    isoCurrencyCode: a.balances.iso_currency_code ?? null,
  }));
}

export async function getBalances(
  accessToken: string,
  accountIds?: string[]
): Promise<PlaidAccountInfo[]> {
  const plaid = getPlaidClient();
  const request: any = { access_token: accessToken };
  if (accountIds?.length) {
    request.options = { account_ids: accountIds };
  }
  const response = await plaid.accountsBalanceGet(request);

  return response.data.accounts.map((a) => ({
    accountId: a.account_id,
    name: a.name,
    officialName: a.official_name ?? null,
    type: a.type,
    subtype: a.subtype ?? null,
    mask: a.mask ?? null,
    currentBalance: a.balances.current ?? null,
    availableBalance: a.balances.available ?? null,
    isoCurrencyCode: a.balances.iso_currency_code ?? null,
  }));
}

export async function removeItem(accessToken: string): Promise<void> {
  const plaid = getPlaidClient();
  await plaid.itemRemove({ access_token: accessToken });
}

export function plaidTypeToAssetType(
  type: string,
  subtype: string | null
): string {
  switch (type) {
    case "depository":
      return "cash";
    case "credit":
      return "credit_card";
    case "loan":
      if (subtype === "mortgage") return "real_estate";
      return "loan";
    case "investment":
      return "investment";
    default:
      return "other";
  }
}

export function isDepositoryAccount(type: string): boolean {
  return type === "depository";
}

export function isLiabilityAccount(type: string): boolean {
  return type === "credit" || type === "loan";
}
