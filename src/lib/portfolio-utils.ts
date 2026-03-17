import type { Portfolio, Asset } from "@/hooks/use-portfolio";

export function recomputeAggregates(portfolio: Portfolio): Portfolio {
  let totalAssets = 0;
  let totalDebts = 0;
  let cashOnHand = 0;

  for (const sheet of portfolio.sheets) {
    for (const section of sheet.sections) {
      for (const asset of section.assets) {
        const val = Number(asset.currentValue);
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
