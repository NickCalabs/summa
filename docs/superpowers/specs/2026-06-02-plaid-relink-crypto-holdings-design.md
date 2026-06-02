# Plaid Relink + Crypto Holdings Sync — Design

**Date:** 2026-06-02
**Status:** Approved (pending spec review)

## Problem

River (an exchange holding both USD cash and Bitcoin) just exposed itself through
Plaid. Connecting it in Summa stages two accounts:

| Plaid account | type / subtype | Plaid reports | value |
| --- | --- | --- | --- |
| `River USD Account` (`Individual - USD`) | depository / checking | USD balance | $1,730.41 |
| `River Bitcoin Account` (`Individual - BTC`) | investment / crypto exchange | USD balance (balance feed) | $16,112.83 |

Today these are tracked **manually** as two existing rows the user wants to keep
(with their snapshot history intact):

| Existing row | id | providerType | how tracked | value |
| --- | --- | --- | --- | --- |
| `Riv` (cash, on cash sheet) | `879a7939-…` | `manual` | hand-typed USD | $1,930.41 |
| `Riv` (bitcoin, on BTC sheet) | `7f95bfd5-…` | `ticker` | quantity 0.23788197 BTC × live CoinGecko price; `providerConfig = {source:"coingecko", ticker:"bitcoin", exchange:"crypto"}` | $15,906.69 |

Two problems block a clean connect:

1. **No Plaid relink exists.** Tracking a Plaid account always *creates a new asset
   row* (`src/app/api/plaid/connections/[id]/accounts/route.ts`). Linking River
   would create duplicates and orphan the manual rows' history. (SimpleFIN already
   has relink — Plaid never got it. See `2026-04-10-simplefin-relink-design.md`.)
2. **The BTC account must stay step-like.** Plaid's *balance* feed gives only a USD
   value. If we drove the BTC row from USD, the implied coin amount would jitter
   every price tick and River's oracle would disagree with our tracker (the
   "+$102 when the DCA was $100" artifact). We must drive **quantity** from River's
   holdings and let our own price drive value.

### Key discovery

River **does** expose a real coin quantity via Plaid's `/investments/holdings`
endpoint (the Investments product is already authorized on the existing
connection — no reconnect needed):

```
security: Bitcoin (BTC), type: cryptocurrency
quantity:          0.24071935 BTC
institution_price: $66,936.15
institution_value: $16,112.83
```

(The ~0.00284 BTC gap vs. the manual 0.23788 is just un-logged DCA.)

## Goals

- Adopt the two existing manual rows into the Plaid connection **without losing
  history** (same asset `id`).
- Drive the **cash** row from the Plaid USD balance.
- Drive the **bitcoin** row's **quantity** from Plaid holdings; keep `currentValue
  = quantity × Summa's own CoinGecko price` (decision: our ticker price, not
  River's, for cross-row consistency).
- Build the relink as a **general, reusable** feature (mirrors SimpleFIN), usable
  for any future manual→Plaid adoption — this is the v0.2 "link to provider"
  request.
- Preserve existing layout: cash on cash sheet, BTC on BTC sheet, **no** parent
  grouping (Plaid does not auto-group; nothing to do here).

## Non-goals

- No change to SimpleFIN behavior.
- No parent/child grouping for River.
- No backfill/rewrite of historical snapshots (history stays as-is; only
  go-forward values change).
- No general "investments holdings → many securities" expansion. This handles a
  **single crypto holding per crypto account** (River's shape). Multi-security
  brokerage accounts are out of scope.

## Design

### Piece 1 — Plaid relink endpoint (mirror SimpleFIN)

New route `src/app/api/plaid/accounts/[id]/route.ts`, `PATCH`, mirroring
`src/app/api/simplefin/accounts/[id]/route.ts`. `[id]` is the `plaidAccounts.id`.

Request body (discriminated union, same shape as SimpleFIN):
```ts
z.discriminatedUnion("action", [
  z.object({ action: z.literal("unlink") }),
  z.object({ action: z.literal("relink"), assetId: z.string().uuid() }),
])
```

**unlink:** revert the linked asset to `providerType:"manual"`, clear the Plaid
keys from `providerConfig`, set `plaidAccounts.assetId = null, isTracked = false`.
(For a crypto row that was previously a ticker asset, unlink reverts it to
`manual` — matching SimpleFIN semantics. The user can re-pick `ticker` later if
desired. Acceptable: unlink is rare.)

**relink:** takes over the target asset (same `id` → history preserved):
1. Verify target asset exists; verify it isn't already linked to a *different*
   tracked Plaid account (same guard as SimpleFIN).
2. If this Plaid account was linked to a different asset, revert that one to
   `manual`.
3. **Asset takeover — branch on crypto vs. non-crypto:**
   - **Non-crypto (cash/depository, credit, etc.):**
     ```
     providerType = "plaid"
     providerConfig = { connectionId, plaidAccountId }   // replace
     currentValue   = abs(plaidAccount.currentBalance)
     lastSyncedAt   = now
     ```
   - **Crypto investment** (`plaidAccount.type === "investment"` and target
     `asset.type === "crypto"`):
     ```
     providerType   = "plaid"
     providerConfig = { ...existing source/ticker/exchange, connectionId, plaidAccountId }  // MERGE, keep pricing keys
     quantity       = <holding quantity from /investments/holdings for this account>
     currentValue   = quantity × asset.currentPrice   // recompute now; cron keeps it fresh
     // do NOT overwrite currentValue from the USD balance
     ```
     If holdings fetch fails or returns no matching holding, fall back to leaving
     `quantity` unchanged and log a warning (do not clobber with USD).
4. Update `plaidAccounts`: `assetId = target, isTracked = true`.

**Crucial:** the crypto branch **merges** `providerConfig` so `source` +
`ticker` survive — otherwise the price-refresh cron can't price the row.

### Piece 2 — Holdings fetch helper

Add to `src/lib/providers/plaid.ts`:
```ts
// Returns coin quantity for a given plaid account_id, or null if none.
export async function getCryptoHolding(
  accessToken: string,
  plaidAccountId: string,
): Promise<{ quantity: number; institutionPrice: number | null } | null>
```
Calls `plaid.investmentsHoldingsGet({ access_token })`, finds the holding whose
`account_id === plaidAccountId` (and security `type === "cryptocurrency"` when
present), returns its `quantity`. Single-holding assumption per the non-goals.

### Piece 3 — Sync drives quantity for crypto

`src/app/api/plaid/connections/[id]/sync/route.ts` (and the cron equivalent
`refreshPlaidBalances()` in `src/lib/cron.ts`, ~lines 269–389) currently do, per
linked account:
```
currentValue = abs(balance.currentBalance); lastSyncedAt = now
```
Change: when the linked asset is a **crypto** asset (`asset.type === "crypto"` /
the plaid account is an investment), call `getCryptoHolding()` and:
```
quantity     = holding.quantity        // step-like; only moves on a real DCA settle
// do NOT set currentValue here — the price-refresh cron computes value = qty × price
lastSyncedAt = now
```
Non-crypto accounts keep the existing balance→currentValue behavior unchanged.

Fetch holdings **once per connection per sync** (not per account) to avoid
redundant API calls; build an `account_id → quantity` map.

### Piece 4 — Price refresh must include the plaid-linked crypto row

`src/lib/cron.ts:56–59` selects only `providerType = "ticker"`. After relink the
BTC row is `providerType = "plaid"`, so it would stop being priced. Generalize the
selection to **also include crypto assets that carry a pricing source**:

```ts
const tickerAssets = await db.select().from(assets).where(
  or(
    eq(assets.providerType, "ticker"),
    and(eq(assets.providerType, "plaid"),
        eq(assets.type, "crypto")),   // these carry source/ticker in providerConfig
  ),
);
```

The downstream grouping already keys off `providerConfig.source` + `.ticker` and
computes `value = quantity × price`, so no other change is needed — a plaid crypto
row with `{source:"coingecko", ticker:"bitcoin"}` flows through the existing
coingecko branch untouched. Rows without a `source`/`ticker` are naturally
skipped (the branch `continue`s when `ticker` is missing), so non-crypto plaid
rows are unaffected.

### Piece 5 — Snapshots: no change

`snapshots.ts` / `snapshots-aggregate.ts` read `asset.currentValue` as canonical.
Because we keep `currentValue = quantity × price`, snapshots stay consistent.
`assetSnapshots` already stores `quantity` and `price` per row for reference.

### Piece 6 — UI

- `useRelinkPlaidAccount()` in `src/hooks/use-plaid.ts`, mirroring
  `useRelinkSimpleFINAccount()` (`use-simplefin.ts:156–196`): `PATCH
  /api/plaid/accounts/{id}` with `{action, assetId?}`; invalidate
  `["plaid-connections"]` + `["portfolio"]`; toast.
- Relink picker UI in the Plaid connect surface, mirroring
  `simplefin-connect-panel.tsx`: for each untracked Plaid account, offer "Link to
  an existing asset" → list manual/ticker assets → relink. Keep the existing
  "track as new asset" path too.

### River migration (the actual end state)

With the feature built, the user (already connected, nothing tracked):
1. Relink `River USD Account` → existing `Riv` cash row (`879a7939-…`). First sync
   sets it to $1,730.41 (corrects the $200 drift). History kept.
2. Relink `River Bitcoin Account` → existing `Riv` BTC row (`7f95bfd5-…`).
   `providerConfig` becomes `{source:"coingecko", ticker:"bitcoin",
   exchange:"crypto", connectionId, plaidAccountId}`; quantity → 0.24071935; value
   = qty × live CoinGecko price. History kept; quantity chart stays step-like.

## Edge cases

- **Holdings endpoint fails / River drops Investments product:** leave quantity
  unchanged, log a warning; never fall back to slamming USD into a crypto row.
- **Multiple holdings on one crypto account:** out of scope — take the single
  crypto holding; if >1, log and use the first cryptocurrency holding (revisit if
  it ever happens).
- **Unlink of a former ticker row:** reverts to `manual` (not back to `ticker`);
  acceptable and matches SimpleFIN.
- **Asset already linked to another Plaid account:** rejected with 400 (same guard
  as SimpleFIN).

## Testing

- Unit test: `getCryptoHolding()` maps a holdings response → correct quantity for
  the matching `account_id`; returns null when no crypto holding present.
- Unit test (math, per project convention): given quantity 0.24071935 and price
  66936.15, `currentValue` rounds to 16112.83; verify step-like behavior — value
  changes when price changes but quantity is read straight from holdings, not
  derived from USD.
- Endpoint test: relink crypto preserves `source`/`ticker` in `providerConfig` and
  sets quantity (not USD) into `currentValue`; relink cash sets USD balance;
  unlink reverts to manual and clears Plaid keys.
- Integration check: after relink, a price-refresh cron tick updates the
  plaid-crypto row's `currentPrice`/`currentValue`.

## Files touched

| File | Change |
| --- | --- |
| `src/app/api/plaid/accounts/[id]/route.ts` | **new** — relink/unlink PATCH (mirror SimpleFIN), crypto branch |
| `src/lib/providers/plaid.ts` | **new** `getCryptoHolding()` helper |
| `src/app/api/plaid/connections/[id]/sync/route.ts` | crypto branch: drive `quantity` from holdings |
| `src/lib/cron.ts` | `refreshPlaidBalances()` crypto branch; widen price-refresh selection to plaid crypto |
| `src/hooks/use-plaid.ts` | **new** `useRelinkPlaidAccount()` |
| Plaid connect panel component (mirror `simplefin-connect-panel.tsx`) | relink picker UI |
| Tests | helper + math + endpoint + cron |
