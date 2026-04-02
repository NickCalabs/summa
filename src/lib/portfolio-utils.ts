import type { Portfolio, Asset, Sheet } from "@/hooks/use-portfolio";
import { convertToBase } from "@/lib/currency";

export type AccountDetailKind = "cash" | "brokerage" | "debt" | "asset";
export type RecapFlowTone =
  | "cash"
  | "investment"
  | "realAsset"
  | "otherAsset"
  | "asset"
  | "debt"
  | "netWorth";
export type RecapRollupId =
  | "cash"
  | "investments"
  | "realAssets"
  | "otherAssets"
  | "debts";

export interface PortfolioRecapNode {
  id: string;
  label: string;
  value: number;
  column: "source" | "rollup" | "summary" | "final";
  tone: RecapFlowTone;
  rollupId?: RecapRollupId;
  detail?: string;
}

export interface PortfolioRecapLink {
  id: string;
  sourceId: string;
  targetId: string;
  value: number;
  tone: RecapFlowTone;
}

export interface PortfolioRecapFlow {
  nodes: PortfolioRecapNode[];
  links: PortfolioRecapLink[];
  totals: {
    totalAssets: number;
    totalDebts: number;
    netWorth: number;
    debtDrag: number;
  };
}

const CASH_ACCOUNT_TYPES = new Set(["cash", "checking", "savings"]);
const BROKERAGE_ACCOUNT_TYPES = new Set([
  "investment",
  "brokerage",
  "stock",
  "etf",
  "fund",
  "crypto",
]);
const LIABILITY_ACCOUNT_TYPES = new Set([
  "credit_card",
  "loan",
]);
const REAL_ASSET_TYPES = new Set([
  "real_estate",
  "property",
  "house",
  "land",
  "vehicle",
  "collectible",
  "precious_metals",
]);
const SOURCE_NODE_LIMITS = {
  asset: 7,
  debt: 4,
};

const RECAP_ROLLUPS: Record<
  RecapRollupId,
  {
    label: string;
    summaryTone: RecapFlowTone;
    sourceTone: RecapFlowTone;
    otherLabel?: string;
  }
> = {
  cash: {
    label: "Cash",
    summaryTone: "cash",
    sourceTone: "cash",
    otherLabel: "Other cash",
  },
  investments: {
    label: "Investments",
    summaryTone: "investment",
    sourceTone: "investment",
    otherLabel: "Other investments",
  },
  realAssets: {
    label: "Real assets",
    summaryTone: "realAsset",
    sourceTone: "realAsset",
    otherLabel: "Other real assets",
  },
  otherAssets: {
    label: "Other assets",
    summaryTone: "otherAsset",
    sourceTone: "otherAsset",
    otherLabel: "Other assets",
  },
  debts: {
    label: "Debts",
    summaryTone: "debt",
    sourceTone: "debt",
    otherLabel: "Other debts",
  },
};

export function isLiabilityAsset(
  sheet: Pick<Sheet, "type">,
  asset: Pick<Asset, "type">
) {
  return sheet.type === "debts" || LIABILITY_ACCOUNT_TYPES.has(asset.type);
}

export function isAssetStale(asset: Asset): boolean {
  if (asset.providerType === "manual") return false;
  if (!asset.lastSyncedAt) return true;
  const staleDays = asset.staleDays ?? 1;
  return Date.now() - new Date(asset.lastSyncedAt).getTime() > staleDays * 86_400_000;
}

export function recomputeAggregates(portfolio: Portfolio): Portfolio {
  let totalAssets = 0;
  let totalDebts = 0;
  let cashOnHand = 0;

  const rates = portfolio.rates ?? {};

  for (const sheet of portfolio.sheets) {
    for (const section of sheet.sections) {
      for (const asset of section.assets) {
        const ownership = Number(asset.ownershipPct ?? 100) / 100;
        const rawVal = Number(asset.currentValue) * ownership;
        const val =
          asset.currency !== portfolio.currency
            ? convertToBase(rawVal, asset.currency, portfolio.currency, rates)
            : rawVal;
        if (isLiabilityAsset(sheet, asset)) {
          totalDebts += val;
        } else {
          totalAssets += val;
        }
        if (asset.isCashEquivalent) {
          cashOnHand += val;
        }
      }
    }
  }

  const netWorth = totalAssets - totalDebts;

  return {
    ...portfolio,
    aggregates: {
      totalAssets: Number(totalAssets.toFixed(2)),
      totalDebts: Number(totalDebts.toFixed(2)),
      netWorth: Number(netWorth.toFixed(2)),
      cashOnHand: Number(cashOnHand.toFixed(2)),
    },
  };
}

export function buildPortfolioRecapFlow(portfolio: Portfolio): PortfolioRecapFlow {
  const sourceGroups = new Map<
    string,
    {
      id: string;
      label: string;
      detail: string;
      rollupId: RecapRollupId;
      tone: RecapFlowTone;
      value: number;
      kind: "asset" | "debt";
    }
  >();
  const rollupTotals = new Map<RecapRollupId, number>();

  for (const sheet of portfolio.sheets) {
    for (const section of sheet.sections) {
      const assets = section.assets.filter((asset) => !asset.isArchived);

      for (const asset of assets) {
        const rollupId = getRecapRollupId(sheet, asset);
        const rollupMeta = RECAP_ROLLUPS[rollupId];
        const value = getOwnedAssetValue(asset);
        const valueInBase = convertToBase(
          value,
          asset.currency,
          portfolio.currency,
          portfolio.rates
        );

        if (valueInBase <= 0) continue;

        const sourceId = `${sheet.id}:${section.id}:${rollupId}`;
        const source = sourceGroups.get(sourceId);

        if (source) {
          source.value += valueInBase;
        } else {
          sourceGroups.set(sourceId, {
            id: sourceId,
            label: buildSourceLabel(sheet.name, section.name, rollupMeta.label),
            detail: sheet.name,
            rollupId,
            tone: rollupMeta.sourceTone,
            value: valueInBase,
            kind: rollupId === "debts" ? "debt" : "asset",
          });
        }

        rollupTotals.set(rollupId, (rollupTotals.get(rollupId) ?? 0) + valueInBase);
      }
    }
  }

  const assetSources = collapseRecapSources(
    [...sourceGroups.values()].filter((source) => source.kind === "asset"),
    SOURCE_NODE_LIMITS.asset,
    "asset"
  );
  const debtSources = collapseRecapSources(
    [...sourceGroups.values()].filter((source) => source.kind === "debt"),
    SOURCE_NODE_LIMITS.debt,
    "debt"
  );

  const nodes: PortfolioRecapNode[] = [];
  const links: PortfolioRecapLink[] = [];

  for (const source of [...assetSources, ...debtSources]) {
    nodes.push({
      id: source.id,
      label: source.label,
      value: roundCurrency(source.value),
      column: "source",
      tone: source.tone,
      rollupId: source.rollupId,
      detail: source.detail,
    });
    links.push({
      id: `${source.id}->rollup:${source.rollupId}`,
      sourceId: source.id,
      targetId: `rollup:${source.rollupId}`,
      value: roundCurrency(source.value),
      tone: source.tone,
    });
  }

  for (const rollupId of [
    "cash",
    "investments",
    "realAssets",
    "otherAssets",
    "debts",
  ] as const) {
    const value = roundCurrency(rollupTotals.get(rollupId) ?? 0);
    if (value <= 0) continue;

    const meta = RECAP_ROLLUPS[rollupId];
    nodes.push({
      id: `rollup:${rollupId}`,
      label: meta.label,
      value,
      column: "rollup",
      tone: meta.summaryTone,
      rollupId,
    });

    if (rollupId === "debts") {
      links.push({
        id: `rollup:${rollupId}->summary:debts`,
        sourceId: `rollup:${rollupId}`,
        targetId: "summary:debts",
        value,
        tone: "debt",
      });
      continue;
    }

    links.push({
      id: `rollup:${rollupId}->summary:assets`,
      sourceId: `rollup:${rollupId}`,
      targetId: "summary:assets",
      value,
      tone: meta.summaryTone,
    });
  }

  const totalAssets = roundCurrency(portfolio.aggregates.totalAssets);
  const totalDebts = roundCurrency(portfolio.aggregates.totalDebts);
  const netWorth = roundCurrency(portfolio.aggregates.netWorth);
  const debtDrag = roundCurrency(Math.min(totalAssets, totalDebts));

  if (totalAssets > 0) {
    nodes.push({
      id: "summary:assets",
      label: "Assets",
      value: totalAssets,
      column: "summary",
      tone: "asset",
      detail:
        debtDrag > 0
          ? `${portfolio.currency} assets before liabilities`
          : undefined,
    });
  }

  if (totalDebts > 0) {
    nodes.push({
      id: "summary:debts",
      label: "Debts",
      value: totalDebts,
      column: "summary",
      tone: "debt",
    });
    nodes.push({
      id: "final:debts",
      label: "Debts",
      value: totalDebts,
      column: "final",
      tone: "debt",
    });
    links.push({
      id: "summary:debts->final:debts",
      sourceId: "summary:debts",
      targetId: "final:debts",
      value: totalDebts,
      tone: "debt",
    });
  }

  if (netWorth > 0) {
    nodes.push({
      id: "final:netWorth",
      label: "Net worth",
      value: netWorth,
      column: "final",
      tone: "netWorth",
      detail: "After debt load",
    });
    links.push({
      id: "summary:assets->final:netWorth",
      sourceId: "summary:assets",
      targetId: "final:netWorth",
      value: netWorth,
      tone: "netWorth",
    });
  }

  return {
    nodes,
    links,
    totals: {
      totalAssets,
      totalDebts,
      netWorth,
      debtDrag,
    },
  };
}

export function findAssetInTree(
  portfolio: Portfolio,
  assetId: string
): Asset | undefined {
  for (const sheet of portfolio.sheets) {
    for (const section of sheet.sections) {
      const asset = section.assets.find((a) => a.id === assetId);
      if (asset) return asset;
    }
  }
  return undefined;
}

export function findAssetLocation(portfolio: Portfolio, assetId: string) {
  for (const sheet of portfolio.sheets) {
    for (const section of sheet.sections) {
      const asset = section.assets.find((a) => a.id === assetId);
      if (asset) {
        return { sheet, section, asset };
      }
    }
  }
  return null;
}

export function findLinkedAssetForDebt(portfolio: Portfolio, debtId: string) {
  for (const sheet of portfolio.sheets) {
    if (sheet.type !== "assets") continue;
    for (const section of sheet.sections) {
      const asset = section.assets.find((candidate) => candidate.linkedDebtId === debtId);
      if (asset) {
        return { sheet, section, asset };
      }
    }
  }
  return null;
}

export function getAccountDetailKind(
  sheet: Pick<Sheet, "type">,
  asset: Pick<
    Asset,
    | "type"
    | "isCashEquivalent"
    | "providerType"
    | "quantity"
    | "currentPrice"
    | "costBasis"
  >
): AccountDetailKind {
  if (sheet.type === "debts") return "debt";

  if (
    asset.isCashEquivalent ||
    CASH_ACCOUNT_TYPES.has(asset.type) ||
    (asset.providerType === "plaid" && asset.type === "cash")
  ) {
    return "cash";
  }

  if (
    BROKERAGE_ACCOUNT_TYPES.has(asset.type) ||
    asset.providerType === "ticker" ||
    asset.quantity !== null ||
    asset.currentPrice !== null ||
    asset.costBasis !== null
  ) {
    return "brokerage";
  }

  return "asset";
}

export function getOwnedAssetValue(
  asset: Pick<Asset, "currentValue" | "ownershipPct">
): number {
  const ownership = Number(asset.ownershipPct ?? 100) / 100;
  return Number(asset.currentValue) * ownership;
}

function getRecapRollupId(
  sheet: Pick<Sheet, "type">,
  asset: Pick<Asset, "type" | "isCashEquivalent" | "isInvestable">
): RecapRollupId {
  if (isLiabilityAsset(sheet, asset)) return "debts";
  if (asset.isCashEquivalent || CASH_ACCOUNT_TYPES.has(asset.type)) return "cash";
  if (asset.isInvestable || BROKERAGE_ACCOUNT_TYPES.has(asset.type)) {
    return "investments";
  }
  if (REAL_ASSET_TYPES.has(asset.type)) return "realAssets";
  return "otherAssets";
}

function buildSourceLabel(
  sheetName: string,
  sectionName: string,
  rollupLabel: string
) {
  if (!sectionName) return sheetName;
  if (
    sectionName.toLowerCase() === sheetName.toLowerCase() ||
    sectionName.toLowerCase() === rollupLabel.toLowerCase()
  ) {
    return sectionName;
  }
  return `${sectionName} / ${rollupLabel}`;
}

function collapseRecapSources<
  T extends {
    id: string;
    label: string;
    detail: string;
    rollupId: RecapRollupId;
    tone: RecapFlowTone;
    value: number;
    kind: "asset" | "debt";
  },
>(sources: T[], maxCount: number, kind: "asset" | "debt"): T[] {
  if (sources.length <= maxCount) {
    return [...sources].sort((left, right) => right.value - left.value);
  }

  const sorted = [...sources].sort((left, right) => right.value - left.value);
  const kept = sorted.slice(0, maxCount - 1);
  const overflow = sorted.slice(maxCount - 1);

  if (overflow.length === 0) return kept;

  const groupedByRollup = new Map<
    RecapRollupId,
    { value: number; tone: RecapFlowTone }
  >();
  for (const source of overflow) {
    const entry = groupedByRollup.get(source.rollupId);
    if (entry) {
      entry.value += source.value;
    } else {
      groupedByRollup.set(source.rollupId, {
        value: source.value,
        tone: source.tone,
      });
    }
  }

  kept.push(
    ...[...groupedByRollup.entries()]
      .sort((left, right) => right[1].value - left[1].value)
      .map(([rollupId, entry]) => {
        const meta = RECAP_ROLLUPS[rollupId];
        return {
          id: `source:other:${kind}:${rollupId}`,
          label: meta.otherLabel ?? `Other ${kind}s`,
          detail: kind === "debt" ? "Liabilities" : "Smaller account groups",
          rollupId,
          tone: entry.tone,
          value: entry.value,
          kind,
        } as T;
      })
  );

  return kept.sort((left, right) => right.value - left.value);
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

export function updateAssetInTree(
  portfolio: Portfolio,
  assetId: string,
  partial: Partial<Asset>
): Portfolio {
  const clone = structuredClone(portfolio);
  for (const sheet of clone.sheets) {
    for (const section of sheet.sections) {
      const idx = section.assets.findIndex((a) => a.id === assetId);
      if (idx !== -1) {
        section.assets[idx] = { ...section.assets[idx], ...partial };
        return recomputeAggregates(clone);
      }
    }
  }
  return clone;
}

export function removeAssetFromTree(
  portfolio: Portfolio,
  assetId: string
): Portfolio {
  const clone = structuredClone(portfolio);
  for (const sheet of clone.sheets) {
    for (const section of sheet.sections) {
      const idx = section.assets.findIndex((a) => a.id === assetId);
      if (idx !== -1) {
        section.assets.splice(idx, 1);
        return recomputeAggregates(clone);
      }
    }
  }
  return clone;
}

export function insertAssetInTree(
  portfolio: Portfolio,
  sectionId: string,
  newAsset: Asset
): Portfolio {
  const clone = structuredClone(portfolio);
  for (const sheet of clone.sheets) {
    for (const section of sheet.sections) {
      if (section.id === sectionId) {
        section.assets.push(newAsset);
        return recomputeAggregates(clone);
      }
    }
  }
  return clone;
}
