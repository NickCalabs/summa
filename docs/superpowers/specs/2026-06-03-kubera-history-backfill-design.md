# Kubera Historical Backfill — Design

**Date:** 2026-06-03
**Status:** Approved (pending spec review)

## Problem

Before adopting Summa, Nick tracked everything in Kubera for ~2 years. Kubera
exposes a per-asset update history (`Date / USD / QTY / PRICE`). Summa only has
history from when it started (~a couple months, plus a recent live era). The goal
is to **enrich Summa's history** with the Kubera past so per-asset charts and the
net-worth line (USD and BTC/sats) extend back ~2 years — **without touching the
current, live "state of all money," which must remain exactly correct.**

Kubera has been effectively unmaintained since the Summa switch, so: **Summa is
current truth; Kubera is read-only past enrichment.**

## Why this is safe by construction

The current-state dashboard (net worth, per-account balances) is computed from the
`assets` table (`currentValue`, `quantity`, `currentPrice`, …) and live data — it
does **not** read historical snapshots. This script **only inserts dated history
rows** (`asset_snapshots` / `portfolio_snapshots` for past dates). The only
consumers of those rows are the **history charts**. Therefore the blast radius is
strictly "the shape of the history line"; current totals are structurally
unreachable by this change.

## Goals

- Backfill per-asset value/quantity history from Kubera CSV/text exports.
- Recompute the net-worth / cash / investable history (`portfolio_snapshots`) for
  the pre-Summa era, with **carry-forward** so the line is smooth (no dips on days
  when only one asset changed).
- Populate BTC/sats history using **historical BTC/USD prices** per date.
- Never modify any live/current value or any existing snapshot. Idempotent,
  dry-run-first, fully revertible.

## Non-goals

- No in-app import UI (one-time guided **script**; UI later if ever needed).
- No change to the current-state computation, the live sync, or any `assets` row.
- No historical FX for non-USD assets (Nick is USD-based; values arrive already in
  USD). A non-USD asset in the input is flagged and skipped, not guessed.
- No daily densification — snapshots are written only on Kubera **update dates**
  (the chart interpolates between points; per-day rows would 10× the data for an
  identical line).

## Input format

A folder (default `/opt/summa/kubera-history/`), one file per asset. Each file
matches what Kubera shows (and what Nick pasted):

```
Riv (BTC)
Date        USD         QTY          PRICE (USD)
2026-06-03  10957.85    0.16729032   65502.00
2025-05-10  5856.25     0.05602784   104524.00
...
```

- Line 1: asset name (used for matching).
- A header row (detected and skipped).
- Data rows: `date, usd, qty, price`. Tolerant delimiter (tab / multi-space /
  comma). `qty`/`price` may be blank (e.g. a pure-cash account → `qty`/`price`
  null, `usd` is the value).

## Pipeline

All steps run in **dry-run** mode by default; `--commit` is required to write.

1. **Parse** every file → `{ assetName, rows: [{date, usd, qty, price}] }`.
   Reject/flag malformed rows (bad date, non-numeric usd) loudly; never silently
   drop.
2. **Match** each file's `assetName` to a Summa asset via the existing fuzzy
   matcher (`src/lib/ai/fuzzy-match.ts` / the Kubera importer's `autoMatch`). Print
   the proposed `file → asset` mapping. An optional `mapping.json`
   (`{ "Riv (BTC)": "<assetId>" }`) overrides/disambiguates. Unmatched files are
   reported and skipped (not guessed).
3. **Historical BTC/USD** for the full date range: one call to CryptoCompare's
   daily-history endpoint (`histoday`, already the current-price provider's API) →
   a `date → btcUsd` map, cached to a local JSON so re-runs need no network.
4. **Per-asset boundary (the live-data guard).** For each matched asset, compute
   `cutoff = min(existing asset_snapshots.date)` (the handoff to the Summa era).
   Import only Kubera rows with `date < cutoff`. If the asset has **no** existing
   snapshot, import all its rows. **Never** write a `(asset, date)` that already
   exists (insert-only). This keeps the live River 0.241 BTC (and every real Summa
   point) untouched and fills only the older gap.
5. **Carry-forward densify.** Let `D` = the sorted union of all in-range Kubera
   dates across matched assets. For each `date ∈ D` and each matched asset, take
   that asset's **most-recent Kubera row on-or-before `date`** (skip dates before
   the asset's first Kubera row). Insert an `asset_snapshot`:
   `{ assetId, date, value=usd, valueInBase=usd, quantity=qty, price, source:"import",
   valueInBtc = usd / btcUsd(date) }` — insert-only, respecting the boundary.
6. **Net-worth recompute (insert-only).** For each `date ∈ D` that has **no**
   existing `portfolio_snapshot`, create one: `btcUsdRate = btcUsd(date)`, and
   USD + BTC totals from that date's densified `asset_snapshots` via the existing
   `aggregatePortfolioTotals` (`src/lib/snapshots-aggregate.ts`). Existing
   portfolio snapshots (the live era) are **never** recomputed or touched.

## Safety & guardrails

- **Backup first:** take a fresh `pg_dump` before any write; print its path.
- **Dry-run default:** no writes without `--commit`; dry-run prints mapping, date
  ranges, per-asset row counts, sample rows, and every skip/flag.
- **Insert-only:** every write is guarded by "row does not already exist"; the
  script issues no `UPDATE`/`DELETE` to `assets`, and no `UPDATE` to existing
  snapshots.
- **Current-state invariant:** capture current net worth and every asset's
  `currentValue` before and after the commit; assert they are **identical** (by
  construction they must be). Any drift → loud error.
- **Undo manifest:** write `kubera-backfill-manifest-<ts>.json` listing the exact
  inserted `asset_snapshots` ids and created `portfolio_snapshots` ids, so revert
  is a surgical delete of only this run's rows (not a blunt `source='import'` wipe
  that could also remove the earlier Kubera-JSON import). `pg_dump` is the backstop.

## Revert procedure

1. Surgical: `--undo <manifest.json>` deletes exactly the ids it created.
2. Backstop: restore the pre-run `pg_dump`.

Either path returns the DB to its exact prior state; the current-state view is
unaffected throughout.

## Edge cases

- **Asset with no Summa snapshot yet** (Kubera-only): import full history; do not
  create/modify the live asset row or its current value.
- **Kubera date already present in Summa:** skipped (insert-only) — Summa wins.
- **Non-USD asset:** flagged and skipped (out of scope).
- **Missing BTC price for a date** (e.g. before the API's range): write the
  `asset_snapshot` with `valueInBtc = null` and the `portfolio_snapshot` with
  `btcUsdRate = null`; charts already fall back gracefully (BTC mode drops null
  points). Logged.
- **Blank qty/price** (cash): `quantity`/`price` null, `value = usd`. Fine.

## Testing

- Unit: tolerant parser (tab/space/comma, header detection, blank qty/price, bad
  rows flagged).
- Unit (math): carry-forward picks the correct most-recent row per date;
  `valueInBtc = usd / btcUsd(date)` rounds correctly; boundary excludes
  `date >= cutoff`.
- Unit: aggregation of a densified date matches hand-computed net worth (e.g. two
  assets carried forward → expected total).
- Integration (dry-run, no writes): against a copy/sample, assert the planned
  write set respects insert-only + boundary and that the current-state invariant
  holds.

## Files (anticipated)

| File | Responsibility |
| --- | --- |
| `src/lib/kubera-history/parse.ts` | tolerant per-asset CSV/text parser (pure) |
| `src/lib/kubera-history/carry-forward.ts` | build date union + most-recent-on-or-before (pure) |
| `src/lib/kubera-history/btc-history.ts` | fetch + cache daily BTC/USD map |
| `src/lib/db/import-kubera-history.ts` | orchestrator: dry-run/commit/undo, boundary, writes, invariant check, manifest |
| `src/lib/kubera-history/__tests__/*` | unit tests for the pure pieces |
