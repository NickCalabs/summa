import type { RecapPeriod, RecapGroupRow, RecapChange } from "./recap-types";

// ── Tolerance bounds (days) per period ──

const TOLERANCE_DAYS: Record<RecapPeriod, number> = {
  today: 0,
  daily: 3,
  weekly: 3,
  monthly: 15,
  quarterly: 45,
  yearly: 45,
};

export function getToleranceDays(period: RecapPeriod): number {
  return TOLERANCE_DAYS[period];
}

// ── Target date generation ──

export function computeTargetDates(
  period: RecapPeriod,
  from?: string,
  to?: string
): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (period === "today") {
    return [formatDate(today)];
  }

  const endDate = to ? new Date(to + "T00:00:00") : new Date(today);
  endDate.setHours(0, 0, 0, 0);

  const defaults: Record<string, number> = {
    daily: 14,
    weekly: 8,
    monthly: 6,
    quarterly: 5,
    yearly: 5,
  };
  const columnCount = defaults[period] ?? 6;

  let startDate: Date;
  if (from) {
    startDate = new Date(from + "T00:00:00");
    startDate.setHours(0, 0, 0, 0);
  } else {
    startDate = subtractPeriods(endDate, period, columnCount - 1);
  }

  const dates: string[] = [];
  const cursor = new Date(endDate);

  while (cursor >= startDate && dates.length < 52) {
    dates.push(formatDate(cursor));
    subtractOnePeriod(cursor, period);
  }

  return dates;
}

function subtractPeriods(
  date: Date,
  period: RecapPeriod,
  count: number
): Date {
  const d = new Date(date);
  for (let i = 0; i < count; i++) {
    subtractOnePeriod(d, period);
  }
  return d;
}

function subtractOnePeriod(d: Date, period: RecapPeriod): void {
  switch (period) {
    case "daily":
      d.setDate(d.getDate() - 1);
      break;
    case "weekly":
      d.setDate(d.getDate() - 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() - 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() - 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() - 1);
      break;
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Aggregation key ──

export interface AggregationKeyInput {
  id: string;
  name: string;
  type: string;
  currency: string;
  providerType: string;
  providerConfig: Record<string, unknown> | null;
  parentAssetId: string | null;
}

// Map CoinGecko IDs to canonical symbols so all sources of the same coin merge.
const COINGECKO_TO_SYMBOL: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  litecoin: "LTC",
  cardano: "ADA",
  polkadot: "DOT",
  ripple: "XRP",
  dogecoin: "DOGE",
  "usd-coin": "USDC",
  tether: "USDT",
  "matic-network": "MATIC",
  chainlink: "LINK",
  avalanche: "AVAX",
  uniswap: "UNI",
  aave: "AAVE",
};

// Normalize various ticker formats to a canonical crypto symbol.
// Returns null if we can't confidently identify a crypto symbol.
function normalizeCryptoSymbol(
  ticker: string | undefined,
  source: string | undefined,
  fallbackCurrency: string | undefined
): string | null {
  if (!ticker && !fallbackCurrency) return null;

  if (ticker) {
    if (source === "coingecko") {
      const mapped = COINGECKO_TO_SYMBOL[ticker.toLowerCase()];
      if (mapped) return mapped;
      // Unknown CoinGecko ID — fall back to uppercase of the ID itself.
      return ticker.toUpperCase();
    }
    if (source === "coinbase") {
      // "BTC-USD" → "BTC"
      return ticker.split("-")[0]?.toUpperCase() ?? null;
    }
    // Generic: strip any -USD/-USDT suffix.
    return ticker.replace(/-USD[TC]?$/i, "").toUpperCase();
  }

  return fallbackCurrency?.toUpperCase() ?? null;
}

export function getRecapAggregationKey(
  asset: AggregationKeyInput
): string | null {
  const config = asset.providerConfig ?? {};

  if (config.isGroupParent) return null;

  // Crypto: unify by canonical symbol regardless of price source.
  if (asset.type === "crypto") {
    const ticker = config.ticker as string | undefined;
    const source = config.source as string | undefined;
    const native = (config.nativeCurrency as string | undefined) ?? undefined;
    const chain = (config.chain as string | undefined)?.toUpperCase();
    const symbol =
      normalizeCryptoSymbol(ticker, source, native ?? chain) ??
      asset.currency?.toUpperCase();
    if (symbol && symbol !== "USD") {
      return `coin:${symbol}`;
    }
    // Crypto with no usable symbol info — keep as unique asset.
    return `asset:${asset.id}`;
  }

  // Equities/ETFs/funds: aggregate by ticker symbol across brokerages.
  if (config.ticker) {
    const symbol = (config.ticker as string).split("-")[0]?.toUpperCase();
    if (symbol) return `equity:${symbol}`;
  }

  return `asset:${asset.id}`;
}

export function getAggregationLabel(
  key: string,
  firstAssetName: string
): string {
  if (key.startsWith("coin:")) {
    return key.split(":")[1] ?? firstAssetName;
  }
  if (key.startsWith("equity:")) {
    return key.split(":")[1] ?? firstAssetName;
  }
  return firstAssetName;
}

// ── Asset class labels ──

const CLASS_LABELS: Record<string, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  stock: "Stocks",
  etf: "ETFs",
  fund: "Funds",
  investment: "Investments",
  brokerage: "Brokerage",
  crypto: "Crypto",
  real_estate: "Real Estate",
  property: "Property",
  house: "Homes",
  land: "Land",
  vehicle: "Vehicles",
  collectible: "Collectibles",
  precious_metals: "Precious Metals",
  credit_card: "Credit Cards",
  loan: "Loans",
  other: "Other",
};

export function getClassLabel(type: string): string {
  return CLASS_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

// ── Change computation ──

export function computeChanges(
  columns: string[],
  values: Record<string, number | null>
): Record<string, RecapChange | null> {
  const changes: Record<string, RecapChange | null> = {};

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const nextCol = columns[i + 1];
    const current = values[col];
    const previous = nextCol != null ? values[nextCol] : null;

    if (current != null && previous != null && previous !== 0) {
      changes[col] = {
        absolute: Number((current - previous).toFixed(2)),
        percent: Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2)),
      };
    } else {
      changes[col] = null;
    }
  }

  return changes;
}

// ── Allocation conversion ──

export function convertToAllocation(
  groups: RecapGroupRow[],
  columns: string[],
  totals: Record<string, number>
): RecapGroupRow[] {
  return groups.map((group) => {
    const allocValues: Record<string, number | null> = {};
    for (const col of columns) {
      const val = group.values[col];
      const total = totals[col];
      if (val != null && total && total !== 0) {
        allocValues[col] = Number(((val / total) * 100).toFixed(2));
      } else {
        allocValues[col] = null;
      }
    }
    return {
      ...group,
      values: allocValues,
      changes: computeChanges(columns, allocValues),
    };
  });
}

// ── Snapshot result aggregation ──

export interface SnapshotRow {
  assetId: string;
  targetDate: string;
  valueInBase: string | null;
}

export interface AssetMeta {
  id: string;
  name: string;
  type: string;
  ownershipPct: number;
  isCashEquivalent: boolean;
  isInvestable: boolean;
  isDebt: boolean;
  taxStatus: string | null;
  providerType: string;
  providerConfig: Record<string, unknown> | null;
  sheetId: string;
  sheetName: string;
  sectionId: string;
  sectionName: string;
  aggregationKey: string;
  currentValue: number;
}

export interface RecapGroup {
  key: string;
  label: string;
  assetType: string;
  assetIds: string[];
  isDebt: boolean;
  parentKey: string | null;
}

export function aggregateSnapshots(
  snapshots: SnapshotRow[],
  assetMap: Map<string, AssetMeta>,
  groups: RecapGroup[],
  columns: string[]
): { groupValues: Map<string, Record<string, number | null>>; totals: Record<string, number> } {
  const assetValues = new Map<string, Map<string, number>>();

  for (const snap of snapshots) {
    if (snap.valueInBase == null) continue;
    const meta = assetMap.get(snap.assetId);
    if (!meta) continue;

    const ownership = meta.ownershipPct / 100;
    const val = Number(snap.valueInBase) * ownership;

    if (!assetValues.has(snap.assetId)) {
      assetValues.set(snap.assetId, new Map());
    }
    assetValues.get(snap.assetId)!.set(snap.targetDate, val);
  }

  const groupValues = new Map<string, Record<string, number | null>>();

  for (const group of groups) {
    const vals: Record<string, number | null> = {};

    for (const col of columns) {
      let sum: number | null = null;

      for (const assetId of group.assetIds) {
        const dateMap = assetValues.get(assetId);
        const v = dateMap?.get(col);
        if (v != null) {
          sum = (sum ?? 0) + v;
        }
      }

      vals[col] = sum != null ? Number(sum.toFixed(2)) : null;
    }

    groupValues.set(group.key, vals);
  }

  // Only count TOP-LEVEL groups (parentKey === null) to avoid double-counting
  // parent + child rows. Net total = sum(assets) - sum(debts).
  const totals: Record<string, number> = {};
  for (const col of columns) {
    let net = 0;
    let hasAny = false;
    for (const group of groups) {
      if (group.parentKey !== null) continue;
      const v = groupValues.get(group.key)?.[col];
      if (v != null) {
        hasAny = true;
        net += group.isDebt ? -v : v;
      }
    }
    if (hasAny) totals[col] = Number(net.toFixed(2));
  }

  return { groupValues, totals };
}

export function buildGroupRows(
  groups: RecapGroup[],
  groupValues: Map<string, Record<string, number | null>>,
  columns: string[]
): RecapGroupRow[] {
  return groups.map((group) => {
    const values = groupValues.get(group.key) ?? {};
    return {
      key: group.key,
      label: group.label,
      assetType: group.assetType,
      assetIds: group.assetIds,
      expandable: false,
      parentKey: group.parentKey,
      values,
      changes: computeChanges(columns, values),
    };
  });
}
