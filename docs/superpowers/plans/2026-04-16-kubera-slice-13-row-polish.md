# Kubera Slice 13 — Row Polish + One-Click Detail Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide mobile-only UI chrome in `asset-table.tsx`, gate inline edits to desktop-only, open the detail panel in one tap on mobile, and add a desktop-only `[↗]` open icon that opens the detail panel in one click.

**Architecture:** All behavior lives inside a single file (`src/components/portfolio/asset-table.tsx`). Responsive behavior uses the `md` (768px) Tailwind breakpoint. Runtime mobile detection in event handlers uses `window.matchMedia("(min-width: 768px)")` to avoid hydration mismatches — `matchMedia` only runs at click-time, not during render.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, TanStack Query/Table, Tailwind CSS, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-04-16-kubera-slice-13-row-polish-design.md`

---

## Pre-work

### Task 0: Create branch

- [ ] **Step 1: Verify clean tree**

```bash
cd /opt/summa
git status --short
```

Expected: only pre-existing untracked files (the `docs/kubera-audit/`, `docs/smoke-test-*`, `docs/superpowers/plans/...` already there) + the uncommitted changes from the preview scaffolding (`src/app/preview/slice-13/`, modified `src/middleware.ts`). No other uncommitted work.

- [ ] **Step 2: Create branch off master**

```bash
git checkout -b kubera/13-row-polish
```

Expected: `Switched to a new branch 'kubera/13-row-polish'`.

---

## Task 1: Hide the column header row on mobile

**Files:**
- Modify: `src/components/portfolio/asset-table.tsx` (header `<tr>` around line 624)

- [ ] **Step 1: Define the verification**

Load `http://localhost:3100/portfolio/dc66233a-7ac5-4cde-a388-e387e9979e5a` in devtools. At desktop width (≥ 768px), the `ASSET / VALUE` header row is visible. At mobile width (< 768px), it is hidden; rows start immediately below the section header card.

- [ ] **Step 2: Edit the header `<tr>`**

Locate the block rendering table headers (currently `<tr key={headerGroup.id} className="border-b border-border">`). Change the className to add the responsive hide:

```tsx
<tr key={headerGroup.id} className="hidden md:table-row border-b border-border">
```

- [ ] **Step 3: Verify in browser**

Desktop viewport: header visible. Resize to mobile: header disappears.

- [ ] **Step 4: Commit**

```bash
git add src/components/portfolio/asset-table.tsx
git -c commit.gpgsign=false commit -m "style(portfolio): hide ASSET/VALUE column header on mobile"
```

---

## Task 2: Hide the parent-row holdings chip on mobile

**Files:**
- Modify: `src/components/portfolio/asset-table.tsx` (holdings chip span around line 322)

- [ ] **Step 1: Define the verification**

On mobile, parent rows (e.g., "Fidelity" with 15 holdings) render without the `15 holdings` pill beside the name. The chevron still expands. On desktop, the pill is unchanged.

- [ ] **Step 2: Edit the holdings chip span**

Locate the `<span>` rendering `{asset.children?.length ?? 0} holding{s}`. It currently has:

```tsx
className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0 cursor-pointer"
```

Change to:

```tsx
className="hidden md:inline-flex items-center text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0 cursor-pointer"
```

- [ ] **Step 3: Verify**

Mobile: chip gone, name + chevron only. Desktop: chip still visible.

- [ ] **Step 4: Commit**

```bash
git add src/components/portfolio/asset-table.tsx
git -c commit.gpgsign=false commit -m "style(portfolio): hide parent-row holdings chip on mobile"
```

---

## Task 3: Gate inline-edit click handlers behind desktop-only

**Files:**
- Modify: `src/components/portfolio/asset-table.tsx` (name-span `onClick` around line 290, value-cell `onClick` around line 411)

- [ ] **Step 1: Define the verification**

Desktop: clicking the asset name still enters inline-rename mode. Clicking the value still enters inline-edit mode. Mobile: tapping the name does NOT enter rename mode; tapping the value does NOT enter edit mode. (The next task wires the row-level onClick that opens the detail panel — this task just ensures name/value clicks don't hijack touch events.)

- [ ] **Step 2: Edit the name `<span>` onClick**

Current:

```tsx
onClick={(e) => {
  e.stopPropagation();
  startEdit(asset.id, "name");
}}
```

Change to:

```tsx
onClick={(e) => {
  if (!window.matchMedia("(min-width: 768px)").matches) return;
  e.stopPropagation();
  startEdit(asset.id, "name");
}}
```

- [ ] **Step 3: Edit the value-cell onClick**

Find the `<div>` wrapping the value that has `onClick={() => startEdit(asset.id, "currentValue")}`. Change to:

```tsx
onClick={(e) => {
  if (!window.matchMedia("(min-width: 768px)").matches) return;
  e.stopPropagation();
  startEdit(asset.id, "currentValue");
}}
```

Note: the value-cell onClick currently doesn't take `e` — add the parameter. Also add `e.stopPropagation()` here so the row-level onClick (added in Task 4) doesn't fire on desktop when clicking the value cell.

- [ ] **Step 4: Verify on desktop**

Desktop: click name → inline input appears. Click value → inline input appears. Both commit on Enter / blur.

- [ ] **Step 5: Verify on mobile (devtools responsive)**

Mobile width: tap name → no inline input (will be wired to open detail in next task). Tap value → same.

- [ ] **Step 6: Commit**

```bash
git add src/components/portfolio/asset-table.tsx
git -c commit.gpgsign=false commit -m "refactor(portfolio): gate inline edits to desktop-only viewports"
```

---

## Task 4: Whole-row tap opens detail panel on mobile

**Files:**
- Modify: `src/components/portfolio/asset-table.tsx` (data-row `<tr>` around line 656)

- [ ] **Step 1: Define the verification**

Mobile: tapping anywhere on a data row opens the `DetailPanel` for that asset. Tapping the chevron on parent rows still toggles expand instead of opening detail. Tapping the `⋮` menu still opens the row actions menu. Desktop: no row-level click behavior (unchanged).

- [ ] **Step 2: Add onClick to the data-row `<tr>`**

Locate the `<tr className={...}>` inside `table.getRowModel().rows.map(...)` — it currently has no `onClick`. Add one:

```tsx
<tr
  className={`border-b border-border transition-colors hover:bg-muted/35 md:cursor-default cursor-pointer ${
    stale && asset.providerType !== "plaid" ? "opacity-60" : ""
  }`}
  onClick={() => {
    if (window.matchMedia("(min-width: 768px)").matches) return;
    openAccountDetail(portfolioId, asset.id);
  }}
>
```

- [ ] **Step 3: Verify chevron still stops propagation**

The chevron `<span>` (around line 275) already has `onClick={() => toggleExpand(asset.id)}`. It does NOT call `e.stopPropagation()`. On mobile, tapping the chevron would both toggle expand AND fire the row-level onClick (opening detail). That's a bug. Fix:

```tsx
<span
  className="text-muted-foreground shrink-0 -ml-1 cursor-pointer"
  onClick={(e) => {
    e.stopPropagation();
    toggleExpand(asset.id);
  }}
>
```

Do the same for the parallel chevron `<span>` rendered via the holdings chip (around line 324) — its onClick already calls `e.stopPropagation()`, so no change needed there. Verify by reading the code.

- [ ] **Step 4: Verify on mobile**

Mobile: tap row body → detail panel opens. Tap chevron on Fidelity → expands children, panel does NOT open. Tap `⋮` → menu opens, panel does NOT open. Tap child row → opens child detail (today's behavior).

- [ ] **Step 5: Verify on desktop**

Desktop: click row body → nothing (row's onClick short-circuits). Click name → inline rename. Click value → inline edit. Click `[⋮]` → menu. Chevron → expand.

- [ ] **Step 6: Commit**

```bash
git add src/components/portfolio/asset-table.tsx
git -c commit.gpgsign=false commit -m "feat(portfolio): tap-anywhere opens detail panel on mobile"
```

---

## Task 5: Add the desktop-only `[↗]` open icon

**Files:**
- Modify: `src/components/portfolio/asset-table.tsx` (actions column cell starting around line 467, also `MoreHorizontalIcon` helper at bottom of file)

- [ ] **Step 1: Define the verification**

Desktop: every data row's trailing cell shows two icons — a two-horizontal-lines icon (open) and the existing `⋮` menu. Clicking the open icon opens the detail panel. Clicking `⋮` still opens the actions menu. Mobile: only `⋮` is visible.

- [ ] **Step 2: Add an `OpenPanelIcon` helper**

At the bottom of the file, after `MoreHorizontalIcon`, add:

```tsx
function OpenPanelIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}
```

- [ ] **Step 3: Modify the actions-column `cell` renderer**

Currently the actions column renders:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger render={<Button ... />}>
    <MoreHorizontalIcon />
  </DropdownMenuTrigger>
  ...
</DropdownMenu>
```

Wrap this in a flex container and prepend the open icon button:

```tsx
<div className="flex items-center justify-end gap-0.5">
  <Button
    variant="ghost"
    size="icon"
    className="hidden md:inline-flex h-7 w-7 text-muted-foreground hover:text-foreground"
    onClick={(e) => {
      e.stopPropagation();
      openAccountDetail(portfolioId, asset.id);
    }}
    aria-label="Open details"
  >
    <OpenPanelIcon />
  </Button>
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        />
      }
    >
      <MoreHorizontalIcon />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      ...
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

Note the added `onClick={(e) => e.stopPropagation()}` on the trigger Button — this prevents the row-level onClick from firing when the user opens the menu on mobile (the row handler would also short-circuit on desktop). On mobile the trigger still opens the menu normally.

- [ ] **Step 4: Update the size hint for the actions column**

The column currently has `size: 40`. With two icons, update to `size: 72` so the column reserves enough width on desktop. Mobile still fits since `hidden md:inline-flex` hides the open icon.

```tsx
{
  id: "actions",
  size: 72,
  cell: ({ row }) => { ... },
},
```

- [ ] **Step 5: Verify on desktop**

Desktop: two icons visible on every row. Open icon → detail panel. `⋮` → menu. Name/value inline edit unchanged.

- [ ] **Step 6: Verify on mobile**

Mobile: only `⋮` visible. Row body tap still opens detail (from Task 4). Menu still works.

- [ ] **Step 7: Commit**

```bash
git add src/components/portfolio/asset-table.tsx
git -c commit.gpgsign=false commit -m "feat(portfolio): desktop trailing cell gets one-click open icon"
```

---

## Task 6: Remove brainstorming scaffolding

**Files:**
- Delete: `src/app/preview/slice-13/page.tsx`
- Revert: `src/middleware.ts` (`/preview` entry)

- [ ] **Step 1: Delete the preview page**

```bash
rm -rf src/app/preview/slice-13
rmdir src/app/preview 2>/dev/null || true
```

- [ ] **Step 2: Revert the middleware change**

Open `src/middleware.ts`. Change:

```ts
const publicPaths = ["/login", "/register", "/api/auth", "/api/health", "/api/plaid/webhook", "/preview"];
```

back to:

```ts
const publicPaths = ["/login", "/register", "/api/auth", "/api/health", "/api/plaid/webhook"];
```

- [ ] **Step 3: Verify the preview route is gone**

```bash
curl -sI http://localhost:3100/preview/slice-13 | head -1
```

Expected: `HTTP/1.1 307 Temporary Redirect` (middleware bounces unauthenticated preview URLs to login, confirming the preview path is no longer public).

Also verify with an authenticated request that the route truly 404s (optional — the file is deleted, so Next.js will 404 it regardless).

- [ ] **Step 4: Commit**

```bash
git add src/app/preview src/middleware.ts
git -c commit.gpgsign=false commit -m "chore(kubera): remove slice-13 preview scaffolding"
```

Note: `git add src/app/preview` stages the deletion of the directory. If the path no longer exists on disk, git handles the deletion. Double-check with `git status` before the commit.

---

## Task 7: Build + deploy + smoke test

- [ ] **Step 1: Build**

```bash
cd /opt/summa
pnpm build 2>&1 | tail -20
```

Expected: build completes. No `/preview/slice-13` route in the final route table.

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "style(portfolio): hide mobile chrome + one-click detail open" --body "$(cat <<'EOF'
## Summary

- Hide the ASSET/VALUE column header row on mobile
- Hide the parent-row holdings chip on mobile
- Whole-row tap opens the detail panel on mobile (name/value inline edits are desktop-only)
- Desktop trailing cell adds a one-click `[↗]` open icon next to the `[⋮]` menu
- Footer `+ ADD ASSET` bar unchanged (dark gray stays on both breakpoints)

Spec: `docs/superpowers/specs/2026-04-16-kubera-slice-13-row-polish-design.md`

## Test plan

- [ ] Desktop (≥ 768px): column header visible; holdings chip visible; name/value click inline-edits; trailing cluster `[↗] [⋮]`; `[↗]` opens detail panel; `[⋮]` opens row-actions menu; row body click does nothing.
- [ ] Mobile (< 768px): column header hidden; holdings chip hidden; tap row body opens detail; tap name/value opens detail (no inline edit); tap chevron on parent expands children without opening detail; tap `[⋮]` opens menu without opening detail; child row tap opens child detail (unchanged).
- [ ] Regression: delete, archive, move-up/down, move-to-section, add-asset footer, debts sheet all still work.
EOF
)"
```

- [ ] **Step 3: Wait for PR review + merge**

After human approval:

```bash
PR_NUM=$(gh pr view --json number -q .number)
gh pr merge $PR_NUM --squash --delete-branch
gh pr view $PR_NUM --json state -q .state
```

Expected: `MERGED`. If not MERGED, stop and diagnose — do not proceed to pull.

- [ ] **Step 4: Pull + build + restart prod**

```bash
git checkout master
git pull --ff-only
pnpm install
pnpm build 2>&1 | tail -5
sudo systemctl restart summa
sleep 3
systemctl is-active summa
curl -sI http://localhost:3000/login | head -1
```

Expected: `active`, `HTTP/1.1 200 OK`.

- [ ] **Step 5: Final prod smoke**

Open `http://192.168.1.244:3000/dashboard` in your browser at both desktop and mobile widths. Walk through the manual verification steps from Task 7 Step 2 against prod.

---

## Self-Review Notes

**Spec coverage:** All seven change bullets from the spec's "Files touched" section map to tasks 1–5. Cleanup (preview file + middleware revert) is task 6. Verification is task 7.

**Type consistency:** `OpenPanelIcon` is defined once and referenced once. `openAccountDetail(portfolioId, asset.id)` is called consistently — the same signature already used elsewhere in the file (name is stable, no aliasing).

**Placeholders:** None — every code block contains the full content the engineer needs.
