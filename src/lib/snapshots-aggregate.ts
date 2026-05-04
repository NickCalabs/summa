import { convertToBase } from "@/lib/currency";
import { isLiabilityAsset } from "@/lib/portfolio-utils";

export interface AggregatableAsset {
  id: string;
  sectionId: string;
  parentAssetId: string | null;
  currency: string;
  currentValue: string;
  ownershipPct: string;
  type: string;
  isCashEquivalent: boolean;
  isInvestable: boolean;
}

interface AggregateInput<T extends AggregatableAsset> {
  assetRows: T[];
  sectionSheetMap: Map<string, string>;
  sheetTypeMap: Map<string, string>;
  baseCurrency: string;
  rates: Record<string, number>;
}

export interface PortfolioTotals {
  totalAssets: number;
  totalDebts: number;
  cashOnHand: number;
  investableTotal: number;
}

/**
 * Sum portfolio totals from leaf assets only. Provider-grouped parents (whose
 * `currentValue` is set to `sum(children.currentValue)` by sync code) are
 * skipped so we don't double-count. Cash-equivalent and investable flags are
 * read from each leaf, matching the live API/recomputeAggregates behavior.
 *
 * Reused by the daily snapshot writer and by the historical backfill.
 */
export function aggregatePortfolioTotals<T extends AggregatableAsset>(
  input: AggregateInput<T>
): PortfolioTotals {
  const { assetRows, sectionSheetMap, sheetTypeMap, baseCurrency, rates } =
    input;

  const parentIds = new Set<string>();
  for (const a of assetRows) {
    if (a.parentAssetId) parentIds.add(a.parentAssetId);
  }

  let totalAssets = 0;
  let totalDebts = 0;
  let cashOnHand = 0;
  let investableTotal = 0;

  for (const asset of assetRows) {
    if (parentIds.has(asset.id)) continue; // skip container parents

    const ownership = Number(asset.ownershipPct ?? 100) / 100;
    const ownedRaw = Number(asset.currentValue) * ownership;
    const val = convertToBase(ownedRaw, asset.currency, baseCurrency, rates);

    const sheetId = sectionSheetMap.get(asset.sectionId);
    const sheetType = (sheetId ? sheetTypeMap.get(sheetId) : "assets") as
      | "assets"
      | "debts";
    const sheet = { type: sheetType ?? "assets" };
    const isLiability = isLiabilityAsset(sheet, asset);

    if (isLiability) {
      totalDebts += val;
    } else {
      totalAssets += val;
    }
    if (asset.isCashEquivalent) {
      cashOnHand += val;
    }
    if (asset.isInvestable && !isLiability) {
      investableTotal += val;
    }
  }

  return { totalAssets, totalDebts, cashOnHand, investableTotal };
}
