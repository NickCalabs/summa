import {
  getRecapAggregationKey,
  getAggregationLabel,
  type AggregationKeyInput,
} from "@/lib/recap-utils";

export interface PickerAsset extends AggregationKeyInput {
  currentValueInBase: number;
}

export interface PickerGroup {
  key: string;
  label: string;
  assetIds: string[];
  assets: PickerAsset[];
  totalValue: number;
}

export function buildPickerGroups(assets: PickerAsset[]): PickerGroup[] {
  const byKey = new Map<string, PickerGroup>();

  for (const asset of assets) {
    const key = getRecapAggregationKey(asset);
    if (!key) continue; // group-parent containers and similar — skip

    const existing = byKey.get(key);
    if (existing) {
      existing.assetIds.push(asset.id);
      existing.assets.push(asset);
      existing.totalValue += asset.currentValueInBase;
    } else {
      byKey.set(key, {
        key,
        label: getAggregationLabel(key, asset.name),
        assetIds: [asset.id],
        assets: [asset],
        totalValue: asset.currentValueInBase,
      });
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) => b.totalValue - a.totalValue
  );
}

export interface PickerSelection {
  groupKeys: string[];
  assetIds: string[];
}

export function expandSelection(
  selection: PickerSelection,
  assets: PickerAsset[]
): string[] {
  const groups = buildPickerGroups(assets);
  const groupKeys = new Set(selection.groupKeys);
  const out = new Set<string>(selection.assetIds);

  for (const group of groups) {
    if (groupKeys.has(group.key)) {
      for (const id of group.assetIds) out.add(id);
    }
  }

  return Array.from(out);
}
