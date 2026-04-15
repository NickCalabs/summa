# Kubera visual parity — slice 2: sidebar

**Status**: Design
**Author**: Claude (with Nick)
**Date**: 2026-04-15
**Branch (target)**: `kubera/02-sidebar`
**Predecessors**: Slice 1 (PR #63, merged 2026-04-15 as commit `2686467`) — design tokens only.

## Context

Slice 1 established Kubera-aligned design tokens in `src/app/globals.css`: typography (`--font-size-nano`, `--font-size-micro`, `--letter-spacing-upper`, `--font-weight-tab`), layout (`--sidebar-width: 222px`, `--topbar-height`, `--row-height`, `--row-padding-x`, `--card-radius: 4px`), and an alpha-composed `--muted-foreground` pattern. No component was updated to consume these tokens.

The audit (`docs/kubera-audit/KUBERA-AUDIT-REPORT.md` §2.2, §10.1) flagged "sidebar aggregate value per item" as the first visible gap. Investigation during brainstorming confirmed the aggregate **values** were already wired in commit `ebd8303 feat: UX overhaul — modal account detail, category add flow, Kubera-style sidebar` — `activePortfolio.aggregates.{netWorth, totalAssets, totalDebts}` render alongside `Net Worth / Assets / Debts` via `MoneyDisplay`, reusing `usePortfolio(id)` (the same hook the dashboard and portfolio views consume — no refetch added).

What remains is the **visual chrome**: width, background, radius, active state, typography, uppercase micro-labels. Brand-level fidelity target is "Kubera-shape, Summa-chrome": match Kubera's layout, spacing, typography, and quietness while keeping Summa's Lucide icon set and using shadcn's `--sidebar*` tokens for theming.

## Scope

Restyle the single file `src/app/(app)/layout.tsx`. No logic changes — link targets, aggregate wiring, mobile-drawer behavior, portfolio-picker, sheet sub-lists, active-sheet detection all stay functionally identical. One branch (`kubera/02-sidebar`), one PR, no dependencies on other slices.

## Decisions (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| Q1 | **Kubera-shape, Summa-chrome** | 1:1 parity would erase Summa's identity; tokens-only would ship invisible plumbing. |
| Q2 | **Follow theme** (use shadcn `--sidebar*` tokens for both modes) | shadcn already defined dark + light sidebar values; swapping hardcoded colors to tokens is the low-cost right answer. |
| Q3 | **Faint tinted active state** (`bg-sidebar-accent`) | Closer to Kubera than solid-white inversion; consistent with shadcn conventions. |
| Q4 | **Keep current nav groups, restyle only** | Moving sheet sub-lists out (option c) is blocked on wiring the unused `SheetTabs` component into `portfolio-view`. Queue as a later slice. |
| Q5 | **No `Dashboard` sub-label under Net Worth** | Sub-label is decoration until siblings like Recap exist — add when they land. |
| Q6 | **Muted tabular aggregate** (`text-muted-foreground`, active goes full opacity) | Label is the thing; aggregate is the amount of the thing. Matches Kubera. |
| Q7 | **Restyle footer in place** | Avatar/user menu rework belongs to its own slice; version badge just needs `text-nano`. |

## File changes

Only one file: `src/app/(app)/layout.tsx`. No changes to `src/app/globals.css`. All targeted tokens were shipped in slice 1.

### Replacement map

| # | Current | Target |
|---|---|---|
| 1 | `<aside className="hidden md:flex w-60 flex-col bg-[#1E1E2E] text-white">` | `<aside className="hidden md:flex w-sidebar flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">` *(the `border-r` is a light-mode readability add — sidebar surface and page surface are both near-white, so we need a 1px delineator. Kubera's dark-theme capture shows no explicit border; ours is theme-agnostic and harmless in dark.)* |
| 2 | Mobile `Sheet`: `className="w-60 p-0 bg-[#1E1E2E] text-white border-none"` | `className="w-sidebar p-0 bg-sidebar text-sidebar-foreground border-none"` |
| 3 | `<Separator className="bg-white/10" />` (all instances) | `<Separator className="bg-sidebar-border" />` |
| 4 | `<p className="text-xs text-white/45">The balance sheet you actually own.</p>` | `<p className="text-xs text-sidebar-foreground/60">…</p>` |
| 5 | Nav item base: `rounded-xl px-3 py-2.5 text-sm transition-colors` | `rounded-card px-3 py-2 text-sm transition-colors` |
| 6 | Nav item inactive: `text-white/70 hover:bg-white/5 hover:text-white` | `text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground` |
| 7 | Nav item active (primary): `bg-white text-[#1E1E2E]` | `bg-sidebar-accent text-sidebar-foreground font-medium` |
| 8 | Portfolio picker active: `bg-white/10 text-white` | `bg-sidebar-accent/60 text-sidebar-foreground` |
| 9 | Aggregate `<MoneyDisplay className="text-sm tabular-nums" />` | `text-sm tabular-nums text-muted-foreground` by default; active state upgrades to `text-sidebar-foreground` via parent `group` class (see Active-aggregate mechanic below). `--muted-foreground` is technically calibrated against `--background` rather than `--sidebar`, but its alpha-composed pattern from slice 1 works off the current foreground color regardless; if preview reveals contrast issues, swap to `text-sidebar-foreground/50`. |
| 10 | Uppercase section labels: `px-2 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/35` | `px-2 py-1 text-nano font-medium uppercase tracking-upper text-sidebar-foreground/45` |
| 11 | `<ChevronRightIcon className="size-4 shrink-0 text-white/30" />` | `className="size-4 shrink-0 text-sidebar-foreground/40"` |
| 12 | Version badge `text-[10px] text-white/25 font-mono` | `text-nano text-sidebar-foreground/30 font-mono` |
| 13 | Theme/logout icon colors: `text-white/60 hover:text-white hover:bg-white/5` | `text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50` |

### Active-aggregate mechanic

The primary nav `Link` conditionally applies active or inactive classes. To let the child `MoneyDisplay`'s text color respond to that state without prop drilling, add `group` to every primary `Link` and `active-nav` to the active branch only:

```tsx
<Link
  className={`group flex items-center justify-between rounded-card px-3 py-2 text-sm transition-colors ${
    isActive
      ? "active-nav bg-sidebar-accent text-sidebar-foreground font-medium"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
  }`}
>
  <span className="flex items-center gap-3">…</span>
  <MoneyDisplay className="text-sm tabular-nums text-muted-foreground group-[.active-nav]:text-sidebar-foreground" … />
</Link>
```

If Tailwind's arbitrary-group-variant (`group-[.active-nav]:`) proves fragile at preview time, fallback: promote the active branch into a small wrapper component that passes an explicit `isActive` prop to `MoneyDisplay` (or accepts a `textClass` override). Either works; the group approach is preferred because it keeps the change local to the JSX we're already rewriting.

### Token fallback strategy

`w-sidebar`, `rounded-card`, `text-nano`, `tracking-upper` are expected to be generated as Tailwind utilities via slice 1's `@theme` block. If any are missing at build time, swap that one utility to its raw CSS var (e.g. `w-[var(--sidebar-width)]`) in-place and open a quick slice-1 addendum PR adding it to `@theme`. Do not inline fixed values.

## Out of scope

Documented so they don't sneak in:

- Wiring `SheetTabs` into `portfolio-view` (precondition for sidebar sheet sub-list removal).
- Removing Asset Sheets / Debt Sheets sub-lists from sidebar (option c from Q4).
- Adding a `Dashboard` sub-label under Net Worth (option a from Q5).
- Adding an avatar/user menu and tucking logout inside it (option b from Q7).
- Tuning dark-mode `--sidebar` token toward Kubera's rgb(21,21,21) — current value `oklch(0.205 0 0)` is lighter. If it reads wrong in preview, open a separate one-line follow-up PR; don't do it in this slice.
- Moving `Import` link out of primary nav.
- Any asset table, section, sheet-tab, or page-header changes.

## Verification

- `pnpm tsc --noEmit` — clean.
- `pnpm build` — clean, no missing-utility warnings.
- Light-mode visual: `http://localhost:3100` (dev) reads as a light surface sidebar adjacent to near-white page body; separator visible as a thin `--sidebar-border`.
- Dark-mode visual: theme toggle flips sidebar to dark surface, contrast holds, no hardcoded colors visible.
- Active state: clicking `Net Worth`, `Assets`, `Debts` each paints `bg-sidebar-accent` and lifts the aggregate to full opacity.
- Mobile drawer: viewport <768px, hamburger opens drawer with identical styling to desktop sidebar.
- Regression: `/settings`, `/settings/connections`, `/import/kubera`, `/portfolio/dc66233a-7ac5-4cde-a388-e387e9979e5a` all render without layout breakage; sidebar aggregates still numerically match dashboard stat cards.

No unit tests — pure restyle. If a test becomes necessary, the slice has over-scoped.

## Follow-ups logged

For later slices, in rough priority order:

1. Wire the already-built `SheetTabs` component into `portfolio-view` (unblocks sidebar sheet-sub-list removal).
2. Tune dark-mode `--sidebar` toward Kubera's near-black if preview reveals the gap.
3. Remove sidebar sheet sub-lists once #1 lands.
4. Move `Import` out of primary nav into a contextual location.
5. Avatar/user menu with tucked logout.
6. `Dashboard` sub-label under Net Worth once Recap or a sibling sub-view lands.
