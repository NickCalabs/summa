import { subDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { PortfolioSnapshot } from "@/hooks/use-snapshots";
import type { Portfolio } from "@/hooks/use-portfolio";
import { convertToBase } from "@/lib/currency";

type SnapshotField = "netWorth" | "totalAssets" | "totalDebts" | "cashOnHand";

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
    if (sheet.type !== "assets") continue;
    for (const section of sheet.sections) {
      for (const asset of section.assets) {
        if (asset.isInvestable && !asset.isArchived) {
          const ownership = Number(asset.ownershipPct ?? 100) / 100;
          const value = Number(asset.currentValue) * ownership;
          total += convertToBase(value, asset.currency, portfolio.currency, portfolio.rates);
        }
      }
    }
  }
  return total;
}
