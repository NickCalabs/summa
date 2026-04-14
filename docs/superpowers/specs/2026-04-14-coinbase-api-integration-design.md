# Coinbase API Direct Integration — Design Spec

## Overview

Add direct Coinbase exchange integration via their REST API. Users paste a read-only API key + secret from Coinbase, and Summa pulls all account balances, creates a parent "Coinbase" asset with ticker-based children, and keeps them synced via cron. Replaces the poor-quality SimpleFIN Coinbase data (blank institution names, cryptic wallet IDs).

## Coinbase API

**Auth:** API Key + Secret (HMAC-SHA256 signed requests). Users create these at https://www.coinbase.com/settings/api with "View" permissions only.

**Base URL:** `https://api.coinbase.com`

**Key endpoints:**
- `GET /v2/accounts?limit=100` — lists all wallets with balances (paginated)
- Each account returns: `id`, `name` (e.g. "Bitcoin", "Ethereum"), `balance.amount`, `balance.currency`, `type` ("wallet"), `currency.code` ("BTC")

**Auth header format:**
```
CB-ACCESS-KEY: <api_key>
CB-ACCESS-SIGN: HMAC-SHA256(timestamp + method + path + body, secret)
CB-ACCESS-TIMESTAMP: <unix_timestamp>
CB-VERSION: 2024-01-01
```

## Schema

### New table: `coinbase_connections`

```sql
CREATE TABLE coinbase_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Coinbase',
  api_key_enc TEXT NOT NULL,       -- encrypted API key
  api_secret_enc TEXT NOT NULL,    -- encrypted API secret
  error_code TEXT,
  error_message TEXT,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

Store API key + secret encrypted (same `encrypt`/`decrypt` pattern as SimpleFIN access URLs and Plaid tokens).

## API Endpoints

### `POST /api/coinbase/connections`

Create a new Coinbase connection.

**Request:** `{ apiKey: string, apiSecret: string }`

**Flow:**
1. Validate by calling `GET /v2/user` to confirm the key works
2. Encrypt and store apiKey + apiSecret
3. Immediately sync accounts (call the sync logic below)
4. Return connection + accounts list

### `POST /api/coinbase/connections/[id]/sync`

Sync balances from Coinbase.

**Flow:**
1. Call `GET /v2/accounts?limit=100` (paginate if needed)
2. Filter to accounts with non-zero balance OR that are already tracked
3. Find or create parent asset:
   - Look for existing asset with `providerType: "coinbase"` and `providerConfig.isGroupParent: true` for this connection
   - If not found, create one: name = "Coinbase", type = "crypto", providerType = "coinbase"
   - Place in the CEX section (find or create under the assets sheet)
4. For each Coinbase account with balance > 0:
   - Find existing child asset by matching `providerConfig.coinbaseAccountId`
   - If exists: update `currentValue`, `quantity`, `currentPrice`
   - If new: create child asset with:
     - `name`: Coinbase's account name (e.g. "Bitcoin", "Ethereum")
     - `providerType`: "ticker"
     - `providerConfig`: `{ ticker: "<SYMBOL>-USD", coinbaseAccountId: "<id>", source: "yahoo" }`
     - `quantity`: balance amount from Coinbase (native units)
     - `currentPrice`: derived from Coinbase balance (native_balance.amount / balance.amount) or fetched from Yahoo
     - `currentValue`: USD value from Coinbase
     - `parentAssetId`: points to the parent
5. Archive children whose Coinbase balance dropped to zero (but NOT if they're debt-type)
6. Update connection `lastSyncedAt`

### `DELETE /api/coinbase/connections/[id]`

Disconnect. Revert child assets to `providerType: "manual"` (same pattern as SimpleFIN disconnect). Delete the connection record.

## Cron

Add to `src/lib/cron.ts`:
- Every 15 minutes: sync all Coinbase connections
- Same concurrency guard pattern as existing cron jobs

## Settings UI

On the `/settings/connections` page, add a "Coinbase" section (similar to SimpleFIN):
- Text inputs for API Key and API Secret
- "Connect" button
- After connection: shows connection card with account count, last synced, sync/disconnect buttons
- List of tracked accounts with balances

## Provider Config Type

Add to `providerConfig` type in schema.ts:
```ts
coinbaseAccountId?: string;
```

Add new provider type enum value: `"coinbase"`

## What the user sees

After connecting:
- Portfolio view shows "Coinbase" as an expandable parent row in the CEX section
- Children: Bitcoin ($9,408), Ethereum ($2,196), SOL ($11), etc. — with proper names
- Each child has a ticker (BTC-USD, ETH-USD) so Yahoo Finance keeps prices current
- Zero-balance wallets (DOGE $0.00, BOND $0.00) are auto-archived, not shown

## Edge cases

| Case | Behavior |
|------|----------|
| Invalid API key | Return error on connect, don't store |
| Key revoked after connection | Store error on next sync, show in UI |
| Account with unknown currency | Create as manual asset, no ticker |
| Stablecoins (USDC, USDT) | Create with ticker, mark isCashEquivalent |
| Pagination (>100 accounts) | Follow Coinbase pagination.next_uri |
| Rate limiting | Coinbase allows 10,000 req/hr — not a concern for balance reads |

## Out of scope

- Transaction history (deposits/withdrawals) — future feature
- Trading via API — read-only keys only
- Coinbase Pro / Advanced Trade — same API covers both
- Coinbase One Card (credit) — already handled via Plaid
