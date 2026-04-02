import type { Portfolio, Asset, Sheet } from "@/hooks/use-portfolio";
import { convertToBase } from "@/lib/currency";

export type AccountDetailKind = "cash" | "brokerage" | "debt" | "asset";

const CASH_ACCOUNT_TYPES = new Set(["cash", "checking", "savings"]);
const BROKERAGE_ACCOUNT_TYPES = new Set([
  "investment",
  "brokerage",
  "stock",
  "etf",
  "fund",
  "crypto",
]);

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
        if (sheet.type === "debts") {
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
