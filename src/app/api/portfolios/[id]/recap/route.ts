import { db } from "@/lib/db";
import {
  portfolios,
  sheets,
  sections,
  assets,
  assetSnapshots,
  portfolioSnapshots,
} from "@/lib/db/schema";
import { eq, inArray, asc, and, sql } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
  validateUuid,
} from "@/lib/api-helpers";
import { isLiabilityAsset } from "@/lib/portfolio-utils";
import { convertToBase } from "@/lib/currency";
import { getExchangeRates } from "@/lib/providers/exchange-rates";
import { getCurrentBtcUsd } from "@/lib/providers/btc-price";
import type {
  RecapReportType,
  RecapPeriod,
  RecapMode,
  RecapResponse,
  RecapGroupRow,
} from "@/lib/recap-types";
import {
  computeTargetDates,
  getToleranceDays,
  getRecapAggregationKey,
  getAggregationLabel,
  getClassLabel,
  computeChanges,
  convertToAllocation,
  aggregateSnapshots,
  buildGroupRows,
  type AssetMeta,
  type RecapGroup,
  type SnapshotRow,
} from "@/lib/recap-utils";

const VALID_REPORTS = new Set<RecapReportType>([
  "net_worth",
  "sheets_sections",
  "assets_by_class",
  "investable",
  "cash_on_hand",
  "crypto",
  "brokerages",
  "assets_by_tax",
]);

const VALID_PERIODS = new Set<RecapPeriod>([
  "today",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    const portfolio = await requirePortfolioOwnership(id, user.id);

    const url = new URL(request.url);
    const report = url.searchParams.get("report") as RecapReportType;
    const period = (url.searchParams.get("period") ?? "monthly") as RecapPeriod;
    const mode = (url.searchParams.get("mode") ?? "totals") as RecapMode;
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;

    if (!report || !VALID_REPORTS.has(report)) {
      return jsonResponse({ error: "Invalid report type" }, 400);
    }
    if (!VALID_PERIODS.has(period)) {
      return jsonResponse({ error: "Invalid period" }, 400);
    }

    const columns = computeTargetDates(period, from, to);

    return await handleAssetReport(
      id,
      portfolio,
      report,
      columns,
      period,
      mode
    );
  } catch (error) {
    return handleError(error);
  }
}

// ── Net Worth report (uses portfolioSnapshots) ──

async function handleNetWorth(
  portfolioId: string,
  currency: string,
  columns: string[],
  period: RecapPeriod,
  mode: RecapMode
): Promise<Response> {
  const tolerance = getToleranceDays(period);

  let snapRows: { targetDate: string; totalAssets: string; totalDebts: string; netWorth: string }[];

  if (period === "today") {
    const [latest] = await db
      .select()
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.portfolioId, portfolioId))
      .orderBy(sql`${portfolioSnapshots.date} DESC`)
      .limit(1);

    if (latest) {
      snapRows = [{
        targetDate: columns[0],
        totalAssets: latest.totalAssets,
        totalDebts: latest.totalDebts,
        netWorth: latest.netWorth,
      }];
    } else {
      snapRows = [];
    }
  } else {
    const dateValues = sql.join(
      columns.map((c) => sql`(${c}::date)`),
      sql`, `
    );
    const result = await db.execute(sql`
      SELECT DISTINCT ON (t.target_date)
        t.target_date::text AS "targetDate",
        ps.total_assets AS "totalAssets",
        ps.total_debts AS "totalDebts",
        ps.net_worth AS "netWorth"
      FROM (VALUES ${dateValues}) AS t(target_date)
      LEFT JOIN portfolio_snapshots ps
        ON ps.portfolio_id = ${portfolioId}
        AND ps.date <= t.target_date
        AND ps.date >= t.target_date - ${tolerance}::int * interval '1 day'
      ORDER BY t.target_date, ps.date DESC
    `);

    snapRows = (result as unknown as typeof snapRows);
  }

  const assetsValues: Record<string, number | null> = {};
  const debtsValues: Record<string, number | null> = {};
  const nwValues: Record<string, number | null> = {};
  const totals: Record<string, number> = {};

  for (const row of snapRows) {
    const col = typeof row.targetDate === "string"
      ? row.targetDate
      : new Date(row.targetDate as unknown as string).toISOString().slice(0, 10);

    if (row.totalAssets != null) {
      const a = Number(row.totalAssets);
      const d = Number(row.totalDebts);
      const n = Number(row.netWorth);
      assetsValues[col] = a;
      debtsValues[col] = d;
      nwValues[col] = n;
      totals[col] = n;
    } else {
      assetsValues[col] = null;
      debtsValues[col] = null;
      nwValues[col] = null;
    }
  }

  let groups: RecapGroupRow[] = [
    {
      key: "assets",
      label: "Total Assets",
      assetType: "aggregate",
      assetIds: [],
      expandable: false,
      parentKey: null,
      values: assetsValues,
      changes: computeChanges(columns, assetsValues),
    },
    {
      key: "debts",
      label: "Total Debts",
      assetType: "aggregate",
      assetIds: [],
      expandable: false,
      parentKey: null,
      values: debtsValues,
      changes: computeChanges(columns, debtsValues),
    },
    {
      key: "net_worth",
      label: "Net Worth",
      assetType: "aggregate",
      assetIds: [],
      expandable: false,
      parentKey: null,
      values: nwValues,
      changes: computeChanges(columns, nwValues),
    },
  ];

  if (mode === "allocation") {
    groups = convertToAllocation(groups, columns, totals);
  }

  const response: RecapResponse = {
    report: "net_worth",
    period,
    mode,
    currency,
    columns,
    groups,
    totals,
  };

  return jsonResponse(response);
}

// ── Asset-based reports ──

async function handleAssetReport(
  portfolioId: string,
  portfolio: { currency: string },
  report: RecapReportType,
  columns: string[],
  period: RecapPeriod,
  mode: RecapMode
): Promise<Response> {
  const sheetRows = await db
    .select()
    .from(sheets)
    .where(eq(sheets.portfolioId, portfolioId))
    .orderBy(asc(sheets.sortOrder));

  if (sheetRows.length === 0) {
    return jsonResponse({
      report,
      period,
      mode,
      currency: portfolio.currency,
      columns,
      groups: [],
      totals: {},
    } satisfies RecapResponse);
  }

  const sheetIds = sheetRows.map((s) => s.id);
  const sectionRows = await db
    .select()
    .from(sections)
    .where(inArray(sections.sheetId, sheetIds))
    .orderBy(asc(sections.sortOrder));

  const sectionIds = sectionRows.map((s) => s.id);
  if (sectionIds.length === 0) {
    return jsonResponse({
      report,
      period,
      mode,
      currency: portfolio.currency,
      columns,
      groups: [],
      totals: {},
    } satisfies RecapResponse);
  }

  const allAssetRows = await db
    .select()
    .from(assets)
    .where(inArray(assets.sectionId, sectionIds))
    .orderBy(asc(assets.sortOrder));

  // Identify any asset that's a parent of another asset. These need to be
  // skipped from the recap because their currentValue is the sum of their
  // children — including both would double-count. The `isGroupParent` flag
  // only marks auto-created provider parents (Coinbase, SimpleFIN); manual
  // parents like a user-created "Fidelity" container don't have that flag.
  const parentIds = new Set<string>();
  for (const a of allAssetRows) {
    if (a.parentAssetId) parentIds.add(a.parentAssetId);
  }

  const sheetMap = new Map(sheetRows.map((s) => [s.id, s]));
  const sectionMap = new Map(sectionRows.map((s) => [s.id, s]));

  const hasMixedCurrencies = allAssetRows.some(
    (a) => a.currency !== portfolio.currency
  );
  const rates: Record<string, number> = hasMixedCurrencies
    ? await getExchangeRates(portfolio.currency)
    : {};
  const btcUsdRate = await getCurrentBtcUsd();
  if (btcUsdRate) rates.BTC = 1 / btcUsdRate;

  const assetMetas: AssetMeta[] = [];
  const assetMap = new Map<string, AssetMeta>();

  for (const asset of allAssetRows) {
    if (asset.isArchived) continue;
    const config = (asset.providerConfig ?? {}) as Record<string, unknown>;
    if (config.isGroupParent) continue;
    // Skip any asset that has children — children carry the actual values.
    if (parentIds.has(asset.id)) continue;

    const aggKey = getRecapAggregationKey({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      currency: asset.currency,
      providerType: asset.providerType,
      providerConfig: config,
      parentAssetId: asset.parentAssetId,
    });
    if (!aggKey) continue;

    const section = sectionMap.get(asset.sectionId);
    const sheet = section ? sheetMap.get(section.sheetId) : undefined;
    if (!section || !sheet) continue;

    const rawValue = Number(asset.currentValue);
    const baseValue = asset.currency !== portfolio.currency
      ? convertToBase(rawValue, asset.currency, portfolio.currency, rates)
      : rawValue;

    const meta: AssetMeta = {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      ownershipPct: Number(asset.ownershipPct ?? 100),
      isCashEquivalent: asset.isCashEquivalent,
      isInvestable: asset.isInvestable,
      isDebt: isLiabilityAsset(sheet, { type: asset.type }),
      taxStatus: asset.taxStatus ?? null,
      providerType: asset.providerType,
      providerConfig: config,
      sheetId: sheet.id,
      sheetName: sheet.name,
      sectionId: section.id,
      sectionName: section.name,
      aggregationKey: aggKey,
      currentValue: baseValue * (Number(asset.ownershipPct ?? 100) / 100),
    };

    assetMetas.push(meta);
    assetMap.set(asset.id, meta);
  }

  const recapGroups = buildGroups(assetMetas, report, sheetRows, sectionRows);

  if (period === "today") {
    return handleTodayReport(
      recapGroups,
      assetMetas,
      columns,
      report,
      period,
      mode,
      portfolio.currency
    );
  }

  const assetIds = assetMetas.map((a) => a.id);
  if (assetIds.length === 0) {
    return jsonResponse({
      report,
      period,
      mode,
      currency: portfolio.currency,
      columns,
      groups: [],
      totals: {},
    } satisfies RecapResponse);
  }

  const tolerance = getToleranceDays(period);

  const assetValues = sql.join(
    assetIds.map((id) => sql`(${id}::uuid)`),
    sql`, `
  );
  const dateValues = sql.join(
    columns.map((c) => sql`(${c}::date)`),
    sql`, `
  );

  const result = await db.execute(sql`
    SELECT DISTINCT ON (a.asset_id, d.target_date)
      a.asset_id AS "assetId",
      d.target_date::text AS "targetDate",
      s.value_in_base AS "valueInBase"
    FROM
      (VALUES ${assetValues}) AS a(asset_id)
      CROSS JOIN (VALUES ${dateValues}) AS d(target_date)
      LEFT JOIN asset_snapshots s
        ON s.asset_id = a.asset_id
        AND s.date <= d.target_date
        AND s.date >= d.target_date - ${tolerance}::int * interval '1 day'
    ORDER BY a.asset_id, d.target_date, s.date DESC
  `);

  const snapshots = result as unknown as SnapshotRow[];

  const { groupValues, totals } = aggregateSnapshots(
    snapshots,
    assetMap,
    recapGroups,
    columns
  );

  let groups = buildGroupRows(recapGroups, groupValues, columns);

  groups = addExpandability(groups);

  if (mode === "allocation") {
    groups = convertToAllocation(groups, columns, totals);
  }

  groups.sort((a, b) => {
    if (a.parentKey === null && b.parentKey !== null) return -1;
    if (a.parentKey !== null && b.parentKey === null) return 1;
    const aVal = a.values[columns[0]] ?? 0;
    const bVal = b.values[columns[0]] ?? 0;
    return Math.abs(bVal) - Math.abs(aVal);
  });

  return jsonResponse({
    report,
    period,
    mode,
    currency: portfolio.currency,
    columns,
    groups,
    totals,
  } satisfies RecapResponse);
}

// ── "Today" period: use live currentValue ──

function handleTodayReport(
  recapGroups: RecapGroup[],
  assetMetas: AssetMeta[],
  columns: string[],
  report: RecapReportType,
  period: RecapPeriod,
  mode: RecapMode,
  currency: string
): Response {
  const col = columns[0];
  const totals: Record<string, number> = {};
  const groupValues = new Map<string, Record<string, number | null>>();

  const assetByGroup = new Map<string, AssetMeta[]>();
  for (const meta of assetMetas) {
    for (const group of recapGroups) {
      if (group.assetIds.includes(meta.id)) {
        const list = assetByGroup.get(group.key) ?? [];
        list.push(meta);
        assetByGroup.set(group.key, list);
      }
    }
  }

  for (const group of recapGroups) {
    const groupAssets = assetByGroup.get(group.key) ?? [];
    let sum = 0;
    for (const a of groupAssets) {
      sum += a.currentValue;
    }
    const val = Number(sum.toFixed(2));
    groupValues.set(group.key, { [col]: val });

    if (!group.isDebt) {
      totals[col] = (totals[col] ?? 0) + val;
    }
  }

  if (totals[col] != null) {
    totals[col] = Number(totals[col].toFixed(2));
  }

  let groups = buildGroupRows(recapGroups, groupValues, columns);
  groups = addExpandability(groups);

  if (mode === "allocation") {
    groups = convertToAllocation(groups, columns, totals);
  }

  groups.sort((a, b) => {
    const aVal = Math.abs(a.values[col] ?? 0);
    const bVal = Math.abs(b.values[col] ?? 0);
    return bVal - aVal;
  });

  return jsonResponse({
    report,
    period,
    mode,
    currency,
    columns,
    groups,
    totals,
  } satisfies RecapResponse);
}

// ── Group builders ──

function buildGroups(
  assetMetas: AssetMeta[],
  report: RecapReportType,
  sheetRows: { id: string; name: string; type: "assets" | "debts" }[],
  sectionRows: { id: string; sheetId: string; name: string }[]
): RecapGroup[] {
  switch (report) {
    case "net_worth":
      return buildNetWorthGroups(assetMetas);
    case "assets_by_class":
      return buildClassGroups(assetMetas);
    case "crypto":
      return buildFilteredGroups(assetMetas, (a) => isCryptoAsset(a));
    case "cash_on_hand":
      return buildFilteredGroups(assetMetas, (a) => a.isCashEquivalent);
    case "investable":
      return buildFilteredGroups(assetMetas, (a) => a.isInvestable && !a.isDebt);
    case "brokerages":
      return buildBrokerageGroups(assetMetas);
    case "assets_by_tax":
      return buildTaxGroups(assetMetas);
    case "sheets_sections":
      return buildSheetSectionGroups(assetMetas, sheetRows, sectionRows);
    default:
      return [];
  }
}

function buildNetWorthGroups(metas: AssetMeta[]): RecapGroup[] {
  const assetMetas = metas.filter((m) => !m.isDebt);
  const debtMetas = metas.filter((m) => m.isDebt);

  const groups: RecapGroup[] = [];

  if (assetMetas.length > 0) {
    groups.push({
      key: "section:assets",
      label: "Assets",
      assetType: "section",
      assetIds: assetMetas.map((a) => a.id),
      isDebt: false,
      parentKey: null,
    });

    const buckets = new Map<string, AssetMeta[]>();
    for (const m of assetMetas) {
      const b = buckets.get(m.aggregationKey) ?? [];
      b.push(m);
      buckets.set(m.aggregationKey, b);
    }

    for (const [key, list] of buckets) {
      groups.push({
        key,
        label: getHoldingLabel(key, list),
        assetType: list[0].type,
        assetIds: list.map((a) => a.id),
        isDebt: false,
        parentKey: "section:assets",
      });
    }
  }

  if (debtMetas.length > 0) {
    groups.push({
      key: "section:debts",
      label: "Debts",
      assetType: "section",
      assetIds: debtMetas.map((a) => a.id),
      isDebt: true,
      parentKey: null,
    });

    const buckets = new Map<string, AssetMeta[]>();
    for (const m of debtMetas) {
      const b = buckets.get(m.aggregationKey) ?? [];
      b.push(m);
      buckets.set(m.aggregationKey, b);
    }

    for (const [key, list] of buckets) {
      groups.push({
        key,
        label: getHoldingLabel(key, list),
        assetType: list[0].type,
        assetIds: list.map((a) => a.id),
        isDebt: true,
        parentKey: "section:debts",
      });
    }
  }

  return groups;
}

// Map canonical crypto symbols to their full names for nicer display.
const CRYPTO_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  LTC: "Litecoin",
  ADA: "Cardano",
  DOT: "Polkadot",
  XRP: "XRP",
  DOGE: "Dogecoin",
  USDC: "USD Coin",
  USDT: "Tether",
  MATIC: "Polygon",
  LINK: "Chainlink",
  AVAX: "Avalanche",
  UNI: "Uniswap",
  AAVE: "Aave",
};

function getHoldingLabel(key: string, metas: AssetMeta[]): string {
  if (key.startsWith("coin:")) {
    const symbol = key.split(":")[1] ?? "";
    const knownName = CRYPTO_NAMES[symbol];
    const name = knownName ?? bestName(metas, symbol);
    return name && name.toUpperCase() !== symbol
      ? `${symbol} • ${name}`
      : symbol;
  }

  if (key.startsWith("equity:")) {
    const ticker = key.split(":")[1] ?? "";
    const name = bestName(metas, ticker);
    return name && name.toUpperCase() !== ticker
      ? `${ticker} • ${name}`
      : ticker;
  }

  return metas[0]?.name ?? key;
}

// Pick the most descriptive asset name across an aggregation group. Skips names
// that are just the symbol or contain "Wallet"/wallet labels — those are
// account-specific, not a descriptor of the underlying holding.
function bestName(metas: AssetMeta[], symbol: string): string {
  const sym = symbol.toUpperCase();
  const candidates = metas
    .map((m) => m.name?.trim() ?? "")
    .filter((n) => {
      if (!n) return false;
      const upper = n.toUpperCase();
      if (upper === sym) return false;
      if (upper.includes("WALLET")) return false;
      return true;
    });
  // Prefer the longest non-symbol name as the most descriptive.
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? "";
}

function buildClassGroups(metas: AssetMeta[]): RecapGroup[] {
  const classBuckets = new Map<string, AssetMeta[]>();
  const tickerBuckets = new Map<string, AssetMeta[]>();

  for (const m of metas) {
    const cls = m.type;
    const bucket = classBuckets.get(cls) ?? [];
    bucket.push(m);
    classBuckets.set(cls, bucket);

    const tb = tickerBuckets.get(m.aggregationKey) ?? [];
    tb.push(m);
    tickerBuckets.set(m.aggregationKey, tb);
  }

  const groups: RecapGroup[] = [];

  for (const [cls, clsAssets] of classBuckets) {
    const classKey = `class:${cls}`;
    groups.push({
      key: classKey,
      label: getClassLabel(cls),
      assetType: cls,
      assetIds: clsAssets.map((a) => a.id),
      isDebt: clsAssets[0]?.isDebt ?? false,
      parentKey: null,
    });

    const subKeys = new Map<string, AssetMeta[]>();
    for (const a of clsAssets) {
      const sk = subKeys.get(a.aggregationKey) ?? [];
      sk.push(a);
      subKeys.set(a.aggregationKey, sk);
    }

    if (subKeys.size > 1) {
      for (const [aggKey, aggAssets] of subKeys) {
        groups.push({
          key: aggKey,
          label: getAggregationLabel(aggKey, aggAssets[0].name),
          assetType: cls,
          assetIds: aggAssets.map((a) => a.id),
          isDebt: aggAssets[0]?.isDebt ?? false,
          parentKey: classKey,
        });
      }
    }
  }

  return groups;
}

function buildFilteredGroups(
  metas: AssetMeta[],
  filter: (a: AssetMeta) => boolean
): RecapGroup[] {
  const filtered = metas.filter(filter);
  const buckets = new Map<string, AssetMeta[]>();

  for (const m of filtered) {
    const bucket = buckets.get(m.aggregationKey) ?? [];
    bucket.push(m);
    buckets.set(m.aggregationKey, bucket);
  }

  return Array.from(buckets.entries()).map(([key, assetList]) => ({
    key,
    label: getAggregationLabel(key, assetList[0].name),
    assetType: assetList[0].type,
    assetIds: assetList.map((a) => a.id),
    isDebt: assetList[0]?.isDebt ?? false,
    parentKey: null,
  }));
}

function buildBrokerageGroups(metas: AssetMeta[]): RecapGroup[] {
  const buckets = new Map<string, AssetMeta[]>();

  for (const m of metas) {
    const config = m.providerConfig ?? {};
    let key: string;

    if (m.providerType === "plaid") {
      key = `brokerage:plaid:${config.connectionId ?? "unknown"}`;
    } else if (m.providerType === "simplefin") {
      key = `brokerage:simplefin:${config.institutionName ?? config.connectionId ?? "unknown"}`;
    } else if (m.providerType === "coinbase") {
      key = "brokerage:coinbase";
    } else if (m.providerType === "ticker" || m.providerType === "wallet") {
      key = `brokerage:self-managed`;
    } else {
      key = `brokerage:manual`;
    }

    const bucket = buckets.get(key) ?? [];
    bucket.push(m);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries()).map(([key, assetList]) => {
    let label: string;
    if (key.includes("plaid:")) {
      const config = assetList[0].providerConfig ?? {};
      label = (config.institutionName as string) ?? "Plaid Account";
    } else if (key.includes("simplefin:")) {
      const config = assetList[0].providerConfig ?? {};
      label = (config.institutionName as string) ?? "SimpleFIN Account";
    } else if (key === "brokerage:coinbase") {
      label = "Coinbase";
    } else if (key === "brokerage:self-managed") {
      label = "Self-Managed";
    } else {
      label = "Manual";
    }

    return {
      key,
      label,
      assetType: "brokerage",
      assetIds: assetList.map((a) => a.id),
      isDebt: false,
      parentKey: null,
    };
  });
}

function buildTaxGroups(metas: AssetMeta[]): RecapGroup[] {
  const buckets = new Map<string, AssetMeta[]>();

  for (const m of metas) {
    if (m.isDebt) continue;
    const status = m.taxStatus ?? "unclassified";
    const bucket = buckets.get(status) ?? [];
    bucket.push(m);
    buckets.set(status, bucket);
  }

  const labels: Record<string, string> = {
    taxable: "Taxable",
    tax_deferred: "Tax-Deferred",
    tax_free: "Tax-Free",
    unclassified: "Unclassified",
  };

  return Array.from(buckets.entries()).map(([status, assetList]) => ({
    key: `tax:${status}`,
    label: labels[status] ?? status,
    assetType: "tax",
    assetIds: assetList.map((a) => a.id),
    isDebt: false,
    parentKey: null,
  }));
}

function buildSheetSectionGroups(
  metas: AssetMeta[],
  sheetRows: { id: string; name: string; type: "assets" | "debts" }[],
  sectionRows: { id: string; sheetId: string; name: string }[]
): RecapGroup[] {
  const groups: RecapGroup[] = [];

  for (const sheet of sheetRows) {
    const sheetAssets = metas.filter((m) => m.sheetId === sheet.id);
    if (sheetAssets.length === 0) continue;

    const sheetKey = `sheet:${sheet.id}`;
    groups.push({
      key: sheetKey,
      label: sheet.name,
      assetType: sheet.type,
      assetIds: sheetAssets.map((a) => a.id),
      isDebt: sheet.type === "debts",
      parentKey: null,
    });

    const sheetSections = sectionRows.filter((s) => s.sheetId === sheet.id);
    for (const sec of sheetSections) {
      const secAssets = metas.filter((m) => m.sectionId === sec.id);
      if (secAssets.length === 0) continue;

      groups.push({
        key: `section:${sec.id}`,
        label: sec.name,
        assetType: sheet.type,
        assetIds: secAssets.map((a) => a.id),
        isDebt: sheet.type === "debts",
        parentKey: sheetKey,
      });
    }
  }

  return groups;
}

function isCryptoAsset(meta: AssetMeta): boolean {
  if (meta.type === "crypto") return true;
  const config = meta.providerConfig ?? {};
  if (config.source === "coingecko") return true;
  if (meta.providerType === "coinbase") return true;
  if (meta.providerType === "wallet") return true;
  return false;
}

function addExpandability(groups: RecapGroupRow[]): RecapGroupRow[] {
  const parentKeys = new Set(
    groups.filter((g) => g.parentKey !== null).map((g) => g.parentKey!)
  );
  return groups.map((g) => ({
    ...g,
    expandable: parentKeys.has(g.key),
  }));
}
