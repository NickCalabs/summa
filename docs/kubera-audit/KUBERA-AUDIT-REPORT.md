# Kubera UI/UX Audit Report

**Generated**: 2026-04-15
**Method**: Authenticated Playwright/Chromium crawl from CT 142
**Kubera build captured**: `6.4.3.12866` (`ts_release = 1776088274`)
**Portfolio ID**: `7407c1f8-cfbf-4b81-8f38-be9f4764e8eb` ("Nick", USD)

## Coverage map

| Area | Status | Notes |
|---|---|---|
| Auth / session model | ✅ | AWS Cognito (User Pool `us-east-1_Z25x0F3my`, client `4s3p5qi7spb7cd5vtgj920ofvt`); JWT accepted as cookie **and** `Authorization: Bearer`, with `accessToken` / `idToken` also stored in `localStorage` under Cognito-standard keys. |
| Dashboard (`/networth`) | ✅ | Full page captured, tokens + DOM + network extracted (02, 08, 10). |
| Assets spreadsheet (`/assets`) | ✅ | Full page, section/sheet/row structure captured (22, 27). |
| Debts spreadsheet (`/debts`) | ✅ | 3 sections, warning badge, available credit badge, multi-currency row (23). |
| Recap (`/recap`) | ✅ | Holdings-by-date matrix captured (04, 17). |
| Beneficiary (`/beneficiary`) | ✅ | Empty state captured (06). |
| Fast Forward (`/fastforward`) | ⚠ | Rendered empty for this account (no inputs yet) (24). |
| Documents (`/documents`) | ✅ | Dark-theme shell (25). |
| Insurance (`/insurance`) | ✅ | Dark-theme shell (26). |
| Responsive 1024×768 / 768×1024 | ✅ dashboard only | Spreadsheet responsive not captured (token timing). |
| Interactive states (row click, context menu, add-asset modal, sheet-tab reorder, collapse) | ❌ | Not captured in this run — proposed follow-up. Detail panel interaction fell through the selectors we tried because Kubera uses generated class names (`sc-*`) rather than semantic `role=row`. See Section 8 for a concrete replay plan. |

---

## 1. Design tokens

### 1.1 Typography

- **Primary font stack**: `"Inter var", Inter, sans-serif` — used on **every authenticated page** we crawled.
- **Secondary (ornamental)**: `"PT Serif Caption"` — appears sparsely, likely for the "Hola, Nick" greeting flourish on the dashboard.
- **No system-font fallback**: the stack goes straight to Inter; Kubera bundles Inter (see `/inter.css` in every HTML).

**Font-size frequency (dark/spreadsheet pages, Assets):**

| Size | Rank | Use |
|---|---|---|
| **16 px** | 1 (177×) | Body default, most row cells |
| **36 px** | 2 (86×) | Hero page totals ("$119,055") |
| **13.33 px** | 3 (47×) | Dense table text / inline metadata |
| **13–14 px** | 4 (44–27×) | Secondary labels, column headers |
| **10–12 px** | 5 (21–48×) | Uppercase tiny labels ("ASSET", "VALUE", "1 DAY", "1 YEAR"), sheet-tab pills |

**Font weights in use**: `400` (body), `500` (active row), `600` (strong labels), **`800`** (sheet tabs, section headers), and `700` for the big total on hero rows. Sheet tabs were measured at `12px / 800`.

### 1.2 Color palette

Kubera has a dark/light theme toggle; both palettes were observed in the same crawl because toggling presumably happened between our runs. **Don't treat the light/dark split as semantic per-page** — Summa should pick whichever theme model we prefer and mirror both palettes.

**Dark theme (observed on Assets, Debts, Documents, Insurance):**
| Role | Value | Count seen |
|---|---|---|
| Page background (deepest) | `rgb(12, 12, 12)` | rare |
| Surface / content section bg | `rgb(21, 21, 21)` | 3–5× |
| Sheet / card surface | `rgb(26, 26, 26)` | 3–9× |
| Hover / alt-row surface | `rgb(30, 30, 30)` | 2× |
| Table header / sticky band | `rgb(36, 36, 36)` | 4–9× (dominant table bg) |
| Elevated surface / menu | `rgb(50, 50, 50)` | 3× |
| Primary text | `rgb(238, 238, 238)` | 272× on /assets |
| Secondary / muted text | `rgba(255, 255, 255, 0.5)` | 51× |
| Tertiary text | `rgba(255, 255, 255, 0.7)` / `0.8` | 5–8× |
| Accent white (big number) | `rgb(255, 255, 255)` | 20× |
| **Negative (loss)** | `rgb(255, 0, 0)` | 4–6× — pure red, no hue shift |
| **Positive (gain)** | `rgb(121, 215, 98)` | observed on dashboard |
| **Warning (sync issue)** | yellow/amber triangle (see `debts.png`) — exact hex not sampled; likely `#F5A623` or similar |

**Light theme (observed on Dashboard, Recap, Beneficiary):**
| Role | Value |
|---|---|
| Page background | `rgb(255, 255, 255)` |
| Surface tint | `rgb(252, 252, 252)` |
| Subtle border / divider | `rgb(219, 219, 219)` |
| Primary text | `rgb(0, 0, 0)` |
| Muted text | `rgba(0, 0, 0, 0.5)` / `0.6` / `0.7` |
| **Negative** | `rgb(255, 0, 0)` |
| **Positive** | `rgb(0, 167, 7)` |
| Dashboard chart fill (Net Worth area) | light purple — see `02-dashboard.png`, approx `rgb(225, 200, 245)` with `rgb(150, 100, 200)` line stroke (visually estimated; see image for exact rendering) |

Root CSS custom properties (`--*`): **none detected**. Kubera's theming is NOT driven by CSS variables — it's baked into each component via styled-components (`sc-*` classes throughout the DOM). Summa's Tailwind/shadcn variable system is a much more maintainable approach; don't copy Kubera's styled-components strategy.

### 1.3 Spacing & layout

- **Sidebar width**: **222 px** (measured directly on `/portfolio` empty shell)
- **Main content**: `1218 px` at 1440 viewport → sidebar + main = 1440, no gap
- **Top bar height**: ~**90 px** (from the dashboard screenshot; icons baseline aligned at y≈45)
- **Content max-width**: content extends to viewport edge; no centered `max-w-*` container
- **Section padding**: sheet rows ~`40 px tall`; section headers ~`50 px tall`
- **Button padding**: primary "Add Asset" inline button — tightly wrapped, ~`6 px 10 px`
- **Column gutter in stat cards**: ~`24 px` (3-card grid on dashboard)

### 1.4 Borders / radius / shadows

- **Border radius**: cards use a small radius — approximately `4 px` on stat cards. Rows are **square-cornered** (no radius). No large `xl`/`2xl` rounding anywhere.
- **Borders**: dark theme uses subtle `rgb(50,50,50)` for row separators. Light theme uses `rgb(219,219,219)`.
- **Shadows**: Minimal to none. Stat cards on the light-theme dashboard appear **flat with a 1px border**, not shadowed. Kubera's visual style is distinctly flat.

### 1.5 Transitions

Not deeply sampled, but inspected computed `transition` values were mostly `none` or default shorthand. Kubera's UI doesn't use heavy motion; collapsing/expanding sections is fast and snappy with no long ease curves visible.

---

## 2. Layout

### 2.1 Global shell

```
┌──────────────┬──────────────────────────────────────┐
│   SIDEBAR    │              TOP BAR                 │
│    222 px    │ [↻] [🔍] [⋄] [USD $▼] [Nick▼] [avt] │
│              ├──────────────────────────────────────┤
│  ■ Net Worth │                                      │
│    Dashboard │           PAGE CONTENT               │
│  ◆ Assets    │                                      │
│  ◯ Debts     │                                      │
│              │                                      │
│  ⊲ Recap     │                                      │
│  ⏭ Fast Fwd  │                                      │
│  ☂ Benef.    │                                      │
│              │                                      │
│              │                                      │
│ ❤ Hearts     │                                  [?] │
└──────────────┴──────────────────────────────────────┘
```

### 2.2 Sidebar

- Persistent; **not collapsible to icons-only** in what we captured (menu icon top-left toggles to fully closed, not rail-mode).
- **Net Worth** is the top item with a nested "Dashboard" sub-label (Dashboard is the default view under Net Worth).
- Each primary nav item shows its **aggregate value** on the right (`$100,950`, `$119,133`, `$18,183`) — an at-a-glance summary.
- The main portfolio areas are grouped implicitly: Net Worth / Assets / Debts (the money triumvirate), then Recap / Fast Forward (analysis), then Beneficiary (estate), and hidden unless enabled: Documents / Insurance.
- "Kubera Hearts" referral block docked at bottom-left corner.
- No sidebar search in the sidebar itself; search lives in top bar.

### 2.3 Top bar (fixed)

Right-aligned icon cluster:
1. **↻ Refresh** — triggers `POST /api/v1/auth/section/custodian/batchRefresh`
2. **🔍 Search** — global asset/row search
3. **⋄ Shortcuts / AI** — the red-dot icon (sharing/export?)
4. **⬡ ChatGPT icon** — AI Import feature
5. **USD $ ▼** — display currency selector (`tickerId: 150` for USD)
6. **Nick ▼** — account menu
7. **avatar circle** — initial "n" on dark background

### 2.4 URL structure

All routes are primary paths; state lives in query string and hash:

```
/networth?portfolio_id=<uuid>
/assets?portfolio_id=<uuid>#sheet_id=<uuid>
/debts?portfolio_id=<uuid>#sheet_id=<uuid>
/recap?portfolio_id=<uuid>#chart_option=networth&chart_timerange=daily&chart_type=totals&selected_section_name=null
/fastforward?portfolio_id=<uuid>
/beneficiary?portfolio_id=<uuid>
/documents?portfolio_id=<uuid>
/insurance?portfolio_id=<uuid>
```

Key pattern: the **active sheet is carried in the URL hash** (`#sheet_id=<uuid>`), not in state. Recap config is query-param-encoded. This is browser-back-friendly and deep-linkable.

### 2.5 Responsive

At 1024×768 and 768×1024 the **dashboard kept its 3-column card grid** and the sidebar was unchanged. No drastic reflow. This suggests Kubera is not truly responsive; it's a desktop app that degrades gracefully rather than adapting to mobile layouts. (We didn't confirm mobile-specific breakpoints below 768 because the spreadsheet route needed auth-timing we didn't retry.)

---

## 3. Dashboard

Screenshot: `02-dashboard.png`

### 3.1 Structure

- **Greeting line**: "Hola, Nick #" — personalized, with a small orange decorative `#` (likely a referral/edit glyph)
- **6 stat cards** in a `3 × 2` grid:

| Top row | Net Worth + Investable (combo card) | Assets | Debts |
| Bottom row | CAGR·YTD | Cash on hand | Tax Estimate |

### 3.2 Stat-card anatomy

Each card is a white surface with:
- **Label** in Inter 13px, regular weight, dark gray — e.g., "Net Worth", "Assets", "Debts"
- **Dollar sign** as small superscript next to the number
- **Hero value** in Inter ~36px, semibold, nearly black — e.g., `100,950`
- Two change rows below: `1 DAY` in uppercase tiny label (10px) + signed delta + `(%)` in parentheses. Same pattern for `1 YEAR`.
- Red `rgb(255, 0, 0)` for negative; Green `rgb(0, 167, 7)` for positive.

### 3.3 Net Worth + Investable combo card

A single card holds **two stacked metrics**:
- Net Worth (top, bigger)
- Investable (bottom, equally weighted but smaller number)

Plus a **CAGR·YTD mini-matrix** beneath:
- Left column: NET WORTH -8% / -0.95% / YOUR CLUB
- Middle: INVESTABLE -11% / -0.75% / YOUR CLUB  
- Right: S&P 500 +2%, BTC -15%, GOLD +5% (benchmark comparisons)

The "YOUR CLUB" suffix is a wealth-percentile benchmark — Kubera compares users to peer cohorts (see `summaryStat` endpoint, `clubPercentile: 6.87`, `clubs:[250000, 1000000, 2500000, 5000000, 10000000, 25000000]`).

### 3.4 Net Worth chart (main)

Below the cards, full-width chart panel:
- **Dual-line overlay**: Net Worth `$100,950 (-$49 / -0.05%)` line + Investable `$119,186 (+$545 / +0.46%)` line
- **Area fill**: light purple gradient under the line
- **Date range selector**: top-right "1 YEAR ▼" dropdown, plus gear icon for chart config
- **Chart library**: no Highcharts/Recharts/D3 detected on dashboard; this chart is likely rendered via **Chart.js** (present globally; `chartjs: true` on all dark-theme routes) or a custom SVG. Confirmed: `window.Chart` is defined.

### 3.5 Tax Estimate card

Adjusted Net Worth sub-label: `$98,199` — i.e., net worth after tax liability estimate. Uses same stat-card layout pattern.

---

## 4. Spreadsheet (Assets / Debts / Documents / Insurance)

Screenshots: `22-assets.png`, `23-debts.png`, `25-documents.png`, `26-insurance.png`

These four routes share the **same component** — a dark-themed spreadsheet container — parameterized by the data category.

### 4.1 Page header

Left-aligned, above the tab strip:
- Big **$** + total (e.g., `119,055`) in Inter 36px weight 700, white on dark (`rgb(238,238,238)`)
- **1 DAY** / **1 YEAR** change indicators in same 3-column layout as dashboard stat cards, color-coded

### 4.2 Sheet tabs

For Assets (and likely the others with multi-sheet support), a tab strip below the header:

```
Cash   Bitcoin    Investments                                       ⋮
$218   $84,437    $34,400
```

- **Active tab**: bold, white text (`rgb(238,238,238)`), sub-total in slightly muted white
- **Inactive**: ~70% opacity white
- Font: **12px / weight 800** (measured on a tab `<div>`)
- Tab gap: ~40px horizontal
- **⋮ vertical ellipsis** at right = sheet-level menu (rename/delete/reorder)
- No visible underline on active; differentiation is entirely weight + opacity

Debts has **no tab strip** because it has a single implicit sheet — direct section headers start immediately. The component hides the tab bar when `sheet_count === 1`.

### 4.3 Section header

```
▼ Cash
```

- Collapse chevron (▼/▶) on the left, then section name
- Bold white; font around **14–16 px**, weight 800
- Sibling: right-aligned section total only appears on the section's **bottom "Add" row** (see 4.6), not in the header. Clean.

### 4.4 Column headers

Immediately below each section:

```
ASSET                                                              ▾ VALUE
```

- Background: `rgb(36, 36, 36)` (one shade lighter than surface)
- Uppercase, tracking-wider, tiny — **10px / weight 600 / muted white**
- Right-side "VALUE" header has a **▾ sort chevron** indicating sort direction
- Hitbox: whole header is clickable to toggle sort (inferred from `sortKey`/`sortOrder` in API responses)

### 4.5 Rows

Default row:
```
Chase - TOTAL CHECKING - 5988 [👁]                        $168 ▼  [📝] [⋮]
```

- **Left column**: account/asset name, primary weight. A trailing **eye icon 👁** toggles "hide from net worth" (confirmed by seeing it on rows we know are hidden in the right-most numeric column returning 0).
- **Value** right-aligned in white, ~13–14 px
- **Trend indicator** — tiny ▼ or ▲ triangle next to value = day change direction. Red down, green up.
- **Row tools** at far right: a **note icon 📝** (attach comment) and **⋮ menu** (row actions: edit, move to section, archive, delete)
- **Hover state**: rows get a slight brightness lift (surface goes from ~21 → 26)
- **Row height**: ~40 px
- **Horizontal padding**: ~16 px left and right

**Disconnected (stale / unlinked) rows**:
```
Chase - CHASE SAVINGS - 2990                              $0   [📝] [⋮]
  (disconnected)
```

- Name in **italic** + muted white
- Sub-line `(disconnected)` in ~10px, muted
- Value shown but struck-through visually in the sense that it's in quiet styling (matches the "stale price" concept from your Summa spec)

**Multi-currency rows** (Debts example):
```
Ink - 7895                                                $0
  (disconnected)                                     USD 22,280
```

- Primary value = display-currency equivalent
- Secondary value = native currency amount, 11px muted — right-aligned and shown **below** the primary value
- This matches your `native-currency-editing-design` spec — Kubera's pattern is: primary = converted, secondary = original.

**Credit card rows** (Debts, Bank of America):
```
Bank of America  [👁]  [$4,704 AVAILABLE]                 $2,295
```

- An inline pill-shaped badge showing **available credit**: `$4,704 AVAILABLE` — warm yellow/amber tone, tight padding, ~11px uppercase label
- Balance shown in standard right column

**Warning row** (Debts, Nelnet):
```
Nelnet - Education Financing [👁]                         $14,988  ⚠
```

- Yellow-amber triangle ⚠ at far right = account sync issue or manual-edit warning

### 4.6 Section footer (Add row)

Each section ends with:
```
+  ADD ASSET                                                  $168
```

- **+ ADD ASSET** in uppercase, left-aligned, accent styling (lighter weight / underline on hover probably)
- Section **total** right-aligned, bolder weight, matches column-total
- This row is **the section total** — it's integrated with the Add CTA, saving vertical space

### 4.7 Sheet-level footer

At the bottom of all sections:
```
Cash                                                          $218

+ NEW SECTION        + ADD ASSET
```

- First line: sheet name + sheet grand total, bold
- Second line: two text-button actions for adding a section or another asset (outside any existing section)

### 4.8 What we did NOT capture (follow-up)

- **Add-asset modal** — the flow after clicking "+ ADD ASSET". Need: ticker search behavior, fields shown, manual vs linked path, SimpleFIN/Plaid/Coinbase flows.
- **Asset detail panel** — what opens when you click a row (slide-from-right panel vs modal)
- **Right-click context menu** on a row
- **Inline cell edit** — double-click vs single-click behavior, input styling
- **Drag handle** — reordering rows and sheets
- **Column sort click** — transition animation
- **Collapse animation** — section chevron expand/collapse

**To capture these**, the next audit pass should use Kubera's actual DOM class stems. The spreadsheet table uses **styled-components** with generated class names (`sc-*`). Better selectors:
- Rows: `[data-cy^=row]` (seen in debts/assets HTML)
- Cells: `[data-cy^=cell]`
- Sheet tabs: `[data-cy^=sheetTab]` or the `$218`/`$84,437` text content
- Menu items: `menuNetWorth`, `menuAssets`, etc. (we verified these exist)

---

## 5. Detail panel / Asset detail

**Not captured** in this run. Kubera's row click opens an overlay/drawer; the exact implementation (right-slide drawer vs modal vs new page) needs a targeted interactive pass. Evidence from the `holding` endpoint (`/api/v1/auth/portfolio/holding`) shows each row has a `parentId` (for groupings) and `relatedId` chain — the detail panel likely expands to show child holdings, value history, transactions, and edit controls.

**API-side clues about what the detail panel shows**:
- `irr` field per sheet/section: `{"all":{"cashIn":5391.54, "cashOut":0, "cashTickerId":150, "dateEnd":"2026-0..."}`
- Per-custodian + per-section IRR updates via `POST /api/v1/auth/section/irrUpdate` and `POST /api/v1/auth/portfolio/sheet/irrUpdate`
- Each holding has `availableCredit`, `parentId`, `relatedId`, `sectionId`

Conclusion: detail panels show **cash-in / cash-out, IRR, and parent hierarchy**.

---

## 6. Charts

### 6.1 Libraries detected

- **`window.Chart`** (Chart.js) — present on all dark-theme routes (Assets, Debts, Documents, Insurance). Used for small per-asset sparklines and the dashboard chart.
- **Highcharts** — not detected.
- **Recharts** — not detected.
- **D3** — not detected.
- **ECharts** — not detected.

### 6.2 Dashboard Net Worth chart

- Full-width ~900 px below the stat cards
- Dual overlay: Net Worth line + Investable line
- Light-purple area fill with a slightly darker purple stroke
- Axis labels minimal or hidden; emphasis is on the shape, not precise tick readout
- Dropdown: **1 YEAR ▼** — options inferred from Recap `chart_timerange` param: `daily`, `weekly`, `monthly`, `yearly`, `all`
- Gear icon opens chart config (the `diyChart` POST endpoint confirms this is user-customizable)

### 6.3 Recap table (not really a chart but the key "analytics" view)

Screenshot: `04-recap.png`

- **Not** a chart — it's a **holdings matrix**: rows = assets (BTC, ETH, stocks, Coinbase USDC, etc.), columns = dates
- Header row: `15 APR 2026 / 14 APR 2026 / 13 APR 2026 [↗]` (↗ implies "show more days")
- Each asset has a left pie/donut glyph indicating its category
- Values right-aligned per cell
- "SHOW CHANGE" toggle at top-right to switch between **absolute** (shown) and **delta** view
- Three clickable dropdown headers: "**Net Worth** ▾", "**Daily** ▾", "**Totals** ▾" — i.e., `<scope> / <interval> / <aggregation>` axes
- Each row is expandable; Assets row has `▼` chevron revealing the per-holding breakdown

### 6.4 Color palette for charts

- Net Worth line: purple `#9B6BFF` (estimated from image) with fill at ~30% opacity
- Positive: green `rgb(0, 167, 7)` (light) / `rgb(121, 215, 98)` (dark) — dashboard uses the greener light-theme variant
- Negative: pure red `rgb(255, 0, 0)` both themes
- Benchmarks: S&P, BTC, GOLD each get their own color (not sampled precisely)

---

## 7. Recap

Full feature breakdown — see `04-recap.png` + `17-recap-deep.png`.

### 7.1 Header controls

```
Net Worth ▾     Daily ▾     Totals ▾            [🖨] [⬇]  [ SHOW CHANGE ]
```

- **Net Worth ▾**: selector for which portfolio scope to analyze (Net Worth, Assets only, Debts only, specific sheet, specific section)
- **Daily ▾**: time granularity (Daily, Weekly, Monthly, Yearly — bound to URL `chart_timerange`)
- **Totals ▾**: aggregation (Totals, Change, Change %)
- **Print icon** 🖨
- **Download/export icon** ⬇
- **SHOW CHANGE** toggle (chip-button, right-aligned) — flips table from absolute values to day-over-day deltas

### 7.2 Body: holdings matrix

- Rows grouped: `Net Worth → Assets → [individual tickers]`
- Each row has an expand chevron to drill into sub-rows
- **Ticker format**: `BTC • Bitcoin` (symbol + name), `VOO.UP • VANGUARD S&P 500 ETF` (with exchange suffix)
- **Right columns**: one per date, showing the position value in display currency
- Rows capture captured include: BTC, ETH, VOO.UP, GBTC.UV, SOL, COIN.NA, META.NA, SPOT.NY, PLTR.NY, PENN.NA, Coinbase-Spot-USDC, STX, VYM.UP, UAL.NA, BTC.UP
- Date-column arrow `↗` in the header of the most-recent date — click to scroll table horizontally to show further back in time

### 7.3 No explicit sector/asset-class/geo breakdown was visible on the primary Recap view

Kubera's taxonomies (sector, asset class, geography) likely live **inside** drill-down states via the `Net Worth ▾` dropdown. The URL has `chart_option=networth` → changing to `chart_option=asset_classes` (confirmed in the `diyChart` endpoint POST body: `chart_option%3Dasset_classes%26chart_timerange%3Dtoday%26chart_type%3Dtotals`) will switch to asset-class view. Other `chart_option` values to probe next pass: likely `sectors`, `custodians`, `currencies`.

### 7.4 Performance metrics

- IRR / CAGR not surfaced on the Recap table itself but are computed per section/sheet via `irrUpdate` endpoints
- Club percentile (6.87% on this account) is surfaced on Dashboard's CAGR·YTD card as `YOUR CLUB` comparison

---

## 8. Interactions & behavior (partial)

### 8.1 What we directly captured
- Sidebar hover: no visible transition (flat hover)
- Sheet tab text styling difference between active/inactive
- Section chevron present (`▼`) — click handler triggers collapse (not visually captured)

### 8.2 What we inferred from DOM + API but need a targeted interactive pass to confirm

| Interaction | Evidence | Where to look next |
|---|---|---|
| Row click → detail panel | `holding` endpoint returns full history with `parentId`/`relatedId` tree | Click a row, wait 2s, screenshot; look for `aside` / `[role=dialog]` sibling |
| Section collapse | `POST /api/v1/auth/section/irrUpdate` includes `expanded: 1` field per section | Click `▼`, look for `expanded: 0` response |
| Sheet tab reorder | Sheet object has `sortKey: "02"` | Drag a tab, look for PATCH with new sortKey |
| Row reorder | Unknown — not probed | Drag a row, look for network request |
| Keyboard: Tab to move between cells, Enter to edit | Standard spreadsheet pattern, not verified | Keyboard-driven crawl |
| Currency selector in top bar | `POST /api/v1/auth/user` seen firing with `utcOffset:0, tz:"UTC"` — currency is also likely persisted on user object | Click `USD $ ▼`, screenshot dropdown |
| AI Import (ChatGPT icon) | `utility/tickerInfoV3` returns `aiSupportedFileTypes: [json, pdf, xls, jpeg/jpg/png/webp, csv, txt]` | Click the drag overlay "AI Import: Drop files here" |
| "Refresh" in top bar | `POST /api/v1/auth/section/custodian/batchRefresh` | Already captured — body shows `hash` map of custodian IDs |

---

## 9. API patterns

### 9.1 Auth

- **Scheme**: AWS Cognito User Pool → JWT access token sent to app API
- **Issuer**: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Z25x0F3my`
- **Client ID**: `4s3p5qi7spb7cd5vtgj920ofvt`
- **Token lifetime**: exactly **1 hour** (`iat` vs `exp` delta = 3600s). Refresh token not seen (likely HttpOnly cookie or Cognito SDK-managed).
- **Scope**: `aws.cognito.signin.user.admin`
- **Accepted authentication transports** (all three work when set):
  1. Cookie `_kubera_session` (or similar — didn't isolate which name is canonical because we set multiple)
  2. `Authorization: Bearer <JWT>` header
  3. `localStorage` under `CognitoIdentityServiceProvider.<clientId>.<username>.accessToken` (app reads this to re-populate headers on every request)

### 9.2 API host and versioning

- Base: `https://api.kubera.com/api/v1/...`
- Everything under `/auth/` requires the JWT; `/public/clientinfo` is the only unauthenticated endpoint (app version probe)
- No GraphQL, no WebSockets detected in the capture

### 9.3 Catalogued endpoints (from 500-request network log)

**Bootstrap (every page load fires these 11 requests in parallel):**

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/public/clientinfo/web?beta=0` | App version probe for "new version available" banner |
| `GET /api/v1/auth/user` | Current user profile (name, email, tz, utc offset, provider, lastAccess) |
| `GET /api/v1/auth/user/preference` | Feature-flag-like flags per user/portfolio (tip visibility, etc.) |
| `GET /api/v1/auth/user/beneficiary` | Beneficiary records per portfolio |
| `GET /api/v1/auth/user/family/member` | Family member access sharing |
| `GET /api/v1/auth/portfolio` | List of portfolios user owns (each one = a full sheet/section tree) |
| `GET /api/v1/auth/utility/tickerInfoV3` | Ticker catalog: all supported asset symbols + metadata for AI-import support |
| `GET /api/v1/auth/portfolio/holding` | **Primary data fetch** — all holdings for all portfolios in one payload |
| `GET /api/v1/auth/portfolio/connectivityCenter` | Linked institutions (SimpleFIN/Plaid-equivalent connections) |
| `GET /api/v1/auth/portfolio/<id>/chartAndCAGR` | Net worth time-series for the chart + CAGR calc |
| `GET /api/v1/auth/portfolio/<id>/custodiansRecap` | Recap matrix data |
| `GET /api/v1/auth/portfolio/<id>/summaryStat` | Club percentiles + ratio medians for benchmarking |
| `GET /api/v1/auth/portfolio/<id>/fundSchedule` | Recurring contributions/SIPs |
| `GET /api/v1/auth/utility/analytics` | Empty in this account — likely custom analytics prefs |

**On viewing Assets or Debts specifically:**
- `GET /api/v1/auth/portfolio/<id>/change/size/100/type/day_year/tsStartDate/<unixTs>` — per-holding day & year changes used for the `+/-` badges
- `GET /api/v1/auth/portfolio/<id>/change/size/100/type/all/tsStartDate/<unixTs>` — same shape but all-time changes
- `GET /api/v1/auth/portfolio/irrUpdatedV2/<id>` — per-holding IRR map
- `GET /api/v1/auth/link/popularInstitution/Asset` (and `/Debt`) — institution list for the "Add Asset" picker; includes `aggregator: "zerion"` for crypto, `"plaid"` / `"simplefin"` / `"yodlee"` for banks (inferred)
- `POST /api/v1/auth/section/irrUpdate` — returns sections with expanded/sort state
- `POST /api/v1/auth/portfolio/sheet/irrUpdate` — returns sheets with IRR

**On interacting:**
- `POST /api/v1/auth/portfolio/<id>/diyChart` — saves a Recap chart customization (columns, chart IDs)
- `POST /api/v1/auth/user` — updates user profile
- `POST /api/v1/auth/section/custodian/batchRefresh` — triggers re-sync of linked custodians

### 9.4 Response shape conventions

Every response is wrapped in `{ data, errorCode }`. No pagination cursors seen — payloads are fetched whole (the `/holding` endpoint returns all holdings at once, no pagination parameters).

### 9.5 Third-party telemetry

- **LogRocket**: `r.intake-lr.com/i?a=vpbjam%2Fkubera` — session replay
- **Google Tag Manager / GA4**: `www.google.com/ccm/collect` (returned 400s, likely because the page didn't fully load GTM — these are safe to ignore for functional analysis)
- **No Segment / Mixpanel / Amplitude / Heap** detected

### 9.6 Caching headers

Not specifically sampled, but every data endpoint appears to be called on every nav (no client-side cache reuse observable), with small request volume. API response payloads are modest (under 20KB each, most under 3KB).

---

## 10. Gaps vs Summa (actionable punch-list)

Based on what Summa has in `src/components/portfolio/`, `src/components/dashboard/`, and the current `globals.css`:

### 10.1 Visual gaps

| Feature | Kubera | Summa (current state) | Action |
|---|---|---|---|
| Sidebar aggregate value per item | ✅ shows `$100,950` beside each nav item | ❓ likely not present | Add aggregate values to sidebar nav items, wire to the same net-worth query already used in dashboard |
| Sheet tabs with subtotals | ✅ `Cash $218` stacked below tab name | Partial (tabs exist) | Ensure the sub-total under each tab is rendered in muted weight |
| Section footer = Add + Total | ✅ `+ ADD ASSET` left + section total right in one row | Likely separate rows | Consolidate — saves vertical space |
| Disconnected row styling | ✅ italic + muted + "(disconnected)" sub-line | Banner-style (connection-banner.tsx) | Mirror the per-row italic-muted treatment in addition to the banner |
| Available credit pill | ✅ `$4,704 AVAILABLE` yellow pill on credit rows | Not yet | Add a `<Badge variant="available-credit">` to SheetSummaryRow credit detection |
| Row-level warning icon | ✅ ⚠ yellow triangle when data is stale/sync-broken | Not yet per-row | Per-row stale/error indicator alongside existing global banner |
| Sheet grand total at bottom | ✅ "Cash $218" above the `+ NEW SECTION` area | Likely present | Verify the bottom-total row is styled bolder than section totals |
| Per-row IRR / day-change arrow | ✅ red/green triangle next to value | Partial (net worth header has day change) | Add ▲/▼ mini-arrow to each row's value cell |
| Uppercase 10px column headers with tracking | ✅ `ASSET`/`VALUE` | Likely lowercase / title case | Switch column headers to uppercase + `letter-spacing: 0.05em` + `font-size: 10px` |
| Hero page total with inline 1-DAY / 1-YEAR changes | ✅ `$119,055  [1 DAY]-$190 (0.16%)  [1 YEAR]+$422 (0.36%)` on Assets/Debts | NetWorthHeader uses dashboard-only | Port the same 3-column layout to Assets and Debts headers |
| Top bar search + USD selector + avatar cluster | ✅ | Likely partial | Add the currency picker to top bar (per display-currency design) |

### 10.2 Feature gaps

| Feature | Kubera | Summa | Action |
|---|---|---|---|
| Recap "holdings matrix" view | ✅ pivot table of holdings × dates | Not yet | Spec: per-date snapshot of every holding value, joined from price history — existing `chartAndCAGR` data already covers the NET WORTH row; need per-holding history extension |
| `Net Worth / Daily / Totals` three-axis selector | ✅ | N/A | UI-only; can be built once Recap data is available |
| "SHOW CHANGE" toggle | ✅ switches between absolute and delta | N/A | Client-side toggle once matrix is built |
| Club percentile benchmark | ✅ peer cohort compare | N/A (and may be a feature we skip) | Flag — is this in scope? Requires aggregate data we won't have |
| AI Import (ChatGPT-style file drop) | ✅ | N/A | Defer; not a V1 feature |
| Fast Forward (retirement projection) | ✅ (empty in this account) | N/A | Out of scope for portfolio MVP |
| Beneficiary / Angel workflow | ✅ | N/A | Out of scope |
| Insurance / Documents sections | ✅ | N/A | Out of scope |
| Keyboard navigation (Tab/Enter for spreadsheet) | ✅ (inferred) | ❓ | Verify and implement if missing |
| Drag-and-drop sheet reorder | ✅ (inferred) | ❓ | Verify |

---

## 11. Style diff (concrete CSS adjustments)

Kubera's key token values translated to Summa's oklch/Tailwind system:

### 11.1 Dark theme (if we keep toggle)

Current Summa dark (`globals.css:93-97`):
```css
.dark {
  --background: oklch(0.145 0 0);   /* ≈ rgb(24, 24, 24) */
  --foreground: oklch(0.985 0 0);   /* ≈ rgb(250, 250, 250) */
  --card: oklch(0.205 0 0);         /* ≈ rgb(36, 36, 36) */
}
```

Kubera-mirrored dark:
```css
.dark {
  --background: oklch(0.09 0 0);    /* rgb(12, 12, 12) — slightly deeper */
  --foreground: oklch(0.94 0 0);    /* rgb(238, 238, 238) — NOT pure white */
  --card: oklch(0.23 0 0);          /* rgb(36, 36, 36) — matches */
  --muted-foreground: oklch(0.94 0 0 / 0.5);  /* key: 50% alpha, not a separate gray */
  --destructive: oklch(0.628 0.258 29.234);   /* pure rgb(255, 0, 0) */
  --positive: oklch(0.82 0.2 130);            /* rgb(121, 215, 98) — add this token */
}
```

**Important**: Kubera's muted text is **alpha-based** (`rgba(255,255,255,0.5)`) rather than a separate gray. This lets transparency compose over surface variants so the same token works on every row/section shade. Summa should adopt this: `--muted-foreground: color-mix(in oklch, var(--foreground), transparent 50%)` or equivalent.

### 11.2 Light theme (Summa is already close)

Current Summa light (`globals.css:54-71`):
```css
:root {
  --background: oklch(0.992 0 0);   /* nearly white — matches Kubera */
  --foreground: oklch(0.145 0 0);   /* near black — matches */
}
```

Kubera light uses pure `rgb(0,0,0)` text on pure `rgb(255,255,255)`, plus `rgb(252,252,252)` as the secondary surface and `rgb(219,219,219)` for dividers. Summa's oklch(0.97) / oklch(0.922) are acceptable neutral equivalents — no material change needed.

### 11.3 Typography tokens to add

```css
:root {
  /* Kubera-mirrored */
  --font-size-nano: 10px;     /* column headers, 1-DAY/1-YEAR mini labels */
  --font-size-micro: 11px;    /* secondary / badges */
  --font-size-tiny: 12px;     /* sheet tabs */
  --font-size-small: 13px;    /* dense table text */
  --font-size-base: 16px;     /* body default */
  --font-size-hero: 36px;     /* page total */

  --letter-spacing-upper: 0.05em;  /* for ASSET/VALUE column headers */
  --font-weight-tab: 800;          /* sheet tabs are heavy */
}
```

### 11.4 Spacing tokens

```css
:root {
  --sidebar-width: 222px;         /* matches Kubera */
  --topbar-height: 90px;          /* close enough */
  --row-height: 40px;
  --row-padding-x: 16px;
  --card-radius: 4px;             /* not 8px or 10px */
}
```

### 11.5 Chart color palette

Add a dedicated Kubera-matching series:
```css
:root {
  --chart-networth-stroke: oklch(0.63 0.2 300);   /* purple — approximates dashboard line */
  --chart-networth-fill:   oklch(0.85 0.09 300 / 0.25);
  --chart-positive: oklch(0.72 0.22 140);
  --chart-negative: oklch(0.63 0.25 29);
  /* benchmarks */
  --chart-sp500: oklch(0.65 0.19 250);
  --chart-btc:   oklch(0.75 0.17 60);
  --chart-gold:  oklch(0.80 0.16 90);
}
```

---

## Appendices

### A. Raw data locations

- `/opt/summa/kubera-audit/screenshots/` — 27 numbered PNGs at 1440×900 and responsive sizes
- `/opt/summa/kubera-audit/raw/*.html` — full HTML of 12+ page captures (includes generated class names for locator mining)
- `/opt/summa/kubera-audit/raw/*-tokens.json` — computed-style extractions per page
- `/opt/summa/kubera-audit/raw/*-dom.json` — 4-level DOM hierarchies
- `/opt/summa/kubera-audit/raw/network-log.json` — full XHR log from first crawl (500 entries)
- `/opt/summa/kubera-audit/raw/network-log-final.json` — XHR log from Assets/Debts-focused pass
- `/opt/summa/kubera-audit/raw/endpoints.json` + `endpoints-final.json` — deduped endpoint catalog with status counts + sample bodies
- `/opt/summa/kubera-audit/raw/summary.json` — cross-page style summary

### B. Scripts

- `audit.js` — first full crawl (auth probe + 6 primary routes + responsive)
- `deep.js` — second pass that was run but discovered `/portfolio` and `/insights` are wrong URLs
- `deep2.js` — corrected third pass (`/assets`, `/debts`, `/fastforward`, `/documents`, `/insurance`) + interaction stubs

### C. Suggested next audit pass

If we decide we need the interactive-states gap filled, run a targeted fourth pass using a fresh Cognito access token. The script needs:

1. Navigate to `/assets`, wait for `[data-cy^=row]` to be present
2. Click first `[data-cy^=row]` → screenshot the detail panel
3. Right-click the row → screenshot the context menu
4. Click "+ ADD ASSET" in the Cash section → screenshot the add-asset picker
5. Click the "AI Import: Drop files here" zone → screenshot any resulting flow
6. Click the first sheet tab's `⋮` → screenshot the sheet menu
7. Click `▼` on the Cash section → screenshot collapsed state
8. Drag the first row downward (simulate `mousedown → mousemove → mouseup`) → screenshot ghost + drop indicator
9. Click `USD $ ▼` in the top bar → screenshot currency picker
10. Click the `↻` refresh icon → screenshot loading state

Estimated runtime ~90 seconds per pass; well within the 1-hour token window.
