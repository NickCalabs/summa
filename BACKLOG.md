# Summa — Backlog

The running prioritized list. Survives sessions; not chat.

> Update this file as work lands. Each item links to a spec, PR, or commit when available.
> Source-of-truth roadmap is `kubera-replacement-spec.md`. This file is the concrete near-term plan.

---

## v0.1 — Close-out

**Goal:** Finish v0.1 cleanly so we can tag `v0.1.0` and move to v0.2.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Section/sheet/asset creation broken on HTTP non-localhost | ✅ done | `crypto.randomUUID` not in secure context. Fixed via `src/lib/temp-id.ts`. Affects every self-hoster reached over plain HTTP. |
| 2 | Pending DB migration 0009 (`investable_total` column) | ✅ done | Out-of-order journal `when` was hiding it from `db:migrate`. Rewrote migration as the single ALTER TABLE statement and bumped its `when`. |
| 3 | Allocation donut chart on dashboard | ✅ done | Already shipped as `dashboard/allocation-chart.tsx` (CSS conic-gradient version). Functionally complete. |
| 4 | Assets-vs-debts-over-time chart on dashboard | ✅ done | `charts/assets-debts-chart.tsx` already existed, was orphaned after charts were removed from portfolio page. Re-wired into `dashboard-view.tsx`. Renders empty until 2+ snapshots accumulate. |
| 5 | Yahoo Finance broken (BUG-3 from old smoke test) | ✅ done | yahoo-finance2 v3+ requires `new YahooFinance()` constructor, not the default-export-as-instance pattern. Fixed in `src/lib/providers/yahoo.ts`. AAPL quote and search now work. |
| 6 | Smoke test refresh | ✅ done | All 4 priority bugs from `BUGS.md` are now resolved (BUG-1 migrations, BUG-2 single-user mode, BUG-3 Yahoo, BUG-4 non-UUID). BUG-5 missing-Content-Type is low-pri lenient parsing, leaving as known issue. Stale `BUGS.md` and `SMOKE-TEST-RESULTS.md` deleted; this row replaces them. |
| 7 | Tag `v0.1.0` | ✅ done | Tagged after Kubera import shipped and prod environment set up. |
| 8 | Audit other secure-context-only Web APIs | ⬜ followup | `navigator.clipboard`, `Notification`, `WakeLock`, etc. — same class of HTTP-only bug. None currently in code (verified `grep`), but prevent regressions. |

### Smoke test result (2026-04-09)

| Test | Status | Notes |
|---|---|---|
| Migrations applied | ✅ pass | 10/10, no pending |
| Auth: register blocked when user exists | ✅ pass | 400 `FAILED_TO_CREATE_USER` |
| Auth: GET /api/portfolios with no cookie | ✅ pass | 307 redirect to `/login` |
| Portfolio CRUD | ✅ pass | List, tree, create, patch, delete cascade |
| Sheets CRUD | ✅ pass | Including over HTTP after the secure-context fix |
| Sections CRUD | ✅ pass | Including over HTTP after the secure-context fix |
| Assets CRUD | ✅ pass | Including over HTTP after the secure-context fix |
| Snapshots endpoint | ✅ pass | Was 500 before migration applied |
| Yahoo quote | ✅ pass | $258.90 for AAPL |
| Yahoo search | ✅ pass | 6 yahoo + 4 coingecko results for AAPL |
| Non-UUID portfolio id | ✅ pass | Returns 400 not 500 |
| Missing Content-Type on POST | ⚠️ known | Lenient parser still accepts; low-pri |

---

## v0.1.x — Hardening (deferred)

| Item | Notes |
|------|-------|
| TOTP 2FA | Per dev-spec, deferred from v0.1. |
| Prod off `pnpm dev` → standalone Docker | ✅ done — Running `next start` via systemd service (`summa.service`) with auto-restart. Daily pg_dump backup at 3am. Docker standalone build still a future nice-to-have. |
| Drizzle migration discipline | Two parallel branches landed overlapping `simplefin_*` migrations (0008 + 0009). Future migrations should be generated in sequence and rebased before merge. |
| HTTPS-by-default install | One-line installer should generate a self-signed cert or use Caddy/Traefik in front, so users get a secure context out of the box and avoid the whole class of secure-context bugs. |
| Kubera CSV import (historical) | ✅ done — Kubera JSON import wizard shipped (PR #45). Parses JSON export, tree view with match/create/skip, transactional DB inserts. Also supports paste-in JSON. |

---

## v0.2 — Crypto & wallet tracking

The schema is already prepared (`providerType="wallet"` with `chain` + `address` in `providerConfig`). No migrations needed for the basics.

| # | Item | Status | Spec / handoff |
|---|------|--------|----------------|
| 1 | BTC watch-only address support (Blockstream + Mempool.space) | ✅ done | `docs/handoffs/v0.2-btc.md` |
| 2 | ETH + ERC-20 token detection (Etherscan) | ✅ done | `docs/handoffs/v0.2-eth.md` |
| 3 | SOL + SPL token detection (Helius) | ✅ done | PR #43 |
| 4 | Stablecoin → cash-equivalent auto-classification | ⬜ | Subtask of #1–3 |
| 5 | Provider settings page + connection health | ✅ done | PR #44 |
| 6 | Holdings expansion (click wallet → see tokens inline) | ⬜ | After #1–3 |
| 7 | Multi-chain DeFi positions (Zerion) | ⬜ | After #5 |
| 8 | Exchange API connections (Coinbase / Kraken / Gemini, read-only API key) | ⬜ | After #5 |

### v0.2 follow-ups

| Item | Notes |
|------|-------|
| xpub / ypub / zpub support | Extended public keys for HD wallets. Deferred from chunk #1 — the BTC chunk ships single-address watch-only only. A separate PR will add xpub derivation (gap-limit-based address scan via Blockstream) so users can track whole HD wallets from one ext-key paste. |

These will be executed as separate sessions with handoff prompts. Each chunk = one PR.

---

## v0.x — Cross-cutting features (separate from v0.2 wallet chunks)

| # | Item | Handoff |
|---|------|---------|
| 1 | Display currency switcher (USD / BTC / sats) with historical chart re-denomination | `docs/handoffs/v0.x-display-currency.md` |

The display currency feature is independent of the v0.2 wallet work — it can ship in any session, in parallel with the wallet chunks. It adds: a top-bar dropdown, a `btc_usd_rate` column on snapshots populated from this PR forward, and a crypto-aware fix to the existing fiat-only conversion layer (fixes a pre-existing 0.1 BTC → $0.10 bug). The BTC-mode chart starts populating when this ships and accumulates over time. Historical backfill is documented as an optional follow-up using the bitflation repo as a data source — explicitly out of scope for the first version.

---

## v0.3+ — Roadmap pointers

See `kubera-replacement-spec.md` for full roadmap. High-level:

- **v0.3** Bank & brokerage syncing (SimpleFIN setup wizard, SnapTrade, Schwab/IBKR, transaction history, sync dashboard)
- **v0.4** Performance & analytics (cash flows, XIRR, IRR benchmarks, full Recap, target allocation, exports)
- **v0.5** Alternative assets (Zillow, VIN, domains, mortgage↔property linking, PE/VC, custom asset types)
- **v0.6** Estate planning & collaboration (beneficiaries, dead man's switch, doc vault, multi-user)
- **v0.7** AI features & projections (PDF/CSV/screenshot import, Fast Forward, AI chat, MCP server)
- **v0.8** Nested portfolios / multi-entity
- **v1.0** PWA, plugins, i18n, app-store listings
