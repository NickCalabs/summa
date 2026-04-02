# SimpleFIN Integration Plan

## Goal

Add a bank-aggregation flow powered by SimpleFIN so a user can:

1. Start a SimpleFIN connection from Summa
2. Paste a SimpleFIN token or stored access URL into Summa
3. See all accounts exposed by that connection
4. Link those accounts to existing Summa assets or create new assets from them
5. Sync balances back into Summa over time

## Current State

Summa already has most of the shape needed for this:

- `assets.providerType` already supports `"simplefin"`
- Plaid already uses a `connection -> provider accounts -> linked asset -> sync` model
- Asset sync already updates `assets.currentValue` and `assets.lastSyncedAt`
- Encrypted credential storage already exists in `src/lib/encryption.ts`

What is missing is the SimpleFIN-specific provider layer, persistence for SimpleFIN connections/accounts, and a UI flow to claim/store/access a SimpleFIN connection.

## Recommended Product Shape

The first version should support two input modes:

1. `SimpleFIN Token`
   The user clicks through to SimpleFIN Bridge (or another SimpleFIN server), copies the token, and pastes it into Summa.

2. `Access URL`
   Advanced users can paste an already-claimed Access URL directly.

This is better than trying to implement an embedded "log in to SimpleFIN" experience first. SimpleFIN is not Plaid Link; its standard flow is token-based, with the user authenticating on the SimpleFIN side and then pasting a token into the app.

## Recommended Architecture

### 1. Add SimpleFIN persistence

Create tables parallel to Plaid:

- `simplefin_connections`
- `simplefin_accounts`

Suggested `simplefin_connections` fields:

- `id`
- `userId`
- `serverUrl`
- `accessUrlEnc`
- `label`
- `lastSyncedAt`
- `errorCode`
- `errorMessage`
- `createdAt`
- `updatedAt`

Suggested `simplefin_accounts` fields:

- `id`
- `connectionId`
- `simplefinAccountId`
- `assetId`
- `connectionName`
- `institutionName`
- `accountName`
- `currency`
- `balance`
- `availableBalance`
- `balanceDate`
- `isTracked`
- `createdAt`
- `updatedAt`

Notes:

- `accessUrlEnc` should use the existing AES-GCM helper in `src/lib/encryption.ts`
- `simplefinAccountId` should probably be unique per connection, not globally, unless we normalize a composite key
- storing `institutionName` separately avoids depending on provider payload shape in the UI

### 2. Add a provider adapter in `src/lib/providers/simplefin.ts`

Start with a small adapter API:

- `isSimpleFINConfigured()`
- `decodeSimpleFINToken(token)`
- `claimAccessUrl(tokenOrClaimUrl)`
- `normalizeAccessUrl(accessUrl)`
- `getAccounts(accessUrl, options?)`

The adapter should:

- only allow `https:` URLs
- safely parse Basic Auth credentials from the access URL
- call `GET /accounts?balances-only=1` for balance syncs
- map the upstream payload into a stable internal shape for the rest of the app

## API Endpoints

Add a SimpleFIN API surface mirroring Plaid where it makes sense:

- `GET /api/simplefin/status`
- `GET /api/simplefin/connections`
- `POST /api/simplefin/connections`
- `POST /api/simplefin/connections/[id]/accounts`
- `POST /api/simplefin/connections/[id]/sync`
- `DELETE /api/simplefin/connections/[id]`

`POST /api/simplefin/connections` should:

1. accept either a token or an access URL
2. claim the access URL if a token was provided
3. fetch accounts from SimpleFIN
4. store the encrypted access URL
5. store discovered accounts
6. return the new connection plus accounts for selection/linking

## UI Flow

### Phase 1 UX

Keep the first pass intentionally simple:

- Add a "Connect via SimpleFIN" path alongside Plaid
- Show a short explanation with a link to the Bridge `/create` page
- Provide a textarea for the user to paste a token or access URL
- After submit, show discovered accounts
- Let the user:
  - create new Summa assets from selected accounts
  - later, link to existing assets

### Linking behavior

For v1, auto-create is enough if we do it cleanly:

- depository-style accounts -> cash asset
- credit-style accounts -> debt/credit asset
- everything else -> other asset

But the longer-term UX should support two actions per account:

- `Create new asset`
- `Link to existing asset`

That second action matters if the user already has manual accounts in Summa.

## Sync Strategy

The first sync goal should be balances only.

1. Manual sync per connection
2. Background cron sync like Plaid
3. Update linked assets from provider balances

Transaction import can wait. The app's current transaction model is investment/manual oriented and does not yet match generic bank ledger syncing cleanly.

## Implementation Phases

### Phase 0: Spike

- Add doc and branch
- Confirm payload mapping against live SimpleFIN data
- Decide whether to keep dedicated SimpleFIN tables or generalize provider tables

### Phase 1: Balances MVP

- add DB tables + migration
- add `src/lib/providers/simplefin.ts`
- add create/list/sync/delete endpoints
- add simple connection dialog UI
- add "create tracked assets from selected accounts"

### Phase 2: Link existing assets

- allow selecting an existing asset instead of always creating a new one
- add validation to prevent two provider accounts from linking to the same incompatible asset
- improve naming and duplicate handling

### Phase 3: Shared provider abstraction

Refactor Plaid and SimpleFIN toward shared interfaces:

- provider connection list item
- provider account list item
- provider sync contract
- shared "link imported accounts" UI

This is likely worth doing after the MVP proves out, not before.

## Key Decisions

### Should we generalize Plaid first?

No. The better path is:

1. ship a focused SimpleFIN MVP beside the existing Plaid flow
2. identify duplication
3. extract shared abstractions once we can see the common surface area

Trying to unify everything first will slow us down and raise risk.

### Should we support in-app login to SimpleFIN?

Not for the first version.

The standard SimpleFIN flow is:

1. user authenticates with the SimpleFIN server or Bridge
2. user receives a one-time token
3. app claims an access URL
4. app stores that access URL securely

So the right first UX is a guided token/access URL flow, not an embedded auth flow.

### Should we import transactions now?

No. Balances-first is the right MVP.

Transactions add:

- new persistence requirements
- deduplication logic
- pending/posted handling
- different UX expectations than Summa's current transaction model

## Risks

- SimpleFIN payload shape is evolving; protocol v2 landed recently
- Access URL handling must be treated as sensitive credential storage
- The current UI is Plaid-specific in naming and hooks, so some copy/components may need small generalization
- Multi-institution naming may be less standardized than Plaid

## Immediate Next Step

Implement the Balances MVP in this branch/worktree:

- worktree: `/tmp/summa-simplefin-spike`
- branch: `codex/simplefin-spike`
