# Refresh, Sync & Digit-Wheel Animation Design

**Date**: 2026-04-20
**Status**: Draft

## Problem

Three interconnected refresh/sync issues degrade the Summa experience:

1. **SimpleFIN silently goes stale** — No cron job exists for SimpleFIN (unlike Plaid's 6-hour cycle, crypto's 1-minute cycle, Yahoo's 15-minute cycle). After a few days, the connection fails and requires manual intervention.
2. **"Synced X ago" is meaningless** — The toolbar computes the max `lastSyncedAt` across all assets. Since crypto prices update every minute, it nearly always says "less than a minute ago," hiding the fact that bank/account data may be days old.
3. **Number animation is a plain tween** — The current `MoneyDisplay` uses a `requestAnimationFrame` count-up with easeOutCubic. It doesn't communicate "your data just refreshed" the way a digit-wheel (iOS picker / Kubera style) would.
4. **Yahoo shows "never synced"** — The connections page derives Yahoo status from asset `source` fields, but the query doesn't find matching assets, so it always displays "Never synced" despite the 15-minute cron running correctly.

## Design

### 1. SimpleFIN Auto-Refresh with Retry

**Goal**: SimpleFIN connections sync automatically every 6 hours. Failures self-heal via exponential backoff.

**Schema change**: Add `retryCount integer default 0` column to `simplefinConnections` table.

**Cron job** (added to `src/lib/cron.ts`):
- Schedule: `0 */6 * * *` (every 6 hours, matching Plaid)
- Concurrency guard: `running.simplefin` flag, same pattern as other jobs
- For each SimpleFIN connection:
  - Skip if `retryCount > 0` and `updatedAt + nextBackoffMs(retryCount) > now` (backoff not yet elapsed)
  - Call the sync logic (extracted to a shared function from the existing `/api/simplefin/connections/[id]/sync` route)
  - On success: reset `retryCount` to 0, clear `errorCode`/`errorMessage`, update `lastSyncedAt`
  - On failure: increment `retryCount`, store error fields, update `updatedAt`

**Backoff schedule** (reuses existing `nextBackoffMs()`):
| retryCount | Wait before next attempt |
|---|---|
| 1 | 24 hours |
| 2 | 48 hours |
| 3 | 96 hours |
| 4+ | 7 days (max) |

**Shared sync function**: Extract the core sync logic from `src/app/api/simplefin/connections/[id]/sync/route.ts` into `src/lib/simplefin-sync.ts`. Both the API route and the cron job call this function. This avoids the cron making HTTP requests to itself.

**Files touched**:
- `src/lib/db/schema.ts` — add `retryCount` to `simplefinConnections`
- New migration for the column addition
- `src/lib/simplefin-sync.ts` — new file, extracted sync logic
- `src/app/api/simplefin/connections/[id]/sync/route.ts` — delegate to shared function
- `src/lib/cron.ts` — add SimpleFIN cron job

### 2. Refresh Button + Stale Connection Badge

**Goal**: Replace the misleading "synced X ago" text with a clean refresh button that shows a warning dot when any provider connection is stale or erroring.

**Remove**:
- `lastSyncedAt` prop from `ToolbarActions`, `TopBar`, and the max-timestamp computation in `portfolio-view.tsx`
- The `formatDistanceToNow` display below the refresh button
- The `date-fns` import from `toolbar-actions.tsx` (if no longer needed)

**New hook** (`src/hooks/use-connection-health.ts`):
```typescript
interface ConnectionHealth {
  staleCount: number;
  errorCount: number;
  isLoading: boolean;
}
```
- Calls `GET /api/connections`
- Counts connections with status `"stale"` or `"error"`
- Polls every 60 seconds via `refetchInterval`
- Refetches on `syncPortfolio` success

**Refresh button changes** (`toolbar-actions.tsx`):
- Amber dot overlay on `RefreshCwIcon` when `staleCount > 0` (but no errors)
- Red dot overlay when `errorCount > 0`
- No dot when all connections healthy
- `title` attribute shows: "2 connections need attention" or "All connections healthy"
- Dot is a small absolute-positioned `<span>` (6px circle, top-right of icon)

**Staleness thresholds**: Already implemented in the connections API via `computeStatus()` with `expectedIntervalMs * 2`:
| Provider | Sync interval | Stale after |
|---|---|---|
| SimpleFIN | 6 hours | 12 hours |
| Plaid | 6 hours | 12 hours |
| Yahoo | 15 minutes | 30 minutes |
| CoinGecko | 1 minute | 2 minutes |
| Coinbase | 15 minutes | 30 minutes |
| Wallets | 30 minutes | 60 minutes |

**Files touched**:
- `src/hooks/use-connection-health.ts` — new hook
- `src/components/toolbar-actions.tsx` — remove timestamp, add badge
- `src/components/portfolio/top-bar.tsx` — remove `lastSyncedAt` prop
- `src/components/portfolio/portfolio-view.tsx` — remove max-timestamp computation

### 3. Yahoo "Never Synced" Fix

**Goal**: The connections page should show an accurate "Updated X minutes ago" for the Yahoo price feed.

**Root cause**: The connections API (`/api/connections`) queries for the most recently synced asset with `source='yahoo'`. Either the `refreshPrices()` function in `cron.ts` doesn't write `source='yahoo'` to assets, or the query filter doesn't match the actual stored values.

**Fix approach**:
1. Trace the exact query in `/api/connections/route.ts` (lines 208-224) to confirm what `source` value it filters on
2. Trace `refreshPrices()` in `cron.ts` to confirm what `source` value it writes (if any) when updating `lastSyncedAt`
3. Align them — likely a one-line fix to either the query or the value written during refresh

**Validation**: After fix, connections page shows "Updated X minutes ago" for Yahoo, updating every ~15 minutes when the cron runs.

**Files touched**:
- `src/lib/cron.ts` and/or `src/app/api/connections/route.ts` — alignment fix

### 4. Digit-Wheel Animation (SlotDigit)

**Goal**: Replace the current count-up tween with an iOS-picker-style digit wheel where each digit slides vertically into place, cascading left to right. Plays on every page load to signal "these are the latest numbers."

**New component**: `src/components/ui/slot-digit.tsx`

**`<SlotDigit>` mechanics**:
- Renders a container with `overflow: hidden`, height equal to one character
- Inside: a column of characters 0-9, stacked vertically
- Target digit selected via `transform: translateY(-${digit * 100}%)` on the inner column
- Transition: `transition: transform 600ms cubic-bezier(0.23, 1, 0.32, 1)` — fast departure, gentle arrival (matches iOS picker feel)
- `transition-delay`: cascades per column position (~40ms offset left-to-right)

**Non-digit characters** ($, commas, decimal points, spaces): Rendered as static `<span>` elements. No animation needed.

**`MoneyDisplay` changes** (`src/components/portfolio/money-display.tsx`):
- When `animate={true}`:
  - Split the formatted currency string into individual characters
  - Render each digit character as a `<SlotDigit>`, each symbol as a static `<span>`
  - On first render (mount): animate from digit 0 to actual digit (Kubera-style "numbers rolling into place")
  - On subsequent updates: animate from previous digit to new digit
- When `animate={false}`: Render as a plain `<span>`, same as today — zero overhead
- When `valuesMasked`: Render masked string as today — no slot digits
- Remove the existing `requestAnimationFrame` tween logic entirely

**Handling digit count changes** (e.g., $999 -> $1,000):
- Compare old and new formatted strings right-aligned (ones digit stays in place)
- New columns entering (number grew): fade in with `opacity 0 -> 1` over 300ms
- Columns exiting (number shrank): fade out with `opacity 1 -> 0` over 300ms

**Where `animate={true}` is applied**:
| Location | Component | Animated? |
|---|---|---|
| Dashboard — Net Worth | `StatsCards` | Yes |
| Dashboard — Investable | `StatsCards` | Yes |
| Dashboard — Assets total | `StatsCards` | Yes |
| Dashboard — Cash on hand | `StatsCards` | Yes |
| Dashboard — Debts total | `StatsCards` | Yes |
| Dashboard — CAGR | `StatsCards` | Yes — apply SlotDigit to the percentage string directly (not via MoneyDisplay since CAGR is a %, not a currency value) |
| Sheet — Total header | `SheetTotalHeader` | Yes (add `animate` prop) |
| Sheet — Asset rows | `AssetTable` | No |
| Settings — Balances | Various | No |

**Performance**: Pure CSS transforms and transitions. GPU-accelerated. No JS animation loop. Each `<SlotDigit>` is a lightweight DOM node. Even 30 animated digits on screen (all dashboard cards) will be smooth.

**Files touched**:
- `src/components/ui/slot-digit.tsx` — new component
- `src/components/portfolio/money-display.tsx` — replace tween with SlotDigit rendering
- `src/components/dashboard/stats-cards.tsx` — add `animate` prop to all hero MoneyDisplays
- `src/components/portfolio/sheet-total-header.tsx` — add `animate` prop

## Out of Scope

- Push/email notifications for stale connections (future enhancement)
- Per-account sync timestamps visible on dashboard (connections page already shows this)
- Animating individual asset row values
- SimpleFIN connection auto-reconnect when auth expires (requires user action to re-authenticate with their bank)
