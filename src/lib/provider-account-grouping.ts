export type TargetSheetType = "assets" | "debts";

const LIABILITY_KEYWORDS = [
  "credit",
  "card",
  "visa",
  "mastercard",
  "master card",
  "amex",
  "american express",
  "discover",
  "loan",
  "mortgage",
  "heloc",
  "line of credit",
  "student loan",
  "auto loan",
];

const CRYPTO_KEYWORDS = [
  "wallet",
  "staked",
  "staking",
  "bitcoin",
  "btc",
  "eth",
  "eth2",
  "sol",
  "doge",
  "atom",
  "xtz",
  "avax",
  "ape",
  "stx",
  "fet",
  "ankr",
  "coinbase",
  "crypto",
];

const BROKERAGE_KEYWORDS = [
  "brokerage",
  "roth",
  "ira",
  "401k",
  "403b",
  "hsa",
  "investment",
  "fidelity",
  "schwab",
  "etrade",
  "vanguard",
];

const DEPOSITORY_KEYWORDS = [
  "checking",
  "savings",
  "cash",
  "money market",
  "deposit",
];

function normalizeLabelSource(value: string): string {
  return value.trim().toLowerCase();
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveHostLabel(value: string): string {
  let candidate = value.trim();

  if (candidate.includes("://")) {
    try {
      candidate = new URL(candidate).hostname;
    } catch {
      candidate = value.trim();
    }
  }

  candidate = candidate
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^api\./, "")
    .replace(/^m\./, "")
    .replace(/^online\./, "")
    .replace(/^banking\./, "");

  const parts = candidate.split(".").filter(Boolean);
  if (parts.length >= 2) {
    candidate = parts[parts.length - 2];
  } else if (parts.length === 1) {
    candidate = parts[0];
  }

  return titleCase(candidate.replace(/[-_]+/g, " "));
}

export function getInstitutionSectionName(
  institutionName: string | null | undefined,
  fallback = "Connected Accounts"
): string {
  const trimmed = institutionName?.trim();
  if (!trimmed) return fallback;

  if (trimmed.includes(".") || trimmed.includes("://")) {
    const label = deriveHostLabel(trimmed);
    return label || fallback;
  }

  return trimmed;
}

export function inferSimpleFINInstitutionName(input: {
  institutionName?: string | null;
  connectionName?: string | null;
  orgName?: string | null;
  orgDomain?: string | null;
  orgUrl?: string | null;
  orgSimplefinUrl?: string | null;
}): string | null {
  const direct =
    input.institutionName ??
    input.orgName ??
    input.orgDomain ??
    input.orgUrl ??
    input.orgSimplefinUrl ??
    input.connectionName;

  if (!direct) return null;
  return getInstitutionSectionName(direct, "Connected Accounts");
}

export function inferSimpleFINSheetType(input: {
  accountName: string;
  balance: string | null;
}): TargetSheetType {
  const normalizedName = normalizeLabelSource(input.accountName);
  if (LIABILITY_KEYWORDS.some((keyword) => normalizedName.includes(keyword))) {
    return "debts";
  }

  const balance = input.balance ? Number(input.balance) : 0;
  if (Number.isFinite(balance) && balance < 0) {
    return "debts";
  }

  return "assets";
}

export function inferSimpleFINAssetType(input: {
  accountName: string;
  balance: string | null;
}): string {
  const normalizedName = normalizeLabelSource(input.accountName);

  if (LIABILITY_KEYWORDS.some((keyword) => normalizedName.includes(keyword))) {
    if (
      normalizedName.includes("card") ||
      normalizedName.includes("visa") ||
      normalizedName.includes("amex") ||
      normalizedName.includes("mastercard") ||
      normalizedName.includes("discover")
    ) {
      return "credit_card";
    }
    return "loan";
  }

  if (CRYPTO_KEYWORDS.some((keyword) => normalizedName.includes(keyword))) {
    return "crypto";
  }

  if (BROKERAGE_KEYWORDS.some((keyword) => normalizedName.includes(keyword))) {
    return "investment";
  }

  if (DEPOSITORY_KEYWORDS.some((keyword) => normalizedName.includes(keyword))) {
    return "cash";
  }

  const balance = input.balance ? Number(input.balance) : 0;
  if (Number.isFinite(balance) && balance < 0) {
    return "loan";
  }

  return "other";
}
