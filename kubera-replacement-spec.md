# **Summa**
### Open-Source Self-Hosted Net Worth Tracker
### [summa.sh](https://summa.sh)

> *summa* (Latin) — "the total, the sum, the whole"

> "The balance sheet you actually own."

An open-source, self-hosted alternative to Kubera ($249-2,499/year) — track every asset, every debt, every chain, every account in one place. Your data never leaves your server.

---

## Vision

A single pane of glass for your entire financial life. Stocks, crypto, DeFi, real estate, vehicles, private equity, cash, debts — all in one self-hosted dashboard with automated syncing, performance tracking, and estate planning. No subscriptions, no data harvesting, no vendor lock-in.

**Why this matters:** Maybe Finance proved the demand (54k GitHub stars) but failed on business model. Ghostfolio, Wealthfolio, Firefly III, and Actual Budget each solve one slice. Nobody has built the unified, multi-asset-class, self-hosted net worth tracker. Until now.

---

## Target Users

1. **Self-hosters** who want financial sovereignty (primary)
2. **High-net-worth individuals** tired of paying $249+/year for Kubera
3. **Crypto-native users** who need DeFi + traditional finance in one view
4. **Privacy-conscious** users who refuse to send financial data to the cloud
5. **Developers/tinkerers** who want an extensible API-first platform

---

## Core Design Principles

1. **Spreadsheet-first UI** — The table is the product. Not cards, not tiles. Rows and columns, like Kubera. Progressive disclosure via slide-out detail panels.
2. **Every asset class, day one architecture** — Data model supports stocks, crypto, real estate, vehicles, domains, PE/VC, collectibles, debts, and custom assets from the start. Not bolted on later.
3. **Pluggable data sources** — Provider/adapter pattern for price feeds, valuations, and account syncing. Community can build adapters.
4. **Privacy by default** — All data stays on the user's server. No telemetry, no analytics, no phone-home. Optional encrypted backup.
5. **API-first** — Every feature accessible via REST API. The web UI is just one client.
6. **Sensible defaults, infinite flexibility** — Works out of the box, but power users can customize everything.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend** | React + TypeScript + Vite | Ecosystem, hiring pool, component libraries |
| **UI Framework** | Tailwind CSS + shadcn/ui | Clean, customizable, no vendor lock-in |
| **Charts** | Recharts or Tremor | React-native charting, good for financial data |
| **Backend** | Node.js + Hono (or Fastify) | Fast, TypeScript end-to-end, lightweight |
| **ORM** | Drizzle | Type-safe, lightweight, great DX |
| **Database** | PostgreSQL | JSON support, proven at scale, extensions |
| **Cache** | Redis (optional) | Price feed caching, rate limit management |
| **Auth** | Better Auth or Lucia | Self-hosted friendly, session-based |
| **Jobs/Cron** | BullMQ or node-cron | Scheduled price updates, sync jobs |
| **Container** | Docker + Docker Compose | Standard self-hosted deployment |
| **Monorepo** | Turborepo | Shared types between frontend/backend |

**Alternative consideration:** If we want maximum community appeal + simpler stack, Next.js full-stack (App Router + Server Actions + API routes) could reduce complexity. Trade-off is coupling frontend and backend.

---

## Data Model (Core Entities)

```
Portfolio
├── id, name, currency, created_at, updated_at
├── start_date (for chart range)
└── owner_id → User

Sheet (organizational tab within a portfolio)
├── id, portfolio_id, name, sort_order
└── type: "assets" | "debts"

Section (group within a sheet)
├── id, sheet_id, name, sort_order

Asset (a single row — the core entity)
├── id, section_id, name, type, sort_order
├── currency, quantity, cost_basis
├── current_value, current_price
├── is_investable, is_cash_equivalent
├── provider_type (manual | ticker | wallet | exchange | simplefin | snaptrade | zillow | vin | ...)
├── provider_config (JSON — ticker symbol, wallet address, API key ref, connection ID, etc.)
├── ownership_pct (default 100%)
├── notes, metadata (JSON)
├── is_archived, stale_after_days
└── linked_debt_id → Asset (for mortgage ↔ property linking)

AssetSnapshot (historical values — one per asset per day)
├── id, asset_id, date, value, price, quantity
└── source: "provider" | "manual" | "import"

CashFlow (for IRR calculation)
├── id, asset_id, date, type: "cash_in" | "cash_out"
├── amount, currency, note

Holdings (sub-positions within a connected account, e.g. stocks in a brokerage)
├── id, parent_asset_id, symbol, name
├── quantity, cost_basis, current_value, current_price
├── asset_class, sector, region

Transaction (from SimpleFIN/exchange sync)
├── id, asset_id, date, amount, description
├── category, pending

Document
├── id, asset_id (nullable), portfolio_id
├── filename, mime_type, storage_path, size

User
├── id, email, name, password_hash, totp_secret
├── default_currency, default_tax_rate

Beneficiary (dead man's switch)
├── id, user_id, name, email
├── type: "primary" | "backup"
├── inactivity_days (default 45)
├── last_activity_at

Provider (registered data source adapters)
├── id, type, name, config (JSON — API keys, tokens, etc.)
├── user_id, status, last_sync_at, error_log
```

---

## Syncing Architecture

### Provider Adapter Interface

```typescript
interface DataProvider {
  type: string;
  connect(config: ProviderConfig): Promise<Connection>;
  sync(connection: Connection): Promise<SyncResult>;
  getAccounts(connection: Connection): Promise<Account[]>;
  getHoldings(connection: Connection, accountId: string): Promise<Holding[]>;
  getTransactions(connection: Connection, accountId: string, since?: Date): Promise<Transaction[]>;
  getBalance(connection: Connection, accountId: string): Promise<Balance>;
  disconnect(connection: Connection): Promise<void>;
}

interface PriceProvider {
  type: string;
  getPrice(symbol: string, currency: string): Promise<number>;
  getHistoricalPrices(symbol: string, currency: string, from: Date, to: Date): Promise<PricePoint[]>;
  search(query: string): Promise<SearchResult[]>;
}
```

### Sync Tiers (Priority Order)

| Tier | Provider | Covers | Cost | Auth |
|------|----------|--------|------|------|
| **1** | Manual entry | Anything | Free | None |
| **2** | Yahoo Finance / CoinGecko | Stock & crypto prices | Free | None / API key |
| **3** | Blockchain APIs (Blockstream, Etherscan, Helius) | BTC/ETH/SOL wallet balances + tokens | Free | Free API key |
| **4** | Zerion API | Multi-chain DeFi positions (8000+ protocols) | Free (2k req/mo) | Free API key |
| **5** | Exchange APIs (Coinbase, Kraken, Gemini) | CEX balances + holdings | Free | Read-only API key |
| **6** | SimpleFIN Bridge | Banks, credit cards, loans, brokerages (16k+ institutions) | $15/year (user pays) | SimpleFIN token |
| **7** | SnapTrade | Brokerage accounts (Fidelity, Schwab, etc.) | Free (5 connections) | OAuth |
| **8** | Schwab / IBKR direct APIs | Power user brokerage access | Free | OAuth / API key |
| **9** | Zillow / VIN lookup / EstiBot | Real estate, vehicles, domains | Free (scraping/APIs) | None |
| **10** | AI-assisted import | PDF/CSV/screenshot parsing | Free (local LLM) or API cost | None |

### Sync Schedule

- **Price feeds**: Every 15 min during market hours, hourly otherwise
- **Blockchain wallets**: Every 30 min
- **Exchange balances**: Every 1-4 hours
- **SimpleFIN**: Once daily (API limit: 24 req/day)
- **SnapTrade**: Once daily (free tier: cached daily)
- **Manual assets**: User-triggered, with stale indicators
- **Snapshots**: Daily at midnight (store asset values for historical charts)

---

## Feature Roadmap

### v0.1 — Foundation (MVP)
> Goal: A working self-hosted net worth tracker you'd actually use daily.

**Core:**
- [ ] User auth (email/password, TOTP 2FA)
- [ ] Portfolio CRUD (create, rename, delete, set currency)
- [ ] Sheets & Sections (create, rename, reorder, delete)
- [ ] Asset rows (add, edit, archive, reorder, move between sections)
- [ ] Manual value entry (with multi-currency support: "EUR 500", "BTC 1.5")
- [ ] Quantity × Price mode (toggle per asset)
- [ ] Debt tracking (same row model, separate sheets/sections)
- [ ] Net worth calculation (assets - debts)
- [ ] Daily snapshots (cron job stores values)
- [ ] Dashboard: net worth number, total assets, total debts, cash on hand

**Charts:**
- [ ] Net worth over time (line chart, configurable date range)
- [ ] Asset allocation breakdown (donut chart by sheet/section)
- [ ] Assets vs debts over time

**Data:**
- [ ] Price feeds: Yahoo Finance (stocks/ETFs) + CoinGecko (crypto)
- [ ] Auto-price update for ticker-based assets
- [ ] Search for tickers (stocks + crypto) when adding assets
- [ ] CSV import (flexible column mapping, like Wealthfolio's approach)

**UI:**
- [ ] Spreadsheet-style table (the main view)
- [ ] Slide-out asset detail panel (value history, notes)
- [ ] Dark mode + light mode
- [ ] Responsive (desktop-first, mobile-functional)

**Infra:**
- [ ] Docker Compose deployment (app + postgres)
- [ ] REST API for all operations
- [ ] Comprehensive README + quick-start guide

**What this replaces from Kubera:** Basic net worth tracking with manual entry, auto-priced stocks/crypto, organizational structure, and historical charts.

---

### v0.2 — Crypto & Wallet Tracking
> Goal: First-class crypto support that rivals Kubera's.

- [ ] Bitcoin wallet tracking (Blockstream/Mempool API — enter xpub or address)
- [ ] Ethereum wallet tracking (Etherscan — ETH + ERC-20 token detection)
- [ ] Solana wallet tracking (Helius — SOL + SPL token detection)
- [ ] Multi-chain DeFi position tracking (Zerion API)
- [ ] Exchange API connections (Coinbase, Kraken, Gemini — read-only API keys)
- [ ] Holdings expansion (click exchange/wallet row → see individual tokens inline)
- [ ] Stablecoin → "Cash Equivalent" auto-classification
- [ ] Provider settings page (manage API keys, wallet addresses)
- [ ] Connection health indicators (last synced, errors)

---

### v0.3 — Bank & Brokerage Syncing
> Goal: Automated account syncing for $15/year.

- [ ] SimpleFIN integration (balances, transactions, holdings)
- [ ] SimpleFIN setup wizard (user pastes token, app discovers accounts)
- [ ] SnapTrade integration (brokerage positions, cost basis)
- [ ] Account matching (map SimpleFIN/SnapTrade accounts to existing asset rows)
- [ ] Transaction history view (from SimpleFIN)
- [ ] Sync status dashboard (last sync, errors, connection health)
- [ ] Schwab Trader API integration (OAuth flow)
- [ ] IBKR Web API integration (read-only portfolio)

---

### v0.4 — Performance & Analytics
> Goal: IRR, benchmarking, and the full Recap section.

- [ ] Cash flow entries per asset (Cash In / Cash Out)
- [ ] IRR calculation engine (XIRR algorithm)
- [ ] IRR benchmarking (compare against S&P 500, BTC, custom benchmarks)
- [ ] CAGR calculation
- [ ] Investable assets metric (auto-classify + manual toggle)
- [ ] Tax estimate on unrealized gains (configurable rate)
- [ ] Recap section with full chart suite:
  - Net worth, assets, debts over time
  - By sheet, by section breakdowns
  - Asset class allocation
  - Consolidated holdings across all accounts
  - Stocks by sector
- [ ] Target allocation with rebalancing suggestions
- [ ] Top performers / underperformers view
- [ ] Export: CSV, JSON, PDF report

---

### v0.5 — Alternative Assets
> Goal: Track everything Kubera tracks.

- [ ] Real estate valuation (Zillow Zestimate for US addresses)
- [ ] Vehicle valuation (VIN lookup)
- [ ] Domain valuation (API-based appraisal)
- [ ] Mortgage ↔ property linking (show equity)
- [ ] Loan amortization schedules (auto-calculate remaining balance)
- [ ] Committed capital & unfunded commitments (PE/VC)
- [ ] Capital call & distribution schedule
- [ ] Ownership percentage per asset (default 100%)
- [ ] Interest rate auto-compounding for manual debt entries
- [ ] Custom asset type framework (user-defined fields)

---

### v0.6 — Estate Planning & Collaboration
> Goal: The dead man's switch and sharing features.

- [ ] Beneficiary designation (primary + backup)
- [ ] Dead man's switch (configurable inactivity period)
- [ ] Check-in email flow (5 notifications over 10 days)
- [ ] Automated data export to beneficiary (encrypted download link)
- [ ] Document vault (attach files to assets or portfolio-level)
- [ ] Read-only shareable links (passcode + expiry)
- [ ] Multi-user support (invite family/advisor with role-based access)
- [ ] Portfolio-level sharing (granular access control)

---

### v0.7 — AI Features & Projections
> Goal: AI-assisted data entry and financial projections.

- [ ] AI Import: drag-drop PDF/CSV/screenshot → extracted structured data
  - Local LLM option (Ollama) or cloud API (Claude/GPT)
  - Preview + correction UI before import
- [ ] Fast Forward projection engine:
  - Rule-based scenarios (growth rates, recurring income, windfalls, debt payoff)
  - Interactive projection chart
  - Multiple scenario comparison
  - Capital call integration
- [ ] AI chat interface (query your portfolio via LLM)
- [ ] LLM-ready JSON export (for use with any chatbot)
- [ ] MCP server (expose portfolio data to Claude/GPT via Model Context Protocol)

---

### v0.8 — Nested Portfolios & Multi-Entity
> Goal: Family office / multi-entity support.

- [ ] Nested portfolios (link child → parent)
- [ ] Consolidated net worth across entities
- [ ] Per-entity balance sheets
- [ ] Entity types: Personal, Trust, LLC, Corporation, Partnership
- [ ] Roll-up views with drill-down

---

### v1.0 — Polish & Launch
> Goal: Production-ready open-source release.

- [ ] PWA support (installable, biometric lock)
- [ ] Onboarding wizard (guided setup)
- [ ] Keyboard shortcuts
- [ ] Comprehensive API documentation (OpenAPI spec)
- [ ] Plugin/addon architecture for community extensions
- [ ] i18n (internationalization framework)
- [ ] One-line Docker install
- [ ] Helm chart for Kubernetes
- [ ] CasaOS / Umbrel / Unraid / TrueNAS app store listings
- [ ] Landing page + documentation site
- [ ] Demo instance

---

## MVP Scope (v0.1) — What We Build First

The MVP is a **fully functional net worth tracker** with:

1. **Spreadsheet UI** — Sheets, sections, rows. Add/edit/archive assets and debts.
2. **Multi-currency** — Enter values in any currency, auto-convert to portfolio base.
3. **Auto-pricing** — Stocks via Yahoo Finance, crypto via CoinGecko. Search + add by ticker.
4. **Manual entry** — For anything that doesn't have a price feed.
5. **Historical tracking** — Daily snapshots, net worth chart over time.
6. **Dashboard** — Net worth, total assets, total debts, cash on hand, allocation donut.
7. **CSV import** — Flexible column mapping for bulk data entry.
8. **Docker deployment** — `docker compose up` and you're running.
9. **REST API** — Every operation available programmatically.

**What it deliberately does NOT have in v0.1:**
- No bank syncing (v0.3)
- No wallet tracking (v0.2)
- No IRR/performance metrics (v0.4)
- No AI features (v0.7)
- No dead man's switch (v0.6)
- No projections (v0.7)

This is enough to replace Kubera's core value prop: **one place to see everything you own and owe, with a net worth number and chart.**

---

## UI/UX Specification

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Logo    Portfolio Name ▾          [Search] [+Add] [⚙]  │
├──────┬──────────────────────────────────────────────────┤
│      │  ┌─────────────────────────────────────────────┐ │
│ Nav  │  │ Net Worth: $1,234,567    ▲ +2.3% MTD       │ │
│      │  │ Assets: $1,500,000  Debts: $265,433         │ │
│ Port │  │ Cash: $85,000  Investable: $1,150,000       │ │
│ folio│  ├─────────────────────────────────────────────┤ │
│      │  │ [Net Worth Chart ~~~~~~~~~~~~~~~~~~~~~~~~]  │ │
│ Dash │  │ [Allocation Donut]  [Assets vs Debts]       │ │
│ board│  ├─────────────────────────────────────────────┤ │
│      │  │ Sheets: [Cash] [Investments] [Crypto] [+]   │ │
│ Recap│  ├─────────────────────────────────────────────┤ │
│      │  │ ── Cash & Banking ──────────── Section ──── │ │
│ Fast │  │ Checking (Chase)    $12,500   ▲ $200  0.8%  │ │
│ Fwd  │  │ Savings (Marcus)    $50,000   ── ──    3.2%  │ │
│      │  │ Emergency Fund      $22,500   ── ──    1.4%  │ │
│ Sett │  │ ── Brokerage ──────────────── Section ──── │ │
│ ings │  │ Fidelity 401k      $245,000   ▲ $3.2k 15.8% │ │
│      │  │   ├ AAPL (150)      $32,250                  │ │
│      │  │   ├ VTI (500)       $142,500                 │ │
│      │  │   └ BND (200)       $70,250                  │ │
│      │  │ Coinbase            $18,500   ▼ $500   1.2%  │ │
│      │  └─────────────────────────────────────────────┘ │
└──────┴──────────────────────────────────────────────────┘
```

### Design Tokens

- **Background**: White (#FFFFFF) / Dark (#0F0F0F)
- **Surface**: Light grey (#F8F9FA) / Dark surface (#1A1A1A)
- **Sidebar**: Dark (#1E1E2E) in both modes
- **Primary accent**: Blue (#3B82F6)
- **Positive**: Green (#22C55E)
- **Negative**: Red (#EF4444)
- **Text**: Near-black (#111827) / White (#F9FAFB)
- **Muted**: Grey (#6B7280)
- **Font**: Inter (sans-serif)
- **Border radius**: 8px (cards), 6px (inputs), 4px (badges)
- **Stale row**: Italic text + muted background (#F3F4F6 / #2A2A2A)

### Key Interactions

1. **Click row** → Select row (for bulk actions)
2. **Click asset name** → Open slide-out detail panel
3. **Click value cell** → Inline edit (smart input: "EUR 500", "BTC 1.5", "AAPL 10")
4. **Right-click row / three-dot menu** → Context menu (edit, archive, move, mark stale)
5. **Drag rows** → Reorder within section
6. **Sheet tabs** → Click to switch, drag to reorder, + to add
7. **Detail panel tabs** → Value (history), Returns (cash flows + IRR), Holdings, Settings

---

## Project Structure

```
summa/
├── apps/
│   ├── web/                    # React frontend (Vite)
│   │   ├── src/
│   │   │   ├── components/     # UI components
│   │   │   ├── features/       # Feature modules (portfolio, assets, charts, etc.)
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── lib/            # Utilities, API client
│   │   │   ├── stores/         # State management (Zustand or similar)
│   │   │   └── styles/         # Global styles, Tailwind config
│   │   └── index.html
│   └── api/                    # Backend API (Hono/Fastify)
│       ├── src/
│       │   ├── routes/         # API route handlers
│       │   ├── services/       # Business logic
│       │   ├── providers/      # Data source adapters
│       │   │   ├── yahoo.ts
│       │   │   ├── coingecko.ts
│       │   │   ├── blockstream.ts
│       │   │   ├── etherscan.ts
│       │   │   ├── simplefin.ts
│       │   │   ├── snaptrade.ts
│       │   │   └── manual.ts
│       │   ├── jobs/           # Scheduled tasks (price sync, snapshots)
│       │   ├── db/             # Drizzle schema + migrations
│       │   └── lib/            # Utilities, IRR calc, currency conversion
│       └── Dockerfile
├── packages/
│   └── shared/                 # Shared TypeScript types
├── docker-compose.yml
├── turbo.json
├── package.json
└── README.md
```

---

## Competitive Positioning

| Feature | Kubera ($249/yr) | Ghostfolio (free) | Summa (free) |
|---------|:---:|:---:|:---:|
| Stocks/ETFs | ✅ | ✅ | ✅ |
| Crypto (manual) | ✅ | ✅ | ✅ |
| Crypto wallets (on-chain) | ✅ (17 chains) | ❌ | ✅ |
| DeFi positions | ✅ (limited) | ❌ | ✅ (Zerion, 8k+ protocols) |
| Bank syncing | ✅ (20k+ institutions) | ❌ | ✅ (SimpleFIN, $15/yr) |
| Real estate (auto-value) | ✅ (Zillow) | ❌ | ✅ (planned) |
| Vehicles (VIN) | ✅ | ❌ | ✅ (planned) |
| Debts/loans | ✅ | ❌ | ✅ |
| IRR + benchmarking | ✅ | ✅ | ✅ (planned) |
| Dead man's switch | ✅ | ❌ | ✅ (planned) |
| Projections | ✅ (Fast Forward) | ❌ | ✅ (planned) |
| AI import | ✅ | ❌ | ✅ (planned, local LLM) |
| Nested portfolios | ✅ (Black only) | ❌ | ✅ (planned) |
| Self-hosted | ❌ | ✅ | ✅ |
| REST API | Limited | ✅ | ✅ |
| Open source | ❌ | ✅ | ✅ |
| Privacy (your server) | ❌ | ✅ | ✅ |

---

## Name Candidates

The project needs a strong name for publishing. Options:

- **Summa** — Shield/protection (financial protection, estate planning angle)
- **Ledgr** — Minimalist, financial, available
- **Steadfast** — Reliability, permanence
- **Patrimony** — Wealth/heritage (estate planning angle)
- **Tally** — Simple, financial, approachable
- **Networth** — Direct, SEO-friendly
- **Bastion** — Fortress (self-hosted security angle)
- **Folio** — Portfolio, clean
- **Vault** — Security + document storage

Pick one you like or come up with your own. The spec uses "Summa" as a placeholder.

---

## Getting Started (Development)

```bash
# Prerequisites: Node.js 20+, pnpm, Docker

# Clone and install
git clone <repo>
cd summa
pnpm install

# Start database
docker compose up -d postgres

# Run migrations
pnpm db:migrate

# Start dev servers (frontend + backend)
pnpm dev

# Frontend: http://localhost:5173
# API: http://localhost:3000
# API docs: http://localhost:3000/docs
```

---

## License

AGPL-3.0 — Same as Ghostfolio, Maybe Finance, Firefly III. Ensures the project stays open source while allowing self-hosting. Copyleft prevents proprietary forks from not contributing back.

---

## Research Sources

This spec was derived from comprehensive research of:

**Kubera Analysis:**
- Kubera.com (marketing site, feature pages, pricing, security)
- help.kubera.com (entire help center — 100+ articles)
- 8+ review articles (WalletHacks, College Investor, Moneywise, CFO Club, FindMyMoat, CryptoAdventure, Nerdisa, Jean Galea)
- Kubera blog posts (bank connectivity, Carta integration, ChatGPT, Fast Forward)
- kubera-reporting open-source project (API structure)

**Competitive Landscape:**
- Ghostfolio (7.9k stars) — investment tracker, Angular + NestJS
- Wealthfolio (7.2k stars) — desktop portfolio tracker, Tauri + React
- Maybe Finance (54k stars, archived) — the vision that died
- Sure (7.3k stars) — Maybe community fork, Rails
- Firefly III (22.7k stars) — budgeting tool, PHP/Laravel
- Actual Budget (25.5k stars) — envelope budgeting, TypeScript
- Rotki (3.7k stars) — crypto/DeFi tracker, Python
- Portfolio Performance (3.7k stars) — desktop Java app

**Account Syncing:**
- Plaid, Yodlee, MX, Finicity, Teller, Akoya, GoCardless, Salt Edge
- SimpleFIN Bridge ($15/yr — the key finding)
- SnapTrade (free 5 connections)
- Direct exchange APIs (Coinbase, Kraken, Gemini, Schwab, IBKR)
- Blockchain APIs (Blockstream, Etherscan, Helius, Zerion, Moralis, Covalent)
- FDX/Open Banking standards (CFPB mandate, April 2026)
- Creative approaches (browser automation, email parsing, AI OCR)
