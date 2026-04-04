import { subDays, differenceInCalendarDays, differenceInDays, parseISO } from "date-fns";
import type { PortfolioSnapshot } from "@/hooks/use-snapshots";
import type { Portfolio } from "@/hooks/use-portfolio";
import { convertToBase } from "@/lib/currency";
import { isLiabilityAsset } from "@/lib/portfolio-utils";

type SnapshotField = "netWorth" | "totalAssets" | "totalDebts" | "cashOnHand";
type CagrField = SnapshotField | "investableTotal";

export interface Change {
  absoluteChange: number;
  percentChange: number;
}

/**
 * Compute the change for a given field between the latest snapshot and one ~daysAgo.
 * Snapshots are expected in descending date order (newest first).
 */
export function getChangeFromSnapshots(
  snapshots: PortfolioSnapshot[],
  field: SnapshotField,
  daysAgo: number
): Change | null {
  if (snapshots.length < 2) return null;

  const currentValue = Number(snapshots[0][field]);
  const targetDate = subDays(new Date(), daysAgo);
  const tolerance = daysAgo <= 7 ? 3 : 14;

  let closest: PortfolioSnapshot | null = null;
  let closestDiff = Infinity;

  for (const snap of snapshots.slice(1)) {
    const diff = Math.abs(differenceInCalendarDays(parseISO(snap.date), targetDate));
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = snap;
    }
  }

  if (!closest || closestDiff > tolerance) return null;

  const previousValue = Number(closest[field]);
  const absoluteChange = currentValue - previousValue;
  const percentChange =
    previousValue !== 0 ? (absoluteChange / Math.abs(previousValue)) * 100 : 0;

  return { absoluteChange, percentChange };
}

/**
 * Sum currentValue for investable, non-archived assets across all asset sheets,
 * converting each to the portfolio's base currency.
 */
export function computeInvestableTotal(portfolio: Portfolio): number {
  let total = 0;
  for (const sheet of portfolio.sheets) {
    for (const section of sheet.sections) {
      for (const asset of section.assets) {
        if (
          asset.isInvestable &&
          !asset.isArchived &&
          !isLiabilityAsset(sheet, asset)
        ) {
          const ownership = Number(asset.ownershipPct ?? 100) / 100;
          const value = Number(asset.currentValue) * ownership;
          total += convertToBase(value, asset.currency, portfolio.currency, portfolio.rates);
        }
      }
    }
  }
  return total;
}

/**
 * Compute CAGR for a given field using the oldest and newest snapshots.
 * Snapshots are expected in descending date order (newest first).
 * Returns null if < 30 days of data or startValue is 0.
 */
export function computeCAGR(
  snapshots: PortfolioSnapshot[],
  field: CagrField
): number | null {
  if (snapshots.length < 2) return null;

  const newest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];

  const endValue = Number(newest[field] ?? 0);
  const startValue = Number(oldest[field] ?? 0);

  if (startValue <= 0 || endValue <= 0) return null;

  const days = differenceInDays(parseISO(newest.date), parseISO(oldest.date));
  if (days < 30) return null;

  const years = days / 365.25;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}
