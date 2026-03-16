# Summa — Development Spec (v0.1)

> 5-week sprint from empty repo to deployed, open-sourced net worth tracker.
> Reference: `kubera-replacement-spec.md` for full product spec.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | Next.js 15 (App Router) | One codebase, one deploy target. Route handlers for REST API. No monorepo overhead. |
| **Language** | TypeScript end-to-end | Shared types between server and client without a `packages/shared` directory. |
| **UI** | Tailwind CSS + shadcn/ui | Themeable, accessible, copy-paste components. No runtime CSS overhead. |
| **Table** | TanStack Table | Headless, handles column defs, row models, cell rendering. No built-in UI = full control. |
| **Data Fetching** | TanStack Query | Client-side cache + optimistic updates. Essential for spreadsheet-feel inline editing. |
| **Client State** | Zustand | Lightweight — UI-only state (selected rows, panel open/close, active sheet). |
| **Charts** | Recharts | React-native, composable, good defaults for financial time series. |
| **ORM** | Drizzle | Type-safe schema, lightweight, fast migrations, excellent Postgres support. |
| **Database** | PostgreSQL 16 | JSON columns for provider_config/metadata, concurrent writes from cron + users. |
| **Auth** | Better Auth | Self-hosted, session-based, supports email/password + TOTP (TOTP deferred to v0.1.1). |
| **Jobs** | node-cron | Simple scheduled tasks for v0.1. Upgrade to BullMQ when we need retries/queues. |
| **Deployment** | Docker Compose | Single `docker compose up` — Next.js app + Postgres. |

### Why Next.js over Hono + Vite monorepo

The product spec lists Hono as a candidate. Next.js wins for this sprint because:

1. **One deploy target.** One Dockerfile, one container, no nginx for static files, no CORS config.
2. **No monorepo overhead.** No Turborepo, no pnpm workspaces, no `packages/shared` for types. Types are just imports.
3. **Auth middleware is trivial.** `src/middleware.ts` protects routes. No separate auth-checking layer.
4. **API-first principle is preserved.** Route handlers at `/api/*` are a full REST API. External clients hit them the same way they'd hit a standalone Hono server.
5. **Saves 1-2 days of Day 0 setup** that goes directly into feature work.

If the API ever needs to be split out (e.g., for a mobile app with different latency requirements), the route handlers can be ported to Hono in a day — they're just functions.

### Why TanStack Query, not just RSC + revalidatePath

React Server Components are great for initial page loads. But the spreadsheet UI has specific requirements that demand client-side cache management:

- **Optimistic updates.** User edits a cell → net worth total updates instantly → API call fires in background → rollback on failure. `revalidatePath` would cause a full re-render with a server round-trip.
- **Batch mutations.** Reordering, multi-select archive, bulk edits — need to queue and batch mutations.
- **Stale-while-revalidate.** Show cached data while refetching. Price feeds update every 15 min; don't flash a loading state on every navigation.

**Hybrid approach:** Server components for the initial page shell (layout, auth check, SSR the portfolio data). TanStack Query on the client for all data fetching and mutations from that point on. Zustand for ephemeral UI state only (active sheet, panel open/close, selected rows).

---

## Project Structure

```
summa/
├── src/
│   ├── app/                              # Next.js App Router
│   │   ├── layout.tsx                    # Root layout (theme provider, auth wrapper, QueryClientProvider)
│   │   ├── page.tsx                      # Redirect to /dashboard or /login
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (app)/                        # Authenticated layout group
│   │   │   ├── layout.tsx                # Sidebar + top bar
│   │   │   ├── dashboard/page.tsx        # Net worth overview + charts
│   │   │   └── portfolio/
│   │   │       └── [portfolioId]/
│   │   │           ├── page.tsx          # Spreadsheet view (sheets/sections/rows)
│   │   │           └── settings/page.tsx
│   │   └── api/                          # REST API route handlers
│   │       ├── portfolios/
│   │       │   ├── route.ts              # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       ├── route.ts          # GET (full tree), PATCH, DELETE
│   │       │       ├── sheets/route.ts
│   │       │       ├── sections/route.ts
│   │       │       ├── assets/route.ts
│   │       │       └── snapshots/route.ts
│   │       ├── assets/
│   │       │   └── [id]/
│   │       │       ├── route.ts          # GET, PATCH, DELETE
│   │       │       ├── move/route.ts     # POST (move to section)
│   │       │       └── snapshots/route.ts
│   │       ├── prices/
│   │       │   ├── search/route.ts       # Ticker search (Yahoo + CoinGecko)
│   │       │   └── quote/route.ts        # Get current price
│   │       ├── snapshots/
│   │       │   └── take/route.ts         # POST — trigger manual snapshot
│   │       └── auth/
│   │           └── [...betterauth]/route.ts
│   ├── components/
│   │   ├── ui/                           # shadcn/ui primitives
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── topbar.tsx
│   │   │   └── theme-toggle.tsx
│   │   ├── portfolio/
│   │   │   ├── net-worth-header.tsx
│   │   │   ├── sheet-tabs.tsx
│   │   │   ├── section-group.tsx
│   │   │   ├── section-header.tsx
│   │   │   ├── asset-table.tsx           # TanStack Table instance
│   │   │   ├── asset-row.tsx
│   │   │   ├── editable-cell.tsx         # Click-to-edit value cell
│   │   │   ├── currency-input.tsx        # Smart input: "EUR 500", "BTC 1.5"
│   │   │   ├── money-display.tsx         # Formatted currency display
│   │   │   ├── add-asset-dialog.tsx      # Modal with ticker search
│   │   │   └── detail-panel.tsx          # Slide-out right panel
│   │   └── charts/
│   │       ├── net-worth-chart.tsx
│   │       ├── allocation-donut.tsx
│   │       └── assets-debts-chart.tsx
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts                  # Drizzle client instance
│   │   │   ├── schema.ts                 # All table definitions
│   │   │   ├── seed.ts                   # Dev + demo data
│   │   │   └── migrations/
│   │   ├── auth.ts                       # Better Auth config
│   │   ├── providers/
│   │   │   ├── yahoo.ts
│   │   │   ├── coingecko.ts
│   │   │   ├── exchange-rates.ts
│   │   │   └── types.ts                  # PriceProvider interface
│   │   ├── cron.ts                       # Snapshot + price update scheduler
│   │   ├── currency.ts                   # Parse "EUR 500", conversion logic
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── use-portfolio.ts              # TanStack Query: fetch + mutate portfolio tree
│   │   ├── use-assets.ts                 # TanStack Query: asset CRUD + optimistic updates
│   │   ├── use-snapshots.ts              # TanStack Query: chart data
│   │   └── use-ticker-search.ts          # Debounced search
│   ├── stores/
│   │   └── ui-store.ts                   # Zustand: active sheet, panel state, selections
│   └── types/
│       └── index.ts                      # Shared TypeScript types (inferred from Drizzle schema)
├── public/
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml                # Postgres only, for local dev
└── .env.example
```

---

## Database Schema

```typescript
// src/lib/db/schema.ts

import { pgTable, uuid, text, timestamp, integer, boolean,
         numeric, jsonb, pgEnum, date, uniqueIndex } from "drizzle-orm/pg-core";

// ── Enums ──

export const sheetTypeEnum = pgEnum("sheet_type", ["assets", "debts"]);
export const providerTypeEnum = pgEnum("provider_type", [
  "manual", "ticker", "wallet", "exchange",
  "simplefin", "snaptrade", "zillow", "vin", "custom"
]);
export const snapshotSourceEnum = pgEnum("snapshot_source", [
  "provider", "manual", "import"
]);

// ── Users ──

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Portfolios ──

export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  startDate: date("start_date"),              // for chart range default
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Sheets ──

export const sheets = pgTable("sheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: sheetTypeEnum("type").notNull().default("assets"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Sections ──

export const sections = pgTable("sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  sheetId: uuid("sheet_id").notNull().references(() => sheets.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Assets ──

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("other"),
  // Free text, not an enum. Users want custom types.
  // UI suggests: "stock", "etf", "crypto", "cash", "real_estate", "vehicle", "other"
  sortOrder: integer("sort_order").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  quantity: numeric("quantity", { precision: 20, scale: 8 }),       // null = value-only mode
  costBasis: numeric("cost_basis", { precision: 20, scale: 2 }),
  currentValue: numeric("current_value", { precision: 20, scale: 2 }).notNull().default("0"),
  currentPrice: numeric("current_price", { precision: 20, scale: 8 }),  // null = manual value entry
  isInvestable: boolean("is_investable").notNull().default(true),
  isCashEquivalent: boolean("is_cash_equivalent").notNull().default(false),
  providerType: providerTypeEnum("provider_type").notNull().default("manual"),
  providerConfig: jsonb("provider_config").$type<{
    ticker?: string;         // "AAPL", "bitcoin" (CoinGecko ID)
    exchange?: string;       // "NASDAQ", "NYSE", "CRYPTO"
    source?: string;         // "yahoo" | "coingecko"
    walletAddress?: string;
    connectionId?: string;
  }>().default({}),
  ownershipPct: numeric("ownership_pct", { precision: 5, scale: 2 }).notNull().default("100"),
  notes: text("notes"),
  metadata: jsonb("metadata").default({}),
  isArchived: boolean("is_archived").notNull().default(false),
  staleDays: integer("stale_days"),            // null = never stale
  linkedDebtId: uuid("linked_debt_id"),        // self-ref for mortgage ↔ property
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Asset Snapshots (one per asset per day) ──

export const assetSnapshots = pgTable("asset_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  value: numeric("value", { precision: 20, scale: 2 }).notNull(),
  valueInBase: numeric("value_in_base", { precision: 20, scale: 2 }).notNull(), // converted to portfolio currency
  price: numeric("price", { precision: 20, scale: 8 }),
  quantity: numeric("quantity", { precision: 20, scale: 8 }),
  source: snapshotSourceEnum("source").notNull().default("provider"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueAssetDate: uniqueIndex("asset_snapshot_unique").on(table.assetId, table.date),
}));

// ── Portfolio Snapshots (pre-aggregated daily) ──
// Charts query this table directly — fast reads, no expensive aggregation.

export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  totalAssets: numeric("total_assets", { precision: 20, scale: 2 }).notNull(),
  totalDebts: numeric("total_debts", { precision: 20, scale: 2 }).notNull(),
  netWorth: numeric("net_worth", { precision: 20, scale: 2 }).notNull(),
  cashOnHand: numeric("cash_on_hand", { precision: 20, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniquePortfolioDate: uniqueIndex("portfolio_snapshot_unique").on(table.portfolioId, table.date),
}));

// ── Exchange Rates (cached daily) ──

export const exchangeRates = pgTable("exchange_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  base: text("base").notNull(),            // "USD"
  rates: jsonb("rates").notNull(),          // { "EUR": 0.92, "GBP": 0.79, ... }
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

// Sessions table is managed by Better Auth — not defined here.
```

### Key Schema Decisions

1. **Debts are assets on debt-type sheets.** `currentValue` stores a positive number. Net worth = sum of asset-sheet rows − sum of debt-sheet rows. No sign-flipping in the data layer.

2. **Portfolio snapshots are pre-aggregated.** The daily cron writes one `portfolioSnapshots` row per portfolio per day. Charts query this table directly — O(days) not O(days × assets).

3. **`numeric` for all money.** Never float. `(20, 2)` for values (up to $99 quadrillion). `(20, 8)` for crypto quantities/prices.

4. **`providerConfig` is JSONB.** Each provider type uses different fields. Strict validation happens at the provider adapter level, not the database.

5. **`type` on assets is free text, not an enum.** Users will want custom types. The UI provides suggestions but accepts anything.

6. **`valueInBase` on asset snapshots.** Stores the value converted to the portfolio's base currency at the day's exchange rate. This ensures historical charts are accurate — we don't retroactively apply today's exchange rates to last year's data.

7. **`isCollapsed` is NOT stored in the database.** It's UI-only state, stored in Zustand. Avoids unnecessary API calls when toggling sections.

---

## Pre-flight (Day 0)

Before writing any feature code, scaffold the project and make sure the full toolchain works.

**Steps:**

1. `npx create-next-app@latest summa --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`.
2. Install deps: `pnpm add drizzle-orm postgres @tanstack/react-query @tanstack/react-table zustand recharts better-auth zod node-cron`.
3. Install dev deps: `pnpm add -D drizzle-kit @types/node`.
4. Initialize shadcn/ui: `npx shadcn@latest init`. Add components: button, input, dialog, dropdown-menu, tabs, sheet (panel), sonner, command, badge, separator, skeleton.
5. Set up `drizzle.config.ts` pointing at `src/lib/db/schema.ts`.
6. Write `docker-compose.dev.yml` — Postgres 16 only, exposed on 5432, named volume, healthcheck.
7. Write the schema file. Run `pnpm drizzle-kit generate && pnpm drizzle-kit migrate`.
8. Add a `GET /api/health` route handler returning `{ ok: true, timestamp: Date.now() }`.
9. Set up `QueryClientProvider` in root layout. Set up Zustand UI store.
10. Set up theme provider (shadcn `next-themes`) with system preference + toggle.

**Baseline configs:**
- ESLint (Next.js default) + Prettier.
- `tsconfig.json` with `strict: true`, path alias `@/*` → `./src/*`.
- `.env.example` with `DATABASE_URL`, `BETTER_AUTH_SECRET`.
- `.gitignore` — node_modules, .next, .env.

**Exit criteria:** `docker compose -f docker-compose.dev.yml up -d && pnpm dev` starts Postgres + Next.js. Hit `localhost:3000/api/health` and get JSON back. Frontend renders "Summa" with theme toggle working. Database has all tables.

---

## Week 1–2: The Table

The spreadsheet UI is the product. This is the most important two weeks.

### Day 1: Auth + database schema + seed data

#### Auth setup

Better Auth configured on day 1 so every subsequent feature works behind auth from the start. No retrofitting.

```
POST /api/auth/register  → create user → set session cookie → redirect /dashboard
POST /api/auth/login     → verify password → set session cookie → redirect /dashboard
POST /api/auth/logout    → destroy session → redirect /login
```

- `src/middleware.ts` protects all `/(app)` routes — redirect to `/login` if no session.
- API route handlers check session via `auth.api.getSession({ headers })`.
- **Single-user mode:** Register endpoint returns 403 when `users` table is non-empty. First visitor creates the account.
- Login page (`src/app/(auth)/login/page.tsx`): email + password form, link to register.
- Register page: email, name, password, confirm password. Only shown when no users exist.

#### Seed data (`src/lib/db/seed.ts`)

A script that populates realistic development fixtures:

- 1 user (dev@summa.sh / password)
- 1 portfolio ("My Net Worth", USD)
- 4 sheets: "Cash & Banking" (assets), "Investments" (assets), "Crypto" (assets), "Debts" (debts)
- 2 sections per sheet (e.g., "Checking & Savings" and "Other Cash" under Cash & Banking; "Brokerage" and "Retirement" under Investments)
- 8-12 asset rows with realistic names, tickers, and values:
  - Cash: Chase Checking ($12,500), Marcus Savings ($50,000), Emergency Fund ($22,500)
  - Investments: Fidelity 401k ($245,000 — AAPL, VTI, BND as metadata), Schwab Brokerage ($85,000)
  - Crypto: Bitcoin ($42,000 — 0.65 BTC), Ethereum ($8,500 — 2.8 ETH), Solana ($3,200 — 25 SOL)
  - Debts: Mortgage ($265,000), Student Loan ($18,000)
- 90 days of historical portfolio snapshots (backfilled with slight daily variance for chart testing)

This seed data serves three purposes: dev fixture, chart testing, and README screenshot source.

Add `pnpm db:seed` script. Also add `pnpm db:reset` (drop + migrate + seed) for quick iteration.

### Day 2–3: API route handlers

All routes return JSON. All mutations accept JSON bodies validated with Zod. Session cookie auth on everything except `/api/auth/*` and `/api/health`.

#### Portfolios

```
GET    /api/portfolios                          → list user's portfolios
POST   /api/portfolios                          → create portfolio { name, currency }
GET    /api/portfolios/[id]                     → full tree: portfolio → sheets → sections → assets
PATCH  /api/portfolios/[id]                     → update { name?, currency? }
DELETE /api/portfolios/[id]                      → delete + cascade
```

**The tree query** (`GET /api/portfolios/[id]`) is the main data fetch. Returns the full nested structure in one response using Drizzle relational queries:

```typescript
// Response shape
{
  id: string
  name: string
  currency: string
  sheets: [{
    id: string
    name: string
    type: "assets" | "debts"
    sortOrder: number
    sections: [{
      id: string
      name: string
      sortOrder: number
      assets: [{
        id: string
        name: string
        type: string
        currency: string
        quantity: number | null
        currentPrice: number | null
        currentValue: number
        costBasis: number | null
        isInvestable: boolean
        isCashEquivalent: boolean
        providerType: string
        providerConfig: object
        ownershipPct: number
        sortOrder: number
        isArchived: boolean
        notes: string | null
        staleDays: number | null
        lastSyncedAt: string | null
        updatedAt: string
      }]
    }]
  }]
  // Computed at query time:
  netWorth: number
  totalAssets: number
  totalDebts: number
  cashOnHand: number
}
```

This single endpoint powers 90% of the frontend. Keep it fast.

#### Sheets

```
POST   /api/portfolios/[id]/sheets              → create sheet { name, type }
PATCH  /api/portfolios/[id]/sheets              → update sheet { id, name?, type?, sortOrder? }
DELETE /api/portfolios/[id]/sheets              → delete sheet { id } (cascade)
POST   /api/portfolios/[id]/sheets/reorder      → bulk update sortOrder [{ id, sortOrder }]
```

#### Sections

```
POST   /api/portfolios/[id]/sections            → create section { sheetId, name }
PATCH  /api/portfolios/[id]/sections            → update section { id, name?, sortOrder? }
DELETE /api/portfolios/[id]/sections            → delete section { id } (cascade)
POST   /api/portfolios/[id]/sections/reorder    → bulk update sortOrder [{ id, sortOrder }]
```

#### Assets

```
POST   /api/portfolios/[id]/assets              → create asset { sectionId, name, type, currency, value, ... }
GET    /api/assets/[id]                          → get asset with recent snapshots
PATCH  /api/assets/[id]                          → update any field(s)
DELETE /api/assets/[id]                          → archive (set isArchived = true)
POST   /api/assets/[id]/move                    → move to section { sectionId, sortOrder }
POST   /api/portfolios/[id]/assets/reorder      → bulk update sortOrder [{ id, sortOrder }]
```

#### Snapshots

```
GET    /api/portfolios/[id]/snapshots            → portfolio snapshots for charts { from?, to? }
GET    /api/assets/[id]/snapshots                → asset snapshots for detail panel { from?, to? }
POST   /api/snapshots/take                       → trigger manual snapshot for a portfolio { portfolioId }
```

#### Prices (Week 3, but define the routes now)

```
GET    /api/prices/search?q=AAPL                 → combined Yahoo + CoinGecko search
GET    /api/prices/quote?symbol=AAPL&source=yahoo → current price
```

#### Validation + Error Handling

- **Zod schemas** for all request bodies. Defined in `src/types/index.ts` alongside the TypeScript types (inferred from Drizzle schema where possible). Shared between API validation and frontend form validation.
- **Error shape:** All errors return `{ error: string, details?: Record<string, string[]> }`. Zod validation errors map to `details` with field-level messages.
- **Auth check:** Helper function `requireAuth(request)` that returns the session or throws 401.
- **Ownership check:** Every mutation verifies the resource belongs to the authenticated user's portfolio. No cross-user access.

### Day 3–4: Frontend table with mock data, then wire to API

Build the spreadsheet UI against hardcoded mock data first. Iterate on UX without backend round-trips. Then swap mock data for API calls.

#### Mock data (`src/lib/mock-data.ts`)

A single `Portfolio` object matching the API response shape. Mirror the seed data — same sheets, sections, assets, values. Delete this file once the API is wired up.

#### Zustand UI store (`src/stores/ui-store.ts`)

```typescript
interface UIStore {
  activeSheetId: string | null
  setActiveSheet: (id: string) => void

  detailPanelAssetId: string | null   // null = closed
  openDetailPanel: (assetId: string) => void
  closeDetailPanel: () => void

  collapsedSections: Set<string>      // section IDs
  toggleSection: (sectionId: string) => void

  selectedAssetIds: Set<string>       // for future bulk actions
  toggleAssetSelection: (assetId: string) => void
  clearSelection: () => void
}
```

Note: `isCollapsed` is client-only state. No API call when toggling a section.

#### TanStack Query hooks (`src/hooks/`)

```typescript
// use-portfolio.ts
function usePortfolio(id: string) {
  return useQuery({
    queryKey: ['portfolio', id],
    queryFn: () => fetch(`/api/portfolios/${id}`).then(r => r.json()),
  })
}

// use-assets.ts
function useUpdateAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Asset> }) =>
      fetch(`/api/assets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(r => r.json()),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['portfolio'] })
      const previous = queryClient.getQueryData(['portfolio'])
      // Optimistically update the asset in the cached portfolio tree
      queryClient.setQueryData(['portfolio'], (old) => updateAssetInTree(old, id, data))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(['portfolio'], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    },
  })
}

// Same pattern for useCreateAsset, useArchiveAsset, useReorderAssets, etc.
```

**Data flow:**

```
User edits a value cell
  → EditableCell calls useUpdateAsset().mutate({ id, data: { currentValue: 50000 } })
  → onMutate: optimistically update asset in TanStack Query cache
  → NetWorthHeader (reading from same cache) recomputes instantly
  → API PATCH fires in background
  → onSettled: invalidate → refetch full tree → reconcile
  → If API failed: onError rolls back to previous cache state + toast error
```

#### Component tree

```
<PortfolioPage>                             // src/app/(app)/portfolio/[portfolioId]/page.tsx
  <TopBar />                                // portfolio name, search, +Add button, settings
  <NetWorthHeader />                        // big number + assets/debts/cash subtotals
  <ChartSection />                          // collapsible — charts go here in week 2
  <SheetTabs />                             // horizontal tabs for sheets
  <SheetView>                               // content for active sheet
    <SectionGroup key={section.id}>         // one per section
      <SectionHeader />                     // name + chevron + section total + add asset btn
      <AssetTable />                        // TanStack Table
        <AssetRow />                        // one per asset
          <EditableCell />                  // inline-editable value/quantity/price cells
    </SectionGroup>
  </SheetView>
  <DetailPanel />                           // slide-out from right, if detailPanelAssetId is set
</PortfolioPage>
```

#### Component Specs

**`NetWorthHeader`**
- Displays: "Net Worth: $1,234,567" — large, bold, primary text.
- Sub-line: "Assets: $1,500,000 &middot; Debts: $265,433 &middot; Cash: $85,000"
- All values derived from TanStack Query cache (the portfolio tree). Recomputes instantly on optimistic updates.
- Format with `Intl.NumberFormat` using portfolio's base currency.
- Positive change indicator: green up arrow + amount. Negative: red down arrow. (Computed from yesterday's portfolio snapshot, if available. Blank until snapshots exist.)

**`SheetTabs`**
- Horizontal tab bar. One tab per sheet. Active tab highlighted.
- Click to switch `activeSheetId` in Zustand.
- "+" button at end → popover with name input + type selector (Assets/Debts).
- Three-dot icon or right-click on tab → Rename, Delete (with confirmation if section has assets).
- Reorder: up/down arrows in the three-dot menu. No drag.

**`SectionGroup` + `SectionHeader`**
- Collapsible — chevron toggles `collapsedSections` in Zustand.
- Header shows: section name (double-click to rename inline), asset count, section total value.
- "Add Asset" button at the right of the header or at the bottom of the collapsed group.
- Reorder: up/down arrows (visible on hover).
- Three-dot menu: Rename, Delete (confirmation if has assets), Move to sheet.

**`AssetTable` (TanStack Table)**

| Column | Width | Behavior |
|--------|-------|----------|
| Reorder | 40px | Up/down arrow buttons. Visible on row hover. |
| Name | flex | Click opens detail panel. Double-click to edit inline. |
| Type | 80px | Badge (stock, crypto, cash, etc.). Click to change. |
| Ticker | 80px | Muted text from `providerConfig.ticker`. Non-editable. |
| Quantity | 100px | Editable if asset has quantity. Blank if value-only mode. |
| Price | 100px | Auto-updated for ticker assets. Editable for manual. Shows "stale" badge if `lastSyncedAt` is old. |
| Value | 130px | **Primary editable cell.** Right-aligned, formatted currency. Always editable. |
| Change | 90px | $ change vs yesterday's snapshot. Green/red. Blank until snapshots exist. |
| Allocation | 70px | % of sheet total. Computed. Right-aligned, muted text. |
| Actions | 40px | Three-dot menu: Edit details, Archive, Move to section, Delete. |

**TanStack Table config:**
- `getCoreRowModel()` only. No sorting, filtering, pagination.
- Custom cell renderers for all editable cells.
- Row data: filter portfolio tree by active sheet, flatten sections → assets.
- Filter out `isArchived = true` by default. Toggle to show them (dimmed, italic).

**`EditableCell`**
- **Display mode:** Formatted value as static text. Click transitions to edit mode.
- **Edit mode:** Raw `<input type="text">` pre-filled with unformatted number. Auto-select all on focus.
- **Commit:** Enter or blur → parse value → call mutation → return to display mode.
- **Cancel:** Escape → revert to previous value → return to display mode.
- **Tab:** Commit current cell → focus next editable cell in the row (quantity → price → value).
- **Smart input (currency-input.tsx):** Parses multiple formats:
  ```
  "1500"        → { amount: 1500, currency: portfolio.currency }
  "$1,500"      → { amount: 1500, currency: "USD" }
  "EUR 500"     → { amount: 500, currency: "EUR" }
  "BTC 1.5"     → { amount: 1.5, currency: "BTC" }
  "¥150000"     → { amount: 150000, currency: "JPY" }
  "1500 GBP"    → { amount: 1500, currency: "GBP" }
  ```
  If the parsed currency differs from the asset's currency, update the asset's currency too.

**`AddAssetDialog`**
- Triggered by "Add Asset" button in section header, or the "+" button in the top bar.
- Modal dialog with:
  - **Name input** — autofocus. Doubles as ticker search (debounce 300ms, 2+ chars). Results appear in a `Command` combobox dropdown below.
  - **Type dropdown** — suggestions: Stock, ETF, Crypto, Cash, Real Estate, Vehicle, Other. Free text accepted.
  - **Value input** — smart currency input.
  - **Quantity + Price toggle** — checkbox "Track by quantity × price". If checked, shows quantity and price fields.
  - **Section selector** — defaults to the section the user clicked "Add" in. Dropdown to change.
- Selecting a ticker search result auto-fills: name, type, ticker, providerType, providerConfig, current price + value.
- Submit → POST to API → optimistic insert at bottom of selected section → close dialog.

**`DetailPanel`**
- Slide-out from right. 480px wide. Overlays main content (doesn't push it).
- Opens when user clicks an asset name. Closes on X, Escape, or clicking outside.
- **Header:** Asset name (editable), type badge, provider badge (manual/ticker).
- **Tabs:**
  - **Value** — current value display, sparkline chart of recent values (from asset snapshots), manual value update form.
  - **Notes** — plain text area. Auto-saves on blur.
  - **Settings** — provider type selector, provider config (ticker, source), ownership %, stale-after-days, archive toggle, delete button (hard delete with confirmation).
- **Footer:** "Created [date] · Updated [date] · Last synced [date]"

### Day 5–7: Interactions polish

All CRUD operations with full optimistic update flow:

1. **Add asset** — POST, optimistic insert at bottom of section.
2. **Edit asset** — PATCH, optimistic field update. Inline editing on name (double-click), value (click), quantity, price.
3. **Archive asset** — PATCH `isArchived: true`, optimistic remove from visible list. Toast with "Undo" action (PATCH back to false).
4. **Delete asset** — DELETE with confirmation dialog ("Delete [name]? This cannot be undone."). Hard delete.
5. **Reorder assets** — POST reorder, optimistic swap `sortOrder` with neighbor.
6. **Add/rename/delete sheets** — full CRUD. Tab UI updates immediately.
7. **Add/rename/delete sections** — full CRUD. Inline rename on double-click.
8. **Reorder sheets/sections** — up/down arrows, optimistic swap.
9. **Move asset between sections** — POST move, optimistic remove from old section + insert into new.

### Day 8–10: Edge cases + UX tightening

- **Empty states:** "No assets yet — click + to add one" for empty sections. "Create your first sheet to get started" for empty portfolios.
- **Loading states:** Skeleton rows (shadcn `Skeleton`) while portfolio tree is loading. Inline spinner on individual cell saves.
- **Error handling:** Toast notifications via `sonner` for all failed mutations. "Failed to save — retrying..." with TanStack Query automatic retry (3 attempts, exponential backoff).
- **Number formatting:** `Intl.NumberFormat` everywhere. Portfolio's base currency. Negative debts in red with minus sign.
- **Keyboard navigation:** Tab between editable cells. Enter to commit + move down. Escape to cancel. (Arrow keys to navigate rows is a stretch goal.)
- **Responsive:** Table scrolls horizontally on small screens. Net worth header stacks vertically. Hide Allocation % and Change columns below 1024px.
- **Confirm destructive actions:** Deleting a sheet or section with assets shows a confirmation dialog: "Delete [name]? This will permanently delete [N] assets."
- **Dark mode:** shadcn + next-themes handles most of this. Verify: table borders, hover states, editable cell focus ring, charts, detail panel all work in both modes.
- **Stale indicators:** If `asset.providerType !== 'manual'` and `now - lastSyncedAt > staleDays`, show a muted "stale" badge next to the price. Manual assets with `staleDays` set show stale if `now - updatedAt > staleDays`.

**Exit criteria (Week 1–2):** Auth works (register + login). Full CRUD on sheets, sections, and assets. Inline editing works. Smart currency input parses "EUR 500". Net worth total updates live on optimistic edits. Detail panel opens and shows asset info. Data persists in Postgres across page refreshes. Dark mode works. No mock data remaining.

---

## Week 3: Price Feeds + Your Data

### Day 11–12: Yahoo Finance + CoinGecko

#### Provider interface (`src/lib/providers/types.ts`)

```typescript
interface PriceProvider {
  type: string
  getPrice(symbol: string, currency: string): Promise<PriceResult>
  search(query: string): Promise<SearchResult[]>
}

interface PriceResult {
  price: number
  currency: string
  source: string
  timestamp: Date
}

interface SearchResult {
  symbol: string         // "AAPL" or "bitcoin" (CoinGecko ID)
  name: string           // "Apple Inc." or "Bitcoin"
  exchange: string       // "NASDAQ" or "crypto"
  type: "stock" | "etf" | "crypto" | "index" | "mutualfund"
  source: "yahoo" | "coingecko"
}
```

#### Yahoo Finance provider (`src/lib/providers/yahoo.ts`)

```typescript
import yahooFinance from 'yahoo-finance2'

export const yahooProvider: PriceProvider = {
  type: 'yahoo',

  async getPrice(symbol: string) {
    const result = await yahooFinance.quote(symbol)
    return {
      price: result.regularMarketPrice!,
      currency: result.currency!,
      source: 'yahoo',
      timestamp: new Date(),
    }
  },

  async search(query: string) {
    const results = await yahooFinance.search(query)
    return results.quotes
      .filter(q => q.isYahooFinance)
      .map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange,
        type: mapQuoteType(q.quoteType),  // EQUITY → stock, ETF → etf, etc.
        source: 'yahoo' as const,
      }))
  },
}
```

#### CoinGecko provider (`src/lib/providers/coingecko.ts`)

```typescript
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

export const coingeckoProvider: PriceProvider = {
  type: 'coingecko',

  async getPrice(coinId: string, vsCurrency = 'usd') {
    const res = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`
    )
    const data = await res.json()
    return {
      price: data[coinId][vsCurrency],
      currency: vsCurrency.toUpperCase(),
      source: 'coingecko',
      timestamp: new Date(),
    }
  },

  async search(query: string) {
    const res = await fetch(`${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`)
    const data = await res.json()
    return data.coins.slice(0, 20).map(c => ({
      symbol: c.id,        // 'bitcoin' — used as the ID for price lookups
      name: c.name,        // 'Bitcoin'
      exchange: 'crypto',
      type: 'crypto' as const,
      source: 'coingecko' as const,
    }))
  },
}
```

**Rate limiting:** In-memory token bucket (Map<string, { tokens, lastRefill }>) in front of CoinGecko calls. Max 25 req/min. Cache all results for 5 minutes (Map<key, { data, expiresAt }>). If CoinGecko returns 429, back off for 60 seconds.

#### API route: ticker search

`GET /api/prices/search?q=AAPL`

1. Fire Yahoo search + CoinGecko search in parallel (`Promise.allSettled`).
2. Merge results. Deduplicate by symbol (prefer Yahoo for stocks, CoinGecko for crypto).
3. Sort: exact symbol matches first, then by name relevance.
4. Return top 15 results.

### Day 12–13: Ticker search UX

The `AddAssetDialog` name input already has the combobox structure from week 1-2. Now wire it to the search API:

1. User types 2+ characters → 300ms debounce → `GET /api/prices/search?q={query}`.
2. Results appear in the Command dropdown: "AAPL — Apple Inc. (NASDAQ, Stock)" / "bitcoin — Bitcoin (Crypto)".
3. Selecting a result:
   - `name` = display name ("Apple Inc.")
   - `type` = result type ("stock")
   - `providerType` = "ticker"
   - `providerConfig` = `{ ticker: "AAPL", source: "yahoo", exchange: "NASDAQ" }` or `{ ticker: "bitcoin", source: "coingecko" }`
   - Immediately fetch current price via `GET /api/prices/quote?symbol=AAPL&source=yahoo`
   - Populate `currentPrice` and `currentValue` (default quantity = 1, so value = price)
4. User can still type a custom name, skip the dropdown, and create a manual asset.

### Day 13–14: Background price refresh + daily snapshots

#### Cron setup (`src/lib/cron.ts`)

Imported from `src/instrumentation.ts` (Next.js instrumentation hook — runs once on server start, not on every request):

```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/cron')
  }
}
```

#### Price refresh — every 15 minutes

```typescript
cron.schedule('*/15 * * * *', async () => {
  const tickerAssets = await db.select().from(assets)
    .where(and(eq(assets.providerType, 'ticker'), eq(assets.isArchived, false)))

  // Group by source
  const yahooSymbols = tickerAssets
    .filter(a => a.providerConfig?.source === 'yahoo')
    .map(a => a.providerConfig!.ticker!)
  const coingeckoIds = tickerAssets
    .filter(a => a.providerConfig?.source === 'coingecko')
    .map(a => a.providerConfig!.ticker!)

  // Batch fetch — Yahoo supports multi-symbol, CoinGecko supports comma-separated
  const [yahooPrices, coingeckoPrices] = await Promise.allSettled([
    yahooSymbols.length ? batchYahooQuotes(yahooSymbols) : {},
    coingeckoIds.length ? batchCoingeckoPrices(coingeckoIds) : {},
  ])

  // Update each asset
  for (const asset of tickerAssets) {
    const price = getPriceForAsset(asset, yahooPrices, coingeckoPrices)
    if (price == null) continue
    const value = asset.quantity ? Number(asset.quantity) * price : price
    await db.update(assets).set({
      currentPrice: String(price),
      currentValue: String(value),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(assets.id, asset.id))
  }

  console.log(`[cron] Updated ${tickerAssets.length} asset prices`)
})
```

**Batching is critical.** Don't make one API call per asset:
- Yahoo: `yahooFinance.quote(['AAPL', 'GOOGL', 'VTI'])` — supports arrays.
- CoinGecko: `/simple/price?ids=bitcoin,ethereum,solana` — comma-separated.
- Batch in groups of 50 to stay within rate limits.

#### Daily snapshot — midnight UTC

```typescript
cron.schedule('0 0 * * *', async () => {
  const allPortfolios = await db.select().from(portfolios)

  for (const portfolio of allPortfolios) {
    const allAssets = await getPortfolioAssets(portfolio.id) // join through sheets → sections → assets
    const rates = await getExchangeRates(portfolio.currency)
    const today = new Date().toISOString().split('T')[0]

    let totalAssets = 0, totalDebts = 0, cashOnHand = 0

    for (const asset of allAssets) {
      const valueInBase = convertCurrency(Number(asset.currentValue), asset.currency, portfolio.currency, rates)

      // Write asset snapshot
      await db.insert(assetSnapshots).values({
        assetId: asset.id,
        date: today,
        value: asset.currentValue,
        valueInBase: String(valueInBase),
        price: asset.currentPrice,
        quantity: asset.quantity,
        source: asset.providerType === 'manual' ? 'manual' : 'provider',
      }).onConflictDoUpdate({
        target: [assetSnapshots.assetId, assetSnapshots.date],
        set: { value: asset.currentValue, valueInBase: String(valueInBase), price: asset.currentPrice, quantity: asset.quantity },
      })

      // Accumulate for portfolio snapshot
      if (asset.sheetType === 'assets') {
        totalAssets += valueInBase
        if (asset.isCashEquivalent) cashOnHand += valueInBase
      } else {
        totalDebts += valueInBase
      }
    }

    // Write portfolio snapshot
    await db.insert(portfolioSnapshots).values({
      portfolioId: portfolio.id,
      date: today,
      totalAssets: String(totalAssets),
      totalDebts: String(totalDebts),
      netWorth: String(totalAssets - totalDebts),
      cashOnHand: String(cashOnHand),
    }).onConflictDoUpdate({
      target: [portfolioSnapshots.portfolioId, portfolioSnapshots.date],
      set: { totalAssets: String(totalAssets), totalDebts: String(totalDebts), netWorth: String(totalAssets - totalDebts), cashOnHand: String(cashOnHand) },
    })
  }

  console.log(`[cron] Snapshotted ${allPortfolios.length} portfolios`)
})
```

#### Stale check — every 6 hours

```typescript
cron.schedule('0 */6 * * *', async () => {
  // Mark manual assets as stale if updatedAt + staleDays < now
  // Mark ticker assets as stale if lastSyncedAt + staleDays < now
  // "Stale" is not a DB column — it's computed at read time from staleDays + timestamps.
  // This cron is just for logging/alerting. The frontend computes stale status from the data.
  console.log(`[cron] Stale check complete`)
})
```

### Day 15: Migrate your Kubera data

Manual QA with real financial data. This is the most important testing you'll do.

1. Export from Kubera (CSV or manual transcription).
2. Enter assets by hand using the add-asset flow. Intentionally don't build CSV import yet — this forces you through every UX path.
3. Verify:
   - All sheets/sections render correctly
   - Ticker search finds your actual holdings
   - Auto-pricing matches Kubera's values (within rounding / timing)
   - Net worth total matches Kubera's
   - Archived assets hide/show properly
   - Reorder, move between sections, edit all work
   - Smart currency input handles your currencies
4. File bugs for everything that doesn't work. Fix them this day.

**Exit criteria (Week 3):** Stocks and crypto auto-price via Yahoo/CoinGecko. Ticker search works in add-asset dialog. Background price refresh runs every 15 min. Daily snapshots are being recorded. Stale badges appear for old data. Your real financial data is in the app and matches Kubera.

---

## Week 4: Charts + Multi-Currency + Deploy

### Day 16–17: Charts

Three charts, all using Recharts. Data sourced from `portfolioSnapshots` table (pre-aggregated, fast reads).

#### Snapshot API (`GET /api/portfolios/[id]/snapshots`)

Query params: `from` (date), `to` (date). Returns:

```typescript
{
  data: Array<{
    date: string          // "2024-01-15"
    netWorth: number
    totalAssets: number
    totalDebts: number
    cashOnHand: number
  }>
}
```

#### `NetWorthChart` (Recharts AreaChart)

- Gradient fill under the line (blue, fading to transparent).
- X-axis: dates (formatted "Jan 15", "Feb 1", etc.). Y-axis: dollar values (abbreviated: "$1.2M").
- Tooltip: exact value + date on hover.
- **Date range selector:** Buttons: 1M, 3M, 6M, YTD, 1Y, ALL. Updates `from` query param + refetches.
- Responsive: full width, 300px height desktop, 200px mobile.
- Collapsible (user can hide charts to maximize table space). Persist collapse state in localStorage.

#### `AllocationDonut` (Recharts PieChart)

- Donut chart showing allocation by sheet (e.g., "Cash & Banking: 15%, Investments: 65%, Crypto: 20%").
- Each slice labeled with sheet name + percentage.
- Colors: distinct, accessible palette. Use shadcn chart colors.
- Center text: total (net worth or total assets — user toggle).
- Click a slice to switch to that sheet tab.

#### `AssetsDebtsChart` (Recharts AreaChart)

- Stacked area chart. Two areas: total assets (green) and total debts (red), with net worth as the gap between them.
- Same date range selector as net worth chart (shared state).
- Useful for seeing debt payoff progress over time.

**Chart section placement:** Below `NetWorthHeader`, above `SheetTabs`. Laid out as a responsive grid:
- Desktop: NetWorthChart takes full width. AllocationDonut and AssetsDebtsChart side by side below it.
- Mobile: All three stacked vertically.
- Collapsible via a "Charts" toggle/chevron.

### Day 18: Multi-currency

**Approach:** Assets store values in their native currency. Convert to portfolio base currency for display and aggregation.

#### Exchange rate provider (`src/lib/providers/exchange-rates.ts`)

Use ECB data via `frankfurter.app` (free, no key, reliable):

```typescript
async function fetchExchangeRates(base: string): Promise<Record<string, number>> {
  const res = await fetch(`https://api.frankfurter.app/latest?from=${base}`)
  const data = await res.json()
  return data.rates
}
```

For crypto ↔ fiat, use CoinGecko's price data (already fetched during price refresh).

#### Implementation

1. Cron job fetches rates daily → stores in `exchangeRates` table (cache for 24h).
2. **At display time:** For each asset where `asset.currency !== portfolio.currency`, convert: `displayValue = currentValue * rate`. Conversion is client-side using cached rates (fetched once on page load).
3. **At snapshot time:** `valueInBase` column stores the converted value at that day's rate. Historical charts use this — they don't retroactively apply today's rates.
4. **Frontend:** If an asset's currency differs from portfolio currency, show a small muted badge: "€500 → $540" next to the value.
5. **Currency input:** The smart input parser (already built) detects currency prefixes/suffixes and updates the asset's currency if it changes.

### Day 19: Docker + Deploy

#### Dockerfile

```dockerfile
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Requires `output: 'standalone'` in `next.config.ts`.

#### docker-compose.yml (production)

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://summa:${DB_PASSWORD}@db:5432/summa
      BETTER_AUTH_SECRET: ${AUTH_SECRET}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: summa
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: summa
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U summa"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
```

One `app` container (Next.js serves both frontend + API). One `db` container. No nginx needed — Next.js handles static files.

#### docker-compose.dev.yml (development)

```yaml
services:
  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: summa
      POSTGRES_PASSWORD: summa
      POSTGRES_DB: summa
    volumes:
      - pgdata_dev:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U summa"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata_dev:
```

### Day 20–21: Deploy + dog-food

1. Push to GitHub (private repo).
2. SSH into server, clone repo.
3. Create `.env`:
   ```
   DB_PASSWORD=$(openssl rand -hex 32)
   AUTH_SECRET=$(openssl rand -hex 32)
   ```
4. `docker compose up -d --build`.
5. Hit the server URL → register → create portfolio → enter all your Kubera data (if not already migrated).
6. Set up reverse proxy (Caddy recommended — automatic HTTPS):
   ```
   summa.yourdomain.com {
     reverse_proxy localhost:3000
   }
   ```
7. Use the app as your daily net worth tracker. Fix bugs as you find them.

**Exit criteria (Week 4):** All three charts render with real historical data. Multi-currency conversion works. Auth protects everything. Docker Compose deploys cleanly with one command. App is running on your server. You've cancelled Kubera.

---

## Week 5: Open Source Launch

### Day 22–23: README + polish

#### README.md

```markdown
# Summa

> The balance sheet you actually own.

[Screenshot: spreadsheet table populated with realistic demo data, dark mode]

Open-source, self-hosted net worth tracker. Track stocks, crypto, real estate,
cash, debts — everything in one spreadsheet-style dashboard. A self-hosted
alternative to Kubera ($249/yr).

## Features

- **Spreadsheet UI** — sheets, sections, inline editing. Not cards or tiles.
- **Auto-pricing** — stocks/ETFs (Yahoo Finance) and crypto (CoinGecko)
- **Multi-currency** — per-asset currencies, auto-conversion to portfolio base
- **Net worth chart** — track your wealth over time with daily snapshots
- **Asset allocation** — donut chart by category
- **Dark mode** — system preference or manual toggle
- **REST API** — every operation available programmatically
- **Docker deploy** — `docker compose up` and you're running

## Quick Start

\`\`\`bash
git clone https://github.com/[you]/summa.git
cd summa
cp .env.example .env   # edit AUTH_SECRET and DB_PASSWORD
docker compose up -d
# Open http://localhost:3000
\`\`\`

## Screenshots

[Table view — light mode]
[Charts — dark mode]
[Mobile — responsive table]

## Tech Stack

Next.js 15 · TypeScript · Tailwind CSS · shadcn/ui · TanStack Table ·
TanStack Query · Zustand · Recharts · Drizzle ORM · PostgreSQL 16 ·
Better Auth · Docker

## Roadmap

- [x] v0.1 — Spreadsheet UI, auto-pricing, charts, multi-currency, Docker deploy
- [ ] v0.2 — Crypto wallet tracking (BTC, ETH, SOL on-chain)
- [ ] v0.3 — Bank & brokerage syncing (SimpleFIN, SnapTrade)
- [ ] v0.4 — IRR, benchmarking, performance analytics
- [ ] v0.5 — Real estate, vehicles, alternative assets
- [ ] v0.6 — Estate planning, dead man's switch, sharing
- [ ] v0.7 — AI import, projections, MCP server
- [ ] v1.0 — PWA, plugins, i18n, one-click app store installs

## Contributing

[CONTRIBUTING.md]

## License

AGPL-3.0
```

#### The screenshot

Populate seed data with realistic but obviously fake data:
- "Tech Portfolio" sheet: AAPL, GOOGL, MSFT, NVDA with real-ish quantities
- "Crypto" sheet: BTC, ETH, SOL
- "Real Estate" section: "Primary Residence — $650,000"
- "Debts" sheet: "Mortgage — $420,000", "Student Loan — $28,000"
- Net worth ~$1.2M
- Dark mode screenshot (looks better in READMEs)

### Day 23–24: Polish pass

- [ ] Fix all known bugs from personal usage
- [ ] Verify dark mode end-to-end (table, charts, detail panel, auth pages, dialogs)
- [ ] First-run onboarding: register → auto-create portfolio with one "Assets" sheet + one "Getting Started" section
- [ ] Footer/about: version number + "Powered by Summa" + GitHub link
- [ ] `LICENSE` file (AGPL-3.0)
- [ ] `.github/ISSUE_TEMPLATE/bug_report.md` + `feature_request.md`
- [ ] `.github/FUNDING.yml` if using GitHub Sponsors
- [ ] Verify `docker compose up` works from a clean clone (test on a fresh machine/VM)

### Day 25: Launch

1. Make GitHub repo public.
2. Create GitHub Release v0.1.0 with changelog.
3. Post to communities:

**r/selfhosted:**
```
Title: I built an open-source alternative to Kubera ($249/yr) — self-hosted net worth tracker

[Screenshot]

I was paying $249/year for Kubera to track my net worth across stocks, crypto,
real estate, and debts. So I built my own.

- Spreadsheet UI (like Kubera — rows and columns, not cards)
- Auto-pricing: Yahoo Finance + CoinGecko
- Multi-currency support
- Net worth chart over time
- Docker Compose deploy
- AGPL-3.0

[Link to repo]

Roadmap: wallet tracking, bank syncing ($15/yr via SimpleFIN), DeFi positions,
IRR calculations, estate planning. All planned as free, self-hosted features.
```

**Hacker News (Show HN):**
```
Title: Show HN: Summa – Open-source self-hosted net worth tracker

[Link to repo]

I was tired of paying $249/yr for Kubera to see my net worth in one place.
Built an open-source, self-hosted alternative.

Next.js + Postgres. Spreadsheet UI with auto-pricing via Yahoo Finance
and CoinGecko. Multi-currency, daily snapshots, Docker deploy.

AGPL-3.0. Contributions welcome.
```

**r/personalfinance:** Focus on privacy + cost savings, not tech.

---

## Migration Path to v0.2+

The schema already accommodates future features without breaking changes:

| Version | What | Schema impact |
|---------|------|---------------|
| **v0.2** — Crypto wallets | `providerType: "wallet"`, blockchain provider adapters | `providerConfig` already supports `walletAddress`. No migrations. |
| **v0.3** — Bank syncing | SimpleFIN + SnapTrade adapters | New tables: `holdings`, `transactions`. No changes to `assets`. |
| **v0.4** — Performance | IRR calculations, benchmarking | New table: `cashFlows`. Reads from `cashFlows` + `assetSnapshots`. |
| **v0.5** — Alt assets | Zillow, VIN lookup, domain valuation | New provider adapters. `linkedDebtId` already exists for mortgage linking. |
| **v0.6** — Estate planning | Dead man's switch, beneficiaries | New tables: `beneficiaries`, `documents`. Standalone feature. |
| **v0.7** — AI features | PDF/CSV import, projections, MCP | New tables: `projectionScenarios`. Integration layer, not schema changes. |

---

## Key Risks + Mitigations

| Risk | Mitigation |
|------|-----------|
| **TanStack Table learning curve** | Start with `getCoreRowModel()` only. No sorting, filtering, virtualization. Add features only as needed. |
| **Yahoo Finance rate limiting or breakage** | `yahoo-finance2` handles retries. Cache aggressively. Show stale price with timestamp if fetch fails. |
| **CoinGecko free tier limits (10-30 req/min)** | Batch requests (comma-separated IDs). Cache 5 min. Consider free demo API key (500 req/min). |
| **Scope creep during week 1–2** | The table is the product. Charts and detail panel are week 2 stretch. If behind, ship without donut chart. |
| **Schema changes mid-sprint** | Drizzle migrations from day 1. Never edit a migration after applying. New migration for every change. |
| **Next.js instrumentation for cron** | `instrumentation.ts` runs once on server start. If flaky, fall back to a separate `node cron.js` process in Docker. |
| **Docker build times** | Use `docker-compose.dev.yml` (Postgres only) during development. Only build full Docker in week 4. |
| **Optimistic updates consistency** | TanStack Query's `onMutate`/`onError`/`onSettled` pattern with rollback. `invalidateQueries` on settle to reconcile. |

---

## What's Intentionally NOT in v0.1

- Drag-and-drop reorder (up/down arrows only)
- CSV import (manual entry only — v0.2 or v0.3)
- Sidebar navigation beyond portfolio list (single portfolio is fine)
- SimpleFIN / SnapTrade / wallet integrations (v0.2–v0.3)
- IRR / XIRR / performance metrics (v0.4)
- Mobile-native layouts (responsive but desktop-first)
- Multi-user / sharing / role-based access (v0.6)
- 2FA / TOTP (v0.1.1 — Better Auth supports it natively)
- Redis caching layer (in-memory cache is fine for single-user)
- Nested portfolios / multi-entity (v0.8)
- i18n / localization (v1.0)

---

## Design Tokens

```css
/* Light mode */
--bg:          #FFFFFF;
--bg-surface:  #F8F9FA;
--bg-sidebar:  #1E1E2E;     /* always dark */
--accent:      #3B82F6;
--positive:    #22C55E;
--negative:    #EF4444;
--text:        #111827;
--text-muted:  #6B7280;
--border:      #E5E7EB;

/* Dark mode */
--bg:          #0F0F0F;
--bg-surface:  #1A1A1A;
--text:        #F9FAFB;
--text-muted:  #9CA3AF;
--border:      #2D2D2D;

/* Shared */
--font:        "Inter", sans-serif;
--radius-card: 8px;
--radius-input: 6px;
--radius-badge: 4px;

/* Stale row: italic text + muted background */
--stale-bg:    #F3F4F6 (light) / #2A2A2A (dark);
```

Implemented via Tailwind CSS custom theme + shadcn/ui CSS variables. Dark mode via `next-themes` with `class` strategy.
