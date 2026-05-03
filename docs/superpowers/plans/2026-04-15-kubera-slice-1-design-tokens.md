# Kubera Visual Parity — Slice 1: Design Tokens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Summa's design-token layer (`globals.css`) with the typography scale, layout constants, and muted-foreground compositing pattern observed in Kubera's production UI, so subsequent visual-parity slices (sidebar aggregates, spreadsheet chrome, row states) can use the same primitives Kubera does.

**Architecture:** Single-file additive CSS change in `src/app/globals.css`. Two categories: (1) purely additive tokens (typography scale, layout constants, letter-spacing) that don't affect any existing component; (2) one behavior-changing migration (`--muted-foreground` from solid gray to 50% alpha of `--foreground`) that composes correctly over any surface, matching Kubera's `rgba(255,255,255,0.5)` / `rgba(0,0,0,0.5)` pattern. All changes live in `:root` + `.dark` blocks; new tokens are exposed to Tailwind utilities via `@theme inline`.

**Tech Stack:** Tailwind 4 (`@theme inline`), shadcn/ui, Next.js 15 App Router, CSS custom properties, oklch color space.

**Reference**: `docs/kubera-audit/KUBERA-AUDIT-REPORT.md` sections 1.1–1.4 and 11.

---

## File structure

One file:
- **Modify**: `src/app/globals.css` — add tokens, change one existing token

No new files. No other files touched. Nothing else imports these tokens by name yet (slice 1 is purely plumbing).

---

## Setup

### Task 0: Branch and baseline

**Files:** none (git + filesystem only)

- [ ] **Step 1: Commit or stash any uncommitted work in `/opt/summa` before starting**

Check current state:

```bash
cd /opt/summa
git status --short
```

If there's output, either commit the unrelated in-flight work or stash it:

```bash
git stash push -m "wip: prior to kubera slice 1"
```

Don't include those uncommitted files in this slice's commits — they're from earlier work that's unrelated to the design-token change.

- [ ] **Step 2: Create a branch off `master` for this slice**

```bash
cd /opt/summa
git checkout master
git pull --ff-only
git checkout -b kubera/01-tokens
```

- [ ] **Step 3: Install deps and start dev server in a background terminal**

```bash
cd /opt/summa
pnpm install
pnpm dev
```

Wait for `Ready in Xs` output. The dev server stays running for the rest of this plan. Leave it open.

- [ ] **Step 4: Capture baseline screenshots**

Open http://localhost:3000 in a real browser. For each of these routes, take a full-page screenshot and save to `docs/kubera-audit/summa-baseline/`:

```
/                    → summa-baseline/01-dashboard-before.png
/portfolio           → summa-baseline/02-portfolio-before.png
```

(If additional authenticated Summa routes exist — check the actual route tree under `src/app/(app)/` — capture those too.)

These baseline shots are what you'll compare against in Task 2 when the `--muted-foreground` change lands. If there's nothing visually different after the migration, the migration is safe.

- [ ] **Step 5: Note the existing `--muted-foreground` values**

Open DevTools → Inspect `<body>` → Computed tab → filter "muted-foreground". Record the RGB resolution in both light and dark mode (toggle via whatever theme-toggle mechanism Summa uses, or manually add `class="dark"` to `<html>` via DevTools).

Expected (from `src/app/globals.css:66` and `:105`):
- Light: `oklch(0.556 0 0)` → approximately `rgb(125, 125, 125)`
- Dark: `oklch(0.708 0 0)` → approximately `rgb(175, 175, 175)`

---

## Task 1: Add additive Kubera tokens (typography, layout, letter-spacing)

**Goal:** Introduce new CSS custom properties matching Kubera's scale, exposed to Tailwind as utilities. Purely additive — nothing in the existing codebase uses these tokens yet, so no visual regression is possible.

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Open `src/app/globals.css` and locate the `@theme inline` block at line 7 and the `:root` block at line 54**

You'll be adding new custom-property declarations inside `:root` (lines 54–91) and exposing them to Tailwind inside `@theme inline` (lines 7–52). Keep the existing block structure — don't reorder anything.

- [ ] **Step 2: Add typography + layout + letter-spacing tokens to `:root`**

At the end of the `:root` block, immediately before the closing brace on line 91, add:

```css
  /* Kubera-aligned typography scale — see docs/kubera-audit Section 1.1 */
  --font-size-nano: 10px;       /* uppercase column headers, 1-DAY/1-YEAR micro labels */
  --font-size-micro: 11px;      /* secondary labels, pill badges */
  --font-size-tiny: 12px;       /* sheet tabs */
  --font-size-small: 13px;      /* dense table text */
  --font-size-base: 16px;       /* body default */
  --font-size-hero: 36px;       /* page totals */

  /* Typography utilities */
  --letter-spacing-upper: 0.05em;  /* uppercase column headers, tab pills */
  --font-weight-tab: 800;          /* sheet-tab heavy weight per Kubera measurement */

  /* Layout primitives — see docs/kubera-audit Section 1.3 */
  --sidebar-width: 222px;
  --topbar-height: 90px;
  --row-height: 40px;
  --row-padding-x: 16px;
  --card-radius: 4px;
```

The `/* ... */` comments stay; they document *why* these specific values (not "TODO rename later"). Comments referring to the audit report location are deliberate — when someone sees `--sidebar-width: 222px` in six months, they can find the source measurement.

- [ ] **Step 3: Mirror the same tokens inside `.dark` block at line 93**

Layout + typography tokens don't change between themes — but Tailwind 4's `@theme inline` resolves custom properties per selector context, so these must be declared inside both `:root` **and** `.dark` for Tailwind's utility generation to pick them up consistently.

Immediately before the closing brace of `.dark` on line 129, add the same block as Step 2:

```css
  /* Kubera-aligned typography scale */
  --font-size-nano: 10px;
  --font-size-micro: 11px;
  --font-size-tiny: 12px;
  --font-size-small: 13px;
  --font-size-base: 16px;
  --font-size-hero: 36px;

  --letter-spacing-upper: 0.05em;
  --font-weight-tab: 800;

  --sidebar-width: 222px;
  --topbar-height: 90px;
  --row-height: 40px;
  --row-padding-x: 16px;
  --card-radius: 4px;
```

No comments this time — they're already documented in `:root`.

- [ ] **Step 4: Expose the typography scale to Tailwind via `@theme inline`**

Tailwind 4 reads `--text-*` for font-size utilities. Inside the `@theme inline { ... }` block (lines 7–52), add new lines immediately before the closing brace on line 52:

```css
  --text-nano: var(--font-size-nano);
  --text-micro: var(--font-size-micro);
  --text-tiny: var(--font-size-tiny);
  --text-small: var(--font-size-small);
  --text-hero: var(--font-size-hero);

  --tracking-upper: var(--letter-spacing-upper);

  --spacing-sidebar: var(--sidebar-width);
  --spacing-topbar: var(--topbar-height);
  --spacing-row: var(--row-height);
  --radius-card: var(--card-radius);
```

This gives later slices these Tailwind utilities (automatically emitted by Tailwind 4's `@theme`):
- `text-nano`, `text-micro`, `text-tiny`, `text-small`, `text-hero`
- `tracking-upper`
- `w-sidebar`, `h-topbar`, `h-row` (and the matching min-/max- variants)
- `rounded-card`

We don't touch the existing `text-xs`, `text-sm`, `text-base`, `text-4xl` utilities — Tailwind ships those already at the same sizes we need (12/14/16/36), so the new tokens are specifically for 10/11/13 and semantic naming.

- [ ] **Step 5: Save the file and verify the dev server hot-reloads without errors**

Save `globals.css`. Look at the dev-server terminal. You should see a `✓ Compiled` line. If you see a PostCSS error or a `unknown at-rule` error, stop — re-read the block you edited; most likely a missing semicolon or a stray `}`.

- [ ] **Step 6: Verify tokens resolve in the browser**

Reload http://localhost:3000. Open DevTools console and run:

```js
const root = getComputedStyle(document.documentElement);
console.log({
  nano: root.getPropertyValue('--font-size-nano'),
  tiny: root.getPropertyValue('--font-size-tiny'),
  sidebar: root.getPropertyValue('--sidebar-width'),
  tabWeight: root.getPropertyValue('--font-weight-tab'),
});
```

Expected output:
```
{ nano: " 10px", tiny: " 12px", sidebar: " 222px", tabWeight: " 800" }
```

(Whitespace prefix is normal — CSS resolved values include the leading space after `:`.)

- [ ] **Step 7: Verify Tailwind utilities are generated**

In DevTools console:

```js
const span = document.createElement('span');
span.className = 'text-nano text-micro text-tiny text-small text-hero tracking-upper w-sidebar h-row rounded-card';
document.body.appendChild(span);
const s = getComputedStyle(span);
console.log({
  fontSize: s.fontSize,            // should show whichever of the text-* won the cascade (text-hero wins alphabetically? no — Tailwind emits in source order; last-wins)
  letterSpacing: s.letterSpacing,  // "0.8px" (0.05em × 16)
  width: s.width,                  // "222px"
  height: s.height,                // "40px"
  borderRadius: s.borderRadius,    // "4px"
});
span.remove();
```

Expected: `letterSpacing: "0.8px"`, `width: "222px"`, `height: "40px"`, `borderRadius: "4px"`.

If Tailwind didn't generate the utility, you'll see `fontSize` as browser default (16px) with no class effect. If that happens, check that:
1. The `@theme inline` block is the one at the top (not the second `@theme inline` block at line 131 which handles `--color-positive`/`--color-negative`)
2. You put the `--text-*` / `--tracking-*` / `--spacing-*` tokens **inside** the `@theme inline` block, not outside it
3. The dev server fully recompiled — sometimes Tailwind needs a full restart for new `@theme` keys: `Ctrl+C` and `pnpm dev` again

- [ ] **Step 8: Smoke-test every authenticated route**

Navigate through each route in Summa and confirm nothing visually changed. These tokens are additive — if anything looks different, something else was already referencing `--text-nano` (unlikely but check).

Routes to spot-check (adjust to actual Summa routes under `src/app/(app)/`):
- `/` (dashboard)
- `/portfolio` (or whatever the primary spreadsheet route is)

If you notice any visual difference from baseline: stop, revert, and investigate. The tokens are meant to be invisible in this slice.

- [ ] **Step 9: Commit**

```bash
cd /opt/summa
git add src/app/globals.css
git commit -m "style(tokens): add Kubera-aligned typography scale and layout primitives

Adds --font-size-{nano,micro,tiny,small,base,hero} (10-36px scale matching
Kubera's observed usage), --letter-spacing-upper (0.05em for uppercase
column headers), --font-weight-tab (800 for sheet tabs), and layout
constants --sidebar-width/--row-height/--card-radius. Exposed to Tailwind
as text-nano, tracking-upper, w-sidebar, rounded-card, etc.

Purely additive; no existing components reference these tokens yet.

Ref: docs/kubera-audit/KUBERA-AUDIT-REPORT.md sections 1.1, 1.3, 11.3"
```

---

## Task 2: Migrate `--muted-foreground` to alpha-composed foreground

**Goal:** Replace the solid-gray `--muted-foreground` with a 50% alpha of `--foreground` so muted text composes correctly over any surface (rows, cards, hovered bands), matching Kubera's `rgba(255,255,255,0.5)` / `rgba(0,0,0,0.5)` pattern documented in audit Section 1.2.

**Files:**
- Modify: `src/app/globals.css` (lines 66, 105)

**Risk:** This is a **behavior change**, not additive. Every component using `text-muted-foreground` (placeholders, secondary labels, breadcrumbs, empty-state text, etc.) will re-paint. On white/black backgrounds the result is visually equivalent to the current solid gray. On colored or tinted backgrounds (cards, hovered rows, muted panels) the alpha composition is more correct. Baseline screenshots from Task 0 Step 4 are your regression check.

- [ ] **Step 1: Read the current `--muted-foreground` declarations**

Open `src/app/globals.css`. Confirm:
- Line 66: `  --muted-foreground: oklch(0.556 0 0);`
- Line 105: `  --muted-foreground: oklch(0.708 0 0);`

If those line numbers are off (e.g., because Task 1 added lines above), find them by searching for `--muted-foreground:` — there should be exactly two occurrences, one per theme block.

- [ ] **Step 2: Change light-theme `--muted-foreground` on line 66 (or wherever it now is)**

Replace:
```css
  --muted-foreground: oklch(0.556 0 0);
```
With:
```css
  --muted-foreground: oklch(0.145 0 0 / 0.5);  /* 50% alpha of --foreground; Kubera pattern */
```

Why `oklch(0.145 0 0 / 0.5)` specifically: `--foreground` on light theme is `oklch(0.145 0 0)` (line 56). Alpha 0.5 matches Kubera's observed `rgba(0,0,0,0.5)` muted-text pattern. We can't write `var(--foreground) / 0.5` directly because CSS doesn't yet let you apply an alpha channel to a variable — so we duplicate the color and multiply the alpha.

- [ ] **Step 3: Change dark-theme `--muted-foreground` on line 105**

Replace:
```css
  --muted-foreground: oklch(0.708 0 0);
```
With:
```css
  --muted-foreground: oklch(0.985 0 0 / 0.5);  /* 50% alpha of dark --foreground */
```

Dark `--foreground` is `oklch(0.985 0 0)` (line 95).

- [ ] **Step 4: Save and reload**

Save the file. Wait for `✓ Compiled` in the dev-server terminal. Reload the browser.

- [ ] **Step 5: Visually compare against baseline**

Open each baseline screenshot from Task 0 Step 4 side-by-side with the live dev server (same route, same theme). Focus on any element with muted/secondary text:
- Placeholder text in inputs
- Subtitle or secondary lines beneath a primary heading
- Disabled states
- Stat card sub-labels ("1 DAY", "YTD", etc.)
- Empty-state "no data" text

**Expected outcomes:**
- **On white backgrounds (light theme default)**: muted text looks nearly identical — might appear microscopically lighter (50% alpha of black = `rgb(128,128,128)` vs. previous `oklch(0.556)` which resolves to ~`rgb(128,128,128)`). Functionally equivalent.
- **On colored card backgrounds or hovered surfaces**: muted text should now tint with the surface it sits on, which is the whole point. If a card has a tinted background, the muted label on it will subtly shift.
- **In dark theme**: same story. Slight visual shift possible because `oklch(0.708)` ≈ `rgb(175,175,175)` whereas 50% alpha of white = `rgba(255,255,255,0.5)` which composites to `rgb(127,127,127)` on pure black, or slightly higher on dark gray. Muted text will be slightly darker but more tonally consistent.

If any muted text becomes **illegibly low-contrast** on a specific surface, that surface was already mis-tinted — log the affected component in a follow-up note but don't revert this change.

- [ ] **Step 6: Capture post-change screenshots**

Save the same set of routes as in Task 0 Step 4, this time as:
```
summa-baseline/01-dashboard-after.png
summa-baseline/02-portfolio-after.png
```

These plus the before shots are what goes into the PR for review.

- [ ] **Step 7: Commit**

```bash
cd /opt/summa
git add src/app/globals.css
git commit -m "style(tokens): migrate --muted-foreground to alpha-composed foreground

Previously a solid mid-gray (oklch(0.556) / oklch(0.708)). Now
rgba(foreground, 0.5) in both themes, mirroring Kubera's muted-text
pattern (rgba(0,0,0,0.5) and rgba(255,255,255,0.5) respectively).

Alpha composition tints correctly over any surface — cards, hovered
rows, tinted panels — which solid gray could not. Visually near-
identical on pure white/black backgrounds; more tonally consistent
on tinted surfaces.

Ref: docs/kubera-audit/KUBERA-AUDIT-REPORT.md section 1.2 / 11.1"
```

---

## Task 3: Open the pull request

**Files:** none (git only)

- [ ] **Step 1: Push the branch**

```bash
cd /opt/summa
git push -u origin kubera/01-tokens
```

- [ ] **Step 2: Create PR**

```bash
cd /opt/summa
gh pr create --title "style(tokens): Kubera visual parity slice 1 — design tokens" --body "$(cat <<'EOF'
## Summary

Slice 1 of the Kubera visual-parity work. Adds design tokens matching Kubera's observed typography scale, layout primitives, and muted-foreground compositing pattern. Reference material: \`docs/kubera-audit/KUBERA-AUDIT-REPORT.md\`.

**Two commits:**

1. **Additive**: \`--font-size-{nano..hero}\`, \`--letter-spacing-upper\`, \`--font-weight-tab\`, \`--sidebar-width\`, \`--row-height\`, \`--card-radius\`, etc. Exposed to Tailwind as \`text-nano\`, \`tracking-upper\`, \`w-sidebar\`, \`rounded-card\`. No existing components touched; no regression possible.
2. **Behavior change**: \`--muted-foreground\` migrated from solid gray to 50% alpha of \`--foreground\` in both themes. Matches Kubera's observed \`rgba(0,0,0,0.5)\` / \`rgba(255,255,255,0.5)\` pattern. Composes correctly over any surface.

## Test plan

- [ ] \`pnpm dev\` compiles cleanly
- [ ] Each route renders without visual regression vs. baseline screenshots (attached below)
- [ ] DevTools computed styles show new token values resolving correctly (\`--font-size-nano: 10px\`, \`--sidebar-width: 222px\`, etc.)
- [ ] Tailwind utilities generate (\`text-nano\`, \`tracking-upper\`, \`w-sidebar\`, \`rounded-card\` all produce expected styles when applied to a test element)
- [ ] Placeholder/muted/secondary text legibility unchanged on every surface (primary concern of commit 2)

## Screenshots

Before/after attached inline — see \`docs/kubera-audit/summa-baseline/\`.
EOF
)"
```

- [ ] **Step 3: Attach baseline screenshots to the PR**

Upload `summa-baseline/01-dashboard-{before,after}.png` and `summa-baseline/02-portfolio-{before,after}.png` to the PR comment thread so reviewers can see the (expected-to-be-minimal) visual delta.

- [ ] **Step 4: Stop here**

Do **not** start slice 2 (sidebar aggregates) in this same branch. Slice 2 gets its own branch off `master` once slice 1 merges. Each slice is independently reviewable.

---

## Self-review

**Spec coverage.** The Slice 1 scope from the audit's Section 11 is: (a) typography scale, (b) layout primitives, (c) muted-foreground alpha migration, (d) optional chart palette additions. This plan implements (a), (b), (c) fully. (d) was deliberately dropped — Summa already has `--chart-1` through `--chart-8` and `--chart-net-worth` plus a semantic `--positive` / `--negative` pair; no chart tokens are *missing* at the primitive layer. Chart-specific parity (the purple fill, benchmark color assignments) is a per-chart decision that belongs in slice 5, not here.

**Placeholder scan.** No "TBD", no "handle appropriately", no referenced-but-undefined identifiers. Every CSS declaration, every shell command, every expected console output is spelled out.

**Consistency.** Token names used across tasks: `--font-size-nano/micro/tiny/small/base/hero`, `--letter-spacing-upper`, `--font-weight-tab`, `--sidebar-width`, `--topbar-height`, `--row-height`, `--row-padding-x`, `--card-radius`. These names match between Task 1 Steps 2–3 (declaration) and Step 4 (Tailwind exposure). Tailwind exposure uses Tailwind's naming convention (`--text-*`, `--tracking-*`, `--spacing-*`, `--radius-*`) which is distinct from the source tokens; this is intentional so the two can evolve independently.
