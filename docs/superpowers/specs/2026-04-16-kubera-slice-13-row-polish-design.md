# Slice 13 — Asset-table row polish + one-click detail open

**Date:** 2026-04-16
**Branch:** `kubera/13-row-polish`
**Audit references:** §4.5 rows, §4.6 section footer

## Motivation

Two pain points, narrow and related:

1. **Mobile asset rows are cluttered.** At 375px the name cell, holdings pill, value, and `⋮` menu all compete for horizontal space, forcing awkward wrapping. The column header row (`ASSET / VALUE`) adds vertical weight that Kubera's mobile UI doesn't have.
2. **Opening an account's detail panel takes two taps** (`⋮` → `Open account`). Every other row-level operation in Summa is one click/tap — the detail panel is the odd one out.

## Scope

In scope:

- Hide the column header row on mobile (`< md`).
- Hide the parent-row `[N holdings]` chip on mobile.
- Simplify the mobile trailing cell: `[⋮]` menu only.
- Make the whole row tap-to-open-detail on mobile. Disable name/value inline edits on mobile (touch-first; edits happen in the detail panel).
- Add a dedicated open icon (`[↗]`, two horizontal lines per Kubera §4.5 convention) in the desktop trailing cell, before `[⋮]`. Desktop keeps inline edits on name/value.
- Chevron on parent rows continues to toggle expand (via `stopPropagation`) — takes priority over row-tap.

Out of scope (explicitly deferred to slice 14+):

- Per-row day-change ▲/▼ arrow (needs per-asset snapshot data).
- Per-row warning ⚠ icon when `staleDays` exceeds threshold.
- Mobile footer color change. Keeping `bg-neutral-500 text-white` everywhere — decided against mobile-only lightening after seeing it side-by-side.
- Available-credit pill wiring on credit-card rows (needs `availableCredit` metadata work).
- Top-bar search / USD selector / avatar cluster.

## Design

### Responsive breakpoint

All conditional rendering uses Tailwind's `md` breakpoint (768px). Below `md` = mobile; at or above `md` = desktop. Matches every prior Kubera slice.

### Row interaction matrix

| Target                    | Mobile (`< md`)                       | Desktop (`md+`)                       |
| ------------------------- | ------------------------------------- | ------------------------------------- |
| Tap/click row body        | Opens `DetailPanel`                   | No row-level click handler            |
| Tap/click name text       | Opens `DetailPanel` (row body inherits) | `startEdit("name")` (inline rename)  |
| Tap/click value cell      | Opens `DetailPanel` (row body inherits) | `startEdit("currentValue")`          |
| Tap/click chevron (parent)| Toggles expand (`stopPropagation`)    | Toggles expand                        |
| Tap/click `[↗]` open icon | Not rendered                          | Opens `DetailPanel`                   |
| Tap/click `[⋮]` menu      | Opens row actions menu                | Opens row actions menu                |
| Child row                 | Opens child `DetailPanel` (today)     | Opens child `DetailPanel` (today)    |

### Trailing cell

- Mobile: `[⋮]`
- Desktop: `[↗] [⋮]`

The `[↗]` icon is a simple two-horizontal-lines glyph (approved in preview variant C). Sized the same as the existing `⋮` icon (`h-7 w-7`, `size-3.5` stroke).

### Column header

Wrap the `<thead>` in a mobile-hidden class. Prefer a conditional on the `<tr>`:

```tsx
<tr className="hidden md:table-row border-b border-border">
  {/* existing header cells */}
</tr>
```

The `<thead>` element stays, so table semantics remain correct.

### Holdings chip

The `[N holdings]` span in the name cell gets `hidden md:inline-flex` so it's suppressed below `md`. The chevron remains visible and still expands.

### Row click wiring

On the `<tr>` inside the data row (not the header, not child rows), add:

```tsx
<tr
  className="... cursor-pointer md:cursor-default"
  onClick={() => { if (isMobileViewport) openAccountDetail(portfolioId, asset.id); }}
>
```

**Mobile detection:** use a CSS approach, not a JS matchMedia hook, to avoid hydration issues. Approach:

- Add the `onClick` unconditionally.
- Inside it, bail out if `window.matchMedia("(min-width: 768px)").matches` — i.e., we're on desktop and the handler should not fire.
- Or, gate via CSS: set `pointer-events-none md:pointer-events-auto` on the overlay, but that interferes with child elements. The `matchMedia` bail-out is cleaner.

Cells that need to suppress row-tap on desktop (name, value) keep their existing `e.stopPropagation()`. On mobile, those same cells' onClick becomes a no-op (see next section), so stopPropagation is moot — the row-level handler runs and opens the panel.

### Disabling inline edit on mobile

The current code path in `asset-table.tsx` calls `startEdit("name")` on name-span click and `startEdit("currentValue")` on value-cell click. On mobile we want taps on these elements to fall through to the row-level open-detail handler.

Approach:

- Wrap each `startEdit` call in the same `matchMedia` check. If mobile, return early (let the row handler open detail). If desktop, preserve today's behavior.
- `e.stopPropagation()` on these elements stays — we want it on desktop (so row onClick doesn't fire) but on mobile the row handler needs to fire. Solution: move the `stopPropagation()` call inside the same desktop-only branch.

```tsx
onClick={(e) => {
  if (!window.matchMedia("(min-width: 768px)").matches) return;
  e.stopPropagation();
  startEdit(asset.id, "name");
}}
```

On mobile, `return` early without stopPropagation — the click bubbles to the row's handler, which opens detail.

### Footer

No change. `<tfoot>` keeps `bg-neutral-500 text-white`.

## Files touched

Just one:

- `src/components/portfolio/asset-table.tsx`

Specifically:

1. Header `<tr>` — add `hidden md:table-row`.
2. Name-cell holdings chip — add `hidden md:inline-flex`.
3. Name-cell click handler — gate `startEdit` + `stopPropagation` behind desktop-only check.
4. Value-cell click handler — same gate.
5. Data-row `<tr>` — add `onClick` that opens detail on mobile only.
6. Actions column cell — render `[↗]` open icon in `hidden md:flex` wrapper alongside `[⋮]`.
7. Actions column cell — ensure `[⋮]` still renders on all viewports.

No other files. No hook changes. No store changes. No DB changes.

### Desktop parent vs. child rows

Child rows are already whole-row clickable on all viewports (today's behavior, unchanged). On desktop, parent rows are **not** whole-row clickable — they need the `[↗]` open icon. This asymmetry exists today in a milder form and is acceptable: parent rows on desktop have many interactive sub-elements (chevron, holdings chip, `[⋮]`) that would conflict with row-level tap targeting.

## Cleanup before merge

Two temporary artifacts were added during brainstorming and must be removed as part of this slice:

- `src/app/preview/slice-13/page.tsx` — the comparison preview page. Delete.
- `src/middleware.ts` — revert the `/preview` entry added to `publicPaths`.

## Verification

Manual, on :3100 (HMR) with browser devtools:

1. **Desktop (1440px):**
   - Column header row visible.
   - Name hover highlights, click inline-edits name.
   - Value hover highlights, click inline-edits value.
   - Trailing cluster shows `[↗] [⋮]`. `[↗]` click opens panel. `[⋮]` opens menu.
   - Row body click does nothing.
   - Parent chevron click expands children.

2. **Mobile (375px via devtools):**
   - Column header row hidden.
   - Holdings chip hidden on parent rows.
   - Trailing cell shows `[⋮]` only.
   - Tap anywhere on row opens detail panel.
   - Tap on name / value does not inline-edit; opens detail.
   - Parent chevron tap expands children (does not open detail).
   - Child row tap opens child detail (unchanged).

3. **Regression checks:**
   - Delete via `⋮ → Delete` still confirms + archives.
   - Move Up / Move Down still reorders.
   - Archive still archives.
   - Disconnected (stale) rows still render italic + `(disconnected)` sub-line.
   - Footer `+ Add Asset` / total still renders, opens add flow.
   - Debts sheet behaves identically to Assets.

## Open questions

None — design locked after three rounds of clarification. Spec ready for plan.
