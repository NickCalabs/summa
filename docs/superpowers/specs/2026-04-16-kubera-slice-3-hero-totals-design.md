# Kubera visual parity — slice 3: hero page totals + ChangeIndicator

**Status**: Design
**Author**: Claude (with Nick)
**Date**: 2026-04-16
**Branch (target)**: `kubera/03-hero-totals`
**Predecessors**: Slice 1 (PR #63 — design tokens), Slice 2 (PR #64 — sidebar restyle).

## Context

Kubera's hero pattern (audit §3.2, §4.1): big hero number (Inter 36px, weight 700), uppercase "1 DAY" / "1 YEAR" micro-labels (10px, wide tracking), signed delta + parenthetical %, colored by sign. No icons on the change chips.

Summa's current state:
- `SheetTotalHeader` renders the portfolio page hero: "Assets"/"Debts" label + `text-4xl` big number + `ChangeIndicator` with "1D"/"1Y" labels.
- `ChangeIndicator` is a shared component used by `SheetTotalHeader`, `dashboard-view.tsx` (inline hero), and `stats-cards.tsx` (stat card cells). Uses `text-xs`, Lucide `TrendingUp`/`TrendingDown`/`Minus` icons, "1D:" label format with trailing colon.
- `NetWorthHeader` is defined in `src/components/portfolio/net-worth-header.tsx` but not imported anywhere — orphaned code.

Slice-1 tokens available: `text-hero` (36px), `text-nano` (10px), `tracking-upper` (0.05em), `--positive`, `--negative`.

## Decisions (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| Q1 | **Portfolio only** for SheetTotalHeader; ChangeIndicator changes propagate to dashboard | Dashboard decorative chrome is a separate UX decision for a later slice. ChangeIndicator is shared — propagation gives consistent treatment everywhere for free. |
| Q2 | **Uppercase eyebrow** for "Assets"/"Debts" label | Kubera-quieter than current `text-sm`, consistent with slice-1 language (`text-nano tracking-upper`). |
| Labels | **`1 DAY` / `1 YEAR`** uppercase, no colon | Matches Kubera §3.2. ChangeIndicator already takes `label` as a prop — callers just pass the full string. |
| Icons | **Drop Lucide TrendingUp/Down/Minus** | Kubera's hero change chips use no icon — just signed colored number + parenthetical %. Cleaner. |
| Propagation | **Let ChangeIndicator changes propagate** to dashboard hero + stats-cards | YAGNI — a variant prop to cordon off the new style would be temporary scaffolding for the same outcome. |

## Scope

### Files modified

1. **`src/components/dashboard/change-indicator.tsx`** — drop Lucide icon imports, remove `Icon` rendering, change `text-xs` → `text-nano tracking-upper font-semibold` for label, keep `text-xs` for value, keep `invertColor` prop, update null/zero states.
2. **`src/components/portfolio/sheet-total-header.tsx`** — eyebrow label: `text-sm font-medium` → `text-nano uppercase tracking-upper font-semibold`; big number: `text-4xl font-normal` → `text-hero font-semibold`; spacing: `space-y-1` → `space-y-2`; label props: `"1D"` → `"1 DAY"`, `"1Y"` → `"1 YEAR"`.
3. **`src/components/dashboard/dashboard-view.tsx`** — label prop updates only: `label="1D"` → `label="1 DAY"`, `label="1Y"` → `label="1 YEAR"` (3 occurrences).
4. **`src/components/dashboard/stats-cards.tsx`** — label prop update: `label="1D"` → `label="1 DAY"` (1 occurrence).

### Files deleted

5. **`src/components/portfolio/net-worth-header.tsx`** — orphaned. Not imported anywhere. Contains `NetWorthHeader`, `ChangeChip`, `computeNetWorthChange` — all dead code.

### Files NOT touched

- `src/app/globals.css` — no token changes.
- `src/components/dashboard/dashboard-view.tsx` **beyond label props** — gradient, rounded-[32px], shadow, DashboardSurface, all untouched.
- `src/components/portfolio/portfolio-view.tsx` — consumes `SheetTotalHeader` unchanged.

## Concrete changes

### change-indicator.tsx

Current:
```tsx
import { TrendingUpIcon, TrendingDownIcon, MinusIcon } from "lucide-react";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import type { Change } from "@/lib/snapshot-utils";

// ... props ...

export function ChangeIndicator({ change, currency, label, invertColor = false, btcUsdRate }: ChangeIndicatorProps) {
  if (!change) {
    return <span className="text-xs text-muted-foreground">{label}: —</span>;
  }

  const { absoluteChange, percentChange } = change;

  if (absoluteChange === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {label}: <MinusIcon className="size-3" /> 0%
      </span>
    );
  }

  const isPositive = absoluteChange > 0;
  const isGood = invertColor ? !isPositive : isPositive;
  const colorClass = isGood ? "text-positive" : "text-negative";
  const Icon = isPositive ? TrendingUpIcon : TrendingDownIcon;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${colorClass}`}>
      {label}: <Icon className="size-3" />
      <MoneyDisplay amount={Math.abs(absoluteChange)} currency={currency} btcUsdRate={btcUsdRate} />
      ({percentChange > 0 ? "+" : ""}
      {percentChange.toFixed(1)}%)
    </span>
  );
}
```

Target:
```tsx
import { MoneyDisplay } from "@/components/portfolio/money-display";
import type { Change } from "@/lib/snapshot-utils";

// ... props (unchanged) ...

export function ChangeIndicator({ change, currency, label, invertColor = false, btcUsdRate }: ChangeIndicatorProps) {
  if (!change) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="text-nano uppercase tracking-upper font-semibold">{label}</span>
        <span className="text-xs">—</span>
      </span>
    );
  }

  const { absoluteChange, percentChange } = change;

  if (absoluteChange === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="text-nano uppercase tracking-upper font-semibold">{label}</span>
        <span className="text-xs">0%</span>
      </span>
    );
  }

  const isPositive = absoluteChange > 0;
  const isGood = invertColor ? !isPositive : isPositive;
  const colorClass = isGood ? "text-positive" : "text-negative";
  const sign = isPositive ? "+" : "";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-nano uppercase tracking-upper font-semibold text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium ${colorClass}`}>
        {sign}<MoneyDisplay amount={Math.abs(absoluteChange)} currency={currency} btcUsdRate={btcUsdRate} />
        {" "}({sign}{percentChange.toFixed(1)}%)
      </span>
    </span>
  );
}
```

Key changes: Lucide icons removed; label as own `<span>` with `text-nano uppercase tracking-upper font-semibold text-muted-foreground`; value in `text-xs font-medium` colored by sign; gap widened to `gap-1.5`; colon removed.

### sheet-total-header.tsx

- Label `<p>`: `text-sm font-medium text-muted-foreground` → `text-nano uppercase tracking-upper font-semibold text-muted-foreground`
- Big number `MoneyDisplay` className: `text-4xl font-normal tracking-[-0.015em] tabular-lining` → `text-hero font-semibold tracking-[-0.015em] tabular-lining`
- Wrapper `<div>`: `space-y-1` → `space-y-2`
- Label props: `label="1D"` → `label="1 DAY"`, `label="1Y"` → `label="1 YEAR"`

### dashboard-view.tsx (label props only)

Three `<ChangeIndicator>` instances:
- Line ~153: `label="1D"` → `label="1 DAY"`
- Line ~160: `label="1Y"` → `label="1 YEAR"`
- Line ~210: `label="1D"` → `label="1 DAY"`

### stats-cards.tsx (label prop only)

One `<ChangeIndicator>` instance:
- Line ~106: `label="1D"` → `label="1 DAY"`

## Out of scope

- Dashboard decorative chrome (gradient, rounded-[32px], shadow, DashboardSurface, "Hi, {userName}", etc.)
- Dashboard "Recap" uppercase label / description text
- Sheet-tab subtotals
- Row-level ▲/▼ indicators
- Column headers ("ASSET" / "VALUE")
- Section headers / footers
- Per-row day-change arrows

## Verification

- `pnpm tsc --noEmit` — same 10 pre-existing errors, no new
- `pnpm build` — clean
- Visual: `/portfolio/<id>` shows uppercase `ASSETS` eyebrow → hero number → `1 DAY +$… (…%)  1 YEAR …` in positive/negative color, no Lucide icons
- Visual: `/dashboard` stat cards + inline hero show same `1 DAY` / `1 YEAR` label treatment, no icons
- Visual: debts page change colors are inverted (debt going up = negative = red)
- Mobile: no layout breakage on narrow viewport
- No unit tests — pure restyle + dead-code deletion
