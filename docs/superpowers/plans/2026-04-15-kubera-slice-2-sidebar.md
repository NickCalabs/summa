# Kubera Visual Parity — Slice 2: Sidebar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the left sidebar in `src/app/(app)/layout.tsx` to consume slice-1's design tokens and match Kubera's visual shape (layout, spacing, typography, active-state restraint) while keeping Summa's Lucide icon set and shadcn's `--sidebar*` theming.

**Architecture:** Single-file, pure-restyle change. No logic, hook, route, or component-surface changes. Hardcoded colors (`#1E1E2E`, `text-white`, `bg-white/*`) swap to shadcn sidebar tokens (`bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, `bg-sidebar-border`); hardcoded sizing (`w-60`, `rounded-xl`, `text-[10px]`, `text-[11px]`, `tracking-[0.22em]`) swaps to slice-1 tokens (`w-sidebar`, `rounded-card`, `text-nano`, `tracking-upper`). Active primary-nav items paint with `bg-sidebar-accent` instead of solid white; the aggregate value is muted by default and lifts to full opacity when its parent `Link` is active via a Tailwind `group-[.active-nav]:` variant.

**Tech Stack:** Next.js 15 App Router (client component), Tailwind 4 with slice-1 `@theme` utility extensions, shadcn/ui sidebar tokens, Lucide icons, React `usePathname` + `useSearchParams`.

**Reference:** `docs/superpowers/specs/2026-04-15-kubera-slice-2-sidebar-design.md`, `docs/kubera-audit/KUBERA-AUDIT-REPORT.md` §2.2 and §10.1.

---

## File structure

One file touched:
- **Modify**: `src/app/(app)/layout.tsx` — the sidebar JSX in `SidebarContent`, the desktop `<aside>` wrapper in `AppLayoutInner`, the mobile `SheetContent` wrapper, and the `VersionBadge` helper.

No new files. No other files touched. No changes to `src/app/globals.css`.

---

## Setup

### Task 0: Branch and baseline

**Files:** none (git + filesystem only)

- [ ] **Step 1: Confirm master is synced and clean of in-progress work**

```bash
cd /opt/summa
git checkout master
git pull --ff-only
git status --short
git log --oneline -3
```

Expected: current branch `master`, head is the slice-2 spec commit `3b67898 docs(kubera): spec for slice 2 — sidebar visual parity`, plus slice-1 commit `2686467 style(tokens): Kubera visual parity slice 1 — design tokens (#63)`. Working tree may have untracked files (`.next.new/`, stash list entries, `docs/smoke-test-2026-04-10.md`, `docs/kubera-audit/`) — leave them alone. **Do not `git add -A`.**

- [ ] **Step 2: Create the slice-2 branch off master**

```bash
git checkout -b kubera/02-sidebar
```

Expected: switched to new branch `kubera/02-sidebar`.

- [ ] **Step 3: Verify slice-1 tokens compile into Tailwind utilities**

The plan relies on `w-sidebar`, `rounded-card`, `text-nano`, `tracking-upper`, `bg-sidebar`, `bg-sidebar-accent`, `text-sidebar-foreground`, `bg-sidebar-border` all being valid Tailwind utilities. Check them in the CSS:

```bash
grep -n -E '^\s*--(text-nano|tracking-upper|spacing-sidebar|radius-card|color-sidebar[^-]|color-sidebar-foreground|color-sidebar-accent|color-sidebar-border):' src/app/globals.css
```

Expected: 8 lines in the `@theme inline` block mapping each slice-1 CSS var to its utility prefix. If any line is missing, stop and flag — the plan assumes slice 1 is complete.

- [ ] **Step 4: Capture a baseline screenshot or note of the current sidebar**

Open `http://localhost:3000` (the running prod :3000, which serves pre-slice-2 master). Note the current visual: purple-navy sidebar, solid-white active state on the current page's link, rounded-16px nav items. This is what we're changing — keep a mental or screenshotted record for the PR description.

No commit — branch baseline only.

---

## Task 1: Outer chrome — desktop aside + mobile drawer + header + separators

**Files:**
- Modify: `src/app/(app)/layout.tsx`

This task migrates the outermost sidebar containers and the internal separator rules. It does not touch nav items yet — those are Task 2+.

- [ ] **Step 1: Update the desktop `<aside>` element**

Find (around line 394):

```tsx
<aside className="hidden md:flex w-60 flex-col bg-[#1E1E2E] text-white">
```

Replace with:

```tsx
<aside className="hidden md:flex w-sidebar flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
```

- [ ] **Step 2: Update the mobile `SheetContent` className**

Find (around line 439):

```tsx
<SheetContent
  side="left"
  className="w-60 p-0 bg-[#1E1E2E] text-white border-none"
  showCloseButton={false}
>
```

Replace the className with:

```tsx
  className="w-sidebar p-0 bg-sidebar text-sidebar-foreground border-none"
```

(Keep `side="left"` and `showCloseButton={false}` as-is.)

- [ ] **Step 3: Update the header block inside `SidebarContent`**

Find (around line 118):

```tsx
<div className="p-5 space-y-1">
  <h1 className="text-xl font-bold tracking-tight">Summa</h1>
  <p className="text-xs text-white/45">The balance sheet you actually own.</p>
</div>
```

Replace with:

```tsx
<div className="p-5 space-y-1">
  <h1 className="text-xl font-bold tracking-tight">Summa</h1>
  <p className="text-xs text-sidebar-foreground/60">The balance sheet you actually own.</p>
</div>
```

- [ ] **Step 4: Replace all `<Separator className="bg-white/10" />` with sidebar-token version**

There are four instances in this file (grep to find them):

```bash
grep -n 'bg-white/10' src/app/(app)/layout.tsx
```

Expected output: 4 lines. For each, change:

```tsx
<Separator className="bg-white/10" />
```

to:

```tsx
<Separator className="bg-sidebar-border" />
```

And for the `my-4 bg-white/10` variants (multiple `<Separator className="my-4 bg-white/10" />` in the middle of the nav), change to:

```tsx
<Separator className="my-4 bg-sidebar-border" />
```

After this step, `grep -n 'bg-white/10' src/app/(app)/layout.tsx` should return no results.

- [ ] **Step 5: Typecheck**

```bash
cd /opt/summa
pnpm tsc --noEmit
```

Expected: clean exit, no errors.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(app)/layout.tsx'
git commit -m "style(sidebar): migrate outer chrome + separators to sidebar tokens"
```

---

## Task 2: Primary nav (Net Worth / Assets / Debts) + active-aggregate mechanic

**Files:**
- Modify: `src/app/(app)/layout.tsx`

The three primary nav items (Net Worth, Assets, Debts) live inside the `activePortfolio &&` block starting around line 127. Each is a `<Link>` with a conditional className for active state and a `<MoneyDisplay>` for the aggregate. This task restyles all three uniformly.

- [ ] **Step 1: Rewrite the Net Worth link**

Find (around line 130–149):

```tsx
<Link
  href="/dashboard"
  onClick={onNavigate}
  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
    pathname === "/dashboard"
      ? "bg-white text-[#1E1E2E]"
      : "text-white/70 hover:bg-white/5 hover:text-white"
  }`}
>
  <span className="flex items-center gap-3">
    <LayoutGridIcon className="size-4" />
    Net Worth
  </span>
  <MoneyDisplay
    amount={activePortfolio.aggregates.netWorth}
    currency={activePortfolio.currency}
    btcUsdRate={activePortfolio.btcUsdRate}
    className="text-sm tabular-nums"
  />
</Link>
```

Replace with:

```tsx
<Link
  href="/dashboard"
  onClick={onNavigate}
  className={`group flex items-center justify-between rounded-card px-3 py-2 text-sm transition-colors ${
    pathname === "/dashboard"
      ? "active-nav bg-sidebar-accent text-sidebar-foreground font-medium"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
  }`}
>
  <span className="flex items-center gap-3">
    <LayoutGridIcon className="size-4" />
    Net Worth
  </span>
  <MoneyDisplay
    amount={activePortfolio.aggregates.netWorth}
    currency={activePortfolio.currency}
    btcUsdRate={activePortfolio.btcUsdRate}
    className="text-sm tabular-nums text-muted-foreground group-[.active-nav]:text-sidebar-foreground"
  />
</Link>
```

- [ ] **Step 2: Rewrite the Assets link**

Find (around line 151–176):

```tsx
<Link
  href={
    firstAssetSheetId
      ? `/portfolio/${activePortfolio.id}?sheet=${firstAssetSheetId}`
      : `/portfolio/${activePortfolio.id}`
  }
  onClick={onNavigate}
  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
    pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
    activeSheetId &&
    assetSheets.some((s) => s.id === activeSheetId)
      ? "bg-white text-[#1E1E2E]"
      : "text-white/70 hover:bg-white/5 hover:text-white"
  }`}
>
  <span className="flex items-center gap-3">
    <WalletCardsIcon className="size-4" />
    Assets
  </span>
  <MoneyDisplay
    amount={activePortfolio.aggregates.totalAssets}
    currency={activePortfolio.currency}
    btcUsdRate={activePortfolio.btcUsdRate}
    className="text-sm tabular-nums"
  />
</Link>
```

Replace with:

```tsx
<Link
  href={
    firstAssetSheetId
      ? `/portfolio/${activePortfolio.id}?sheet=${firstAssetSheetId}`
      : `/portfolio/${activePortfolio.id}`
  }
  onClick={onNavigate}
  className={`group flex items-center justify-between rounded-card px-3 py-2 text-sm transition-colors ${
    pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
    activeSheetId &&
    assetSheets.some((s) => s.id === activeSheetId)
      ? "active-nav bg-sidebar-accent text-sidebar-foreground font-medium"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
  }`}
>
  <span className="flex items-center gap-3">
    <WalletCardsIcon className="size-4" />
    Assets
  </span>
  <MoneyDisplay
    amount={activePortfolio.aggregates.totalAssets}
    currency={activePortfolio.currency}
    btcUsdRate={activePortfolio.btcUsdRate}
    className="text-sm tabular-nums text-muted-foreground group-[.active-nav]:text-sidebar-foreground"
  />
</Link>
```

- [ ] **Step 3: Rewrite the Debts link**

Find (around line 178–203):

```tsx
<Link
  href={
    firstDebtSheetId
      ? `/portfolio/${activePortfolio.id}?sheet=${firstDebtSheetId}`
      : `/portfolio/${activePortfolio.id}?type=debts`
  }
  onClick={onNavigate}
  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
    pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
    activeSheetId &&
    debtSheets.some((s) => s.id === activeSheetId)
      ? "bg-white text-[#1E1E2E]"
      : "text-white/70 hover:bg-white/5 hover:text-white"
  }`}
>
  <span className="flex items-center gap-3">
    <LandmarkIcon className="size-4" />
    Debts
  </span>
  <MoneyDisplay
    amount={activePortfolio.aggregates.totalDebts}
    currency={activePortfolio.currency}
    btcUsdRate={activePortfolio.btcUsdRate}
    className="text-sm tabular-nums"
  />
</Link>
```

Replace with:

```tsx
<Link
  href={
    firstDebtSheetId
      ? `/portfolio/${activePortfolio.id}?sheet=${firstDebtSheetId}`
      : `/portfolio/${activePortfolio.id}?type=debts`
  }
  onClick={onNavigate}
  className={`group flex items-center justify-between rounded-card px-3 py-2 text-sm transition-colors ${
    pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
    activeSheetId &&
    debtSheets.some((s) => s.id === activeSheetId)
      ? "active-nav bg-sidebar-accent text-sidebar-foreground font-medium"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
  }`}
>
  <span className="flex items-center gap-3">
    <LandmarkIcon className="size-4" />
    Debts
  </span>
  <MoneyDisplay
    amount={activePortfolio.aggregates.totalDebts}
    currency={activePortfolio.currency}
    btcUsdRate={activePortfolio.btcUsdRate}
    className="text-sm tabular-nums text-muted-foreground group-[.active-nav]:text-sidebar-foreground"
  />
</Link>
```

- [ ] **Step 4: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(app)/layout.tsx'
git commit -m "style(sidebar): restyle primary nav + muted aggregates"
```

---

## Task 3: Secondary nav (Settings / Connections / Import) + empty-state dashboard link

**Files:**
- Modify: `src/app/(app)/layout.tsx`

Three secondary-nav Links (Settings, Connections, Import) live below the separator and use the same `bg-white text-[#1E1E2E]` active pattern. There's also a fallback Dashboard Link that renders when there's no active portfolio, with the same styling pattern. This task migrates all four.

- [ ] **Step 1: Rewrite the Settings link**

Find (around line 211–223):

```tsx
<Link
  href="/settings"
  onClick={onNavigate}
  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
    pathname === "/settings"
      ? "bg-white text-[#1E1E2E]"
      : "text-white/70 hover:bg-white/5 hover:text-white"
  }`}
>
  <SettingsIcon className="size-4" />
  Settings
</Link>
```

Replace with:

```tsx
<Link
  href="/settings"
  onClick={onNavigate}
  className={`flex items-center gap-3 rounded-card px-3 py-2 text-sm transition-colors ${
    pathname === "/settings"
      ? "bg-sidebar-accent text-sidebar-foreground font-medium"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
  }`}
>
  <SettingsIcon className="size-4" />
  Settings
</Link>
```

Note: no `group`/`active-nav` needed — secondary nav has no aggregate.

- [ ] **Step 2: Rewrite the Connections link**

Find (around line 224–235) and replace using the same pattern:

```tsx
<Link
  href="/settings/connections"
  onClick={onNavigate}
  className={`flex items-center gap-3 rounded-card px-3 py-2 text-sm transition-colors ${
    pathname === "/settings/connections"
      ? "bg-sidebar-accent text-sidebar-foreground font-medium"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
  }`}
>
  <PlugIcon className="size-4" />
  Connections
</Link>
```

- [ ] **Step 3: Rewrite the Import link**

Find (around line 236–247) and replace:

```tsx
<Link
  href="/import/kubera"
  onClick={onNavigate}
  className={`flex items-center gap-3 rounded-card px-3 py-2 text-sm transition-colors ${
    pathname === "/import/kubera"
      ? "bg-sidebar-accent text-sidebar-foreground font-medium"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
  }`}
>
  <UploadIcon className="size-4" />
  Import
</Link>
```

- [ ] **Step 4: Rewrite the empty-state Dashboard link**

Find (around line 250–268):

```tsx
{!activePortfolio && (
  <>
    <Separator className="my-4 bg-white/10" />
    <nav className="space-y-1">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
          pathname === "/dashboard"
            ? "bg-white text-[#1E1E2E]"
            : "text-white/70 hover:bg-white/5 hover:text-white"
        }`}
      >
        <LayoutGridIcon className="size-4" />
        Dashboard
      </Link>
    </nav>
  </>
)}
```

Replace with (note: the separator should already be fixed from Task 1 step 4; this is the Link only):

```tsx
{!activePortfolio && (
  <>
    <Separator className="my-4 bg-sidebar-border" />
    <nav className="space-y-1">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={`flex items-center gap-3 rounded-card px-3 py-2 text-sm transition-colors ${
          pathname === "/dashboard"
            ? "bg-sidebar-accent text-sidebar-foreground font-medium"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        }`}
      >
        <LayoutGridIcon className="size-4" />
        Dashboard
      </Link>
    </nav>
  </>
)}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(app)/layout.tsx'
git commit -m "style(sidebar): restyle secondary nav to sidebar tokens"
```

---

## Task 4: Portfolio picker + sheet sub-lists + uppercase section labels

**Files:**
- Modify: `src/app/(app)/layout.tsx`

Three uppercase section labels (`Portfolio`, `Asset Sheets`, `Debt Sheets`) and their child Links for the portfolio picker and per-sheet navigation. The portfolio picker uses a slightly different active treatment (`bg-white/10` — subtler than primary nav). Sheet sub-list items don't have an active fill today but inherit hover styles.

- [ ] **Step 1: Rewrite the `Portfolio` section label**

Find (around line 274):

```tsx
<p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/35">
  Portfolio
</p>
```

Replace with:

```tsx
<p className="px-2 py-1 text-nano font-medium uppercase tracking-upper text-sidebar-foreground/45">
  Portfolio
</p>
```

- [ ] **Step 2: Rewrite the portfolio picker Link**

Find (around line 286–300):

```tsx
<Link
  key={p.id}
  href={`/portfolio/${p.id}`}
  onClick={onNavigate}
  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
    isActive
      ? "bg-white/10 text-white"
      : "text-white/65 hover:bg-white/5 hover:text-white"
  }`}
>
  <span className="truncate">{p.name}</span>
  <ChevronRightIcon className="size-4 shrink-0 text-white/30" />
</Link>
```

Replace with:

```tsx
<Link
  key={p.id}
  href={`/portfolio/${p.id}`}
  onClick={onNavigate}
  className={`flex items-center justify-between rounded-card px-3 py-2 text-sm transition-colors ${
    isActive
      ? "bg-sidebar-accent/60 text-sidebar-foreground"
      : "text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
  }`}
>
  <span className="truncate">{p.name}</span>
  <ChevronRightIcon className="size-4 shrink-0 text-sidebar-foreground/40" />
</Link>
```

- [ ] **Step 3: Rewrite the `Asset Sheets` section label**

Find (around line 308):

```tsx
<p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/35">
  Asset Sheets
</p>
```

Replace with:

```tsx
<p className="px-2 py-1 text-nano font-medium uppercase tracking-upper text-sidebar-foreground/45">
  Asset Sheets
</p>
```

- [ ] **Step 4: Rewrite the asset-sheet Links**

Find (around line 312–327):

```tsx
<Link
  key={sheet.id}
  href={`/portfolio/${activePortfolio.id}?sheet=${sheet.id}`}
  onClick={onNavigate}
  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
    pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
    activeSheetId === sheet.id
      ? "bg-white/10 text-white"
      : "text-white/70 hover:bg-white/5 hover:text-white"
  }`}
>
  <WalletCardsIcon className="size-4 shrink-0 text-white/45" />
  <span className="truncate">{sheet.name}</span>
</Link>
```

Replace with:

```tsx
<Link
  key={sheet.id}
  href={`/portfolio/${activePortfolio.id}?sheet=${sheet.id}`}
  onClick={onNavigate}
  className={`flex items-center gap-3 rounded-card px-3 py-2 text-sm transition-colors ${
    pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
    activeSheetId === sheet.id
      ? "bg-sidebar-accent/60 text-sidebar-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
  }`}
>
  <WalletCardsIcon className="size-4 shrink-0 text-sidebar-foreground/45" />
  <span className="truncate">{sheet.name}</span>
</Link>
```

- [ ] **Step 5: Rewrite the `Debt Sheets` section label**

Find (around line 334):

```tsx
<p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/35">
  Debt Sheets
</p>
```

Replace with:

```tsx
<p className="px-2 py-1 text-nano font-medium uppercase tracking-upper text-sidebar-foreground/45">
  Debt Sheets
</p>
```

- [ ] **Step 6: Rewrite the debt-sheet Links**

Find (around line 338–353):

```tsx
<Link
  key={sheet.id}
  href={`/portfolio/${activePortfolio.id}?sheet=${sheet.id}`}
  onClick={onNavigate}
  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
    pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
    activeSheetId === sheet.id
      ? "bg-white/10 text-white"
      : "text-white/70 hover:bg-white/5 hover:text-white"
  }`}
>
  <LandmarkIcon className="size-4 shrink-0 text-white/45" />
  <span className="truncate">{sheet.name}</span>
</Link>
```

Replace with:

```tsx
<Link
  key={sheet.id}
  href={`/portfolio/${activePortfolio.id}?sheet=${sheet.id}`}
  onClick={onNavigate}
  className={`flex items-center gap-3 rounded-card px-3 py-2 text-sm transition-colors ${
    pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
    activeSheetId === sheet.id
      ? "bg-sidebar-accent/60 text-sidebar-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
  }`}
>
  <LandmarkIcon className="size-4 shrink-0 text-sidebar-foreground/45" />
  <span className="truncate">{sheet.name}</span>
</Link>
```

- [ ] **Step 7: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 8: Commit**

```bash
git add 'src/app/(app)/layout.tsx'
git commit -m "style(sidebar): restyle portfolio picker + sheet sub-lists"
```

---

## Task 5: Footer — version badge + theme/logout controls

**Files:**
- Modify: `src/app/(app)/layout.tsx`

Two places: the `VersionBadge` helper at the top of the file, and the two `Button` elements (desktop + mobile drawer footer) for the logout icon.

- [ ] **Step 1: Update `VersionBadge`**

Find (around line 67–75):

```tsx
function VersionBadge() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const sha = process.env.NEXT_PUBLIC_GIT_SHA;
  return (
    <p className="px-2 text-[10px] text-white/25 font-mono leading-none" title={`Build: ${sha}`}>
      v{version} · {sha}
    </p>
  );
}
```

Replace the `<p>` with:

```tsx
    <p className="px-2 text-nano text-sidebar-foreground/30 font-mono leading-none" title={`Build: ${sha}`}>
      v{version} · {sha}
    </p>
```

(Keep the function body otherwise identical.)

- [ ] **Step 2: Update the desktop logout `Button`**

Find (around line 423–431):

```tsx
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/5"
  onClick={handleLogout}
>
  <LogOutIcon />
  <span className="sr-only">Sign out</span>
</Button>
```

Replace the className with:

```tsx
  className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
```

(Keep all other props unchanged.)

- [ ] **Step 3: Update the mobile-drawer logout `Button`**

Find the second occurrence (around line 471–479) — same pattern, same replacement className:

```tsx
  className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
```

- [ ] **Step 4: Sanity check — no residual hardcoded sidebar colors**

```bash
grep -n -E '#1E1E2E|text-white|bg-white' 'src/app/(app)/layout.tsx'
```

Expected: **zero lines** (sidebar has fully migrated off `text-white`/`bg-white`/`#1E1E2E`).

- [ ] **Step 5: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(app)/layout.tsx'
git commit -m "style(sidebar): restyle footer (version badge + logout)"
```

---

## Task 6: Build, visual verification, screenshots, PR

**Files:** none (build + browser)

- [ ] **Step 1: Full production build**

```bash
cd /opt/summa
pnpm build 2>&1 | tail -25
```

Expected: "Compiled successfully", no warnings about missing utility classes, no type errors.

- [ ] **Step 2: Run the dev server on :3100 for visual testing**

```bash
PORT=3100 pnpm dev
```

Keep this running in a terminal (or background it) — :3000 stays on prod master. Wait until you see `Ready in …ms` before continuing.

- [ ] **Step 3: Light-mode visual check**

Open `http://localhost:3100` (or `http://192.168.1.244:3100`) in a browser set to light theme. Log in with Nick's credentials. Confirm:

- Sidebar width visibly narrower than before (222px vs the old 240px)
- Sidebar background is light (near-white), not purple-navy
- A thin 1px vertical border separates sidebar from content
- Primary nav: Net Worth / Assets / Debts labels in dark text; their `$…` amounts in muted gray
- Click one of the primary links and confirm the active state paints a faint tinted background (`bg-sidebar-accent`) — not solid dark, not the old solid white
- The active item's aggregate lifts to full opacity (no longer muted)
- Uppercase section labels (`PORTFOLIO`, `ASSET SHEETS`, `DEBT SHEETS` if present) render at ~10px with wider letter spacing
- Corner radius on nav items is noticeably smaller (≈4px) vs the old pill-like 16px
- Version badge at the bottom is readable but quiet (`text-sidebar-foreground/30`)

If any of these visually fails, stop and diagnose before moving on.

- [ ] **Step 4: Dark-mode visual check**

Click the theme toggle. Confirm:

- Sidebar flips to a dark surface (currently `oklch(0.205 0 0)`, lighter than Kubera's near-black but intentional for this slice)
- Primary nav text readable against dark sidebar
- Active-state tinted background still visible in dark mode
- Muted aggregate still readable
- No hardcoded white leaks anywhere

If dark-mode contrast feels wrong (e.g., sidebar blends into the page), note it for the follow-up slice but **do not** tune `--sidebar` in this slice — out-of-scope per spec §6.

- [ ] **Step 5: Mobile drawer check**

Resize the browser below `md` (768px width). Click the hamburger. Confirm the drawer renders with the same token-based styling as the desktop sidebar (not stuck on the old purple background). Click through nav items to ensure the drawer closes on selection.

- [ ] **Step 6: Regression check — each page still renders**

In the dev browser:

- Visit `/dashboard` → loads
- Visit `/settings` → loads
- Visit `/settings/connections` → loads
- Visit `/import/kubera` → loads
- Visit `/portfolio/dc66233a-7ac5-4cde-a388-e387e9979e5a` → loads; aggregates in sidebar numerically match the stat cards

If any page errors or the sidebar aggregates diverge from the dashboard totals, stop and diagnose.

- [ ] **Step 7: Capture before/after screenshots for the PR**

The simplest approach: take two screenshots with the system screenshot tool — one of `http://localhost:3000` (prod, pre-slice-2) and one of `http://localhost:3100` (dev, post-slice-2), both at default desktop width, on the same page (e.g. `/dashboard`). Save them anywhere convenient (e.g. `/tmp/slice-2-before.png` and `/tmp/slice-2-after.png`). These go into the PR description.

- [ ] **Step 8: Kill the dev server**

Ctrl-C the `pnpm dev` process (or `kill` it if backgrounded). :3000 (prod master) keeps running the old version until the post-flight deploy.

- [ ] **Step 9: Push the branch**

```bash
git push -u origin kubera/02-sidebar
```

- [ ] **Step 10: Open the PR**

```bash
gh pr create --title "style(sidebar): Kubera visual parity slice 2 — sidebar" --body "$(cat <<'EOF'
## Summary

- Restyles the left sidebar in `src/app/(app)/layout.tsx` to consume slice-1's design tokens (`w-sidebar`, `rounded-card`, `text-nano`, `tracking-upper`) and shadcn's `--sidebar*` theme tokens (`bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, `bg-sidebar-border`).
- No logic changes — aggregates, link targets, mobile drawer behavior, portfolio picker, and sheet sub-lists all stay functionally identical.
- Active primary-nav items paint `bg-sidebar-accent` instead of solid white; the aggregate value is muted by default and lifts to full opacity when its parent link is active via a Tailwind `group-[.active-nav]:` variant.

Design decisions logged in `docs/superpowers/specs/2026-04-15-kubera-slice-2-sidebar-design.md`.

## Test plan

- [ ] Light mode: sidebar reads as light surface with 1px right border; primary nav + muted aggregates visible; active state = faint tint
- [ ] Dark mode: sidebar flips to dark token; contrast holds
- [ ] Mobile drawer: renders with identical styling; closes on nav selection
- [ ] Regression: `/dashboard`, `/settings`, `/settings/connections`, `/import/kubera`, `/portfolio/<id>` all load; sidebar aggregates match dashboard totals
- [ ] `pnpm tsc --noEmit` clean
- [ ] `pnpm build` clean, no missing-utility warnings

## Follow-ups (future slices)

Logged in the spec under "Follow-ups": wire `SheetTabs` into portfolio-view, tune dark `--sidebar` toward Kubera's near-black, remove sidebar sheet sub-lists, avatar/user menu.
EOF
)"
```

Expected: PR URL printed. Record it for the post-flight gate.

---

## Summary

Six tasks, one file (`src/app/(app)/layout.tsx`), no new logic, no tests needed. The plan ships:

- Outer chrome + separators on sidebar tokens (Task 1)
- Primary nav with muted aggregates + group-based active-aggregate lift (Task 2)
- Secondary nav on sidebar tokens (Task 3)
- Portfolio picker + sheet sub-lists + uppercase labels on slice-1 tokens (Task 4)
- Footer restyle (Task 5)
- Build + visual verification + PR (Task 6)

## Test plan

No unit tests; the slice is pure styling. Verification is:

- `pnpm tsc --noEmit` clean at every task's end
- `pnpm build` clean at Task 6
- Light + dark visual checks in browser (Task 6 steps 3–4)
- Mobile drawer check (Task 6 step 5)
- Page regression check (Task 6 step 6)

## Out of scope (reminder from spec)

Anything not listed in the six tasks is out-of-scope for this slice and goes into the spec's "Follow-ups" list — do not grow the scope mid-execution. Specifically: no changes to `globals.css`, no `SheetTabs` wiring, no sub-label additions, no avatar menu, no `--sidebar` token tuning, no changes to page headers, asset tables, or section rows.

## Self-review

Checking the plan against the spec:

**Spec coverage:**
- §3 row 1 (`<aside>`): Task 1 step 1 ✓
- §3 row 2 (Mobile SheetContent): Task 1 step 2 ✓
- §3 row 3 (Separators): Task 1 step 4 ✓
- §3 row 4 (tagline `<p>`): Task 1 step 3 ✓
- §3 row 5 (nav item base): applied across Tasks 2, 3, 4 ✓
- §3 row 6 (inactive nav): Tasks 2, 3, 4 ✓
- §3 row 7 (active primary): Task 2 ✓
- §3 row 8 (portfolio picker active): Task 4 ✓
- §3 row 9 (aggregate muting + group lift): Task 2 ✓
- §3 row 10 (uppercase labels): Task 4 ✓
- §3 row 11 (ChevronRight color): Task 4 step 2 ✓
- §3 row 12 (VersionBadge): Task 5 step 1 ✓
- §3 row 13 (theme/logout icon colors): Task 5 steps 2–3 ✓

**Placeholder scan:** No TBDs, no "handle edge cases", no "similar to above" — every code block is literal.

**Type consistency:** The `active-nav` class name and the `group-[.active-nav]:` variant match across every primary-nav occurrence (three in Task 2). `rounded-card`, `text-nano`, `tracking-upper`, `w-sidebar` spelled the same everywhere.

**One gap I spotted and fixed inline while writing:** The desktop `<aside>` adds `border-r border-sidebar-border` (per spec row 1) but nothing in the plan explicitly diffs the old className that lacks a border. Task 1 step 1's replacement includes the full new className so an engineer following the plan gets it automatically — no task gap.

No other gaps found.
