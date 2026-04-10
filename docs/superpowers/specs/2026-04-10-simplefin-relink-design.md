# SimpleFIN Account Relink/Unlink — Design Spec

## Overview

Add UI and API to relink SimpleFIN accounts to existing assets and unlink tracked accounts. Solves the problem where Kubera-imported manual assets can't be connected to SimpleFIN for auto-sync, and "tracked" accounts can't be fixed once linked to the wrong asset.

## UI Changes

### Tracked accounts — dropdown on badge

Replace the static "Tracked" badge on each SimpleFIN account in `SimpleFINConnectionCard` with a dropdown menu containing:

- **Relink** — opens an inline asset picker (list of assets from portfolio, filtered to same sheet type). Selecting an asset performs full takeover: the asset's `providerType` becomes `"simplefin"` and balances sync going forward.
- **Unlink** — reverts the linked asset to `providerType: "manual"`, clears SimpleFIN-specific `providerConfig` fields, and marks the SimpleFIN account as untracked (`assetId = null`, `isTracked = false`).

### Untracked accounts — "Link to existing" option

When linking an untracked account, add a "Link to existing asset" option alongside the current "create new" flow. This shows a dropdown of existing portfolio assets. On selection, performs the same takeover as relink.

## API

### `PATCH /api/simplefin/accounts/[id]`

New endpoint. Requires auth + ownership validation (account → connection → userId).

**Unlink:**
```json
{ "action": "unlink" }
```
- Sets `simplefinAccounts.assetId = null`, `isTracked = false`
- Reverts linked asset: `providerType = "manual"`, removes `connectionId` and `simplefinAccountId` from `providerConfig`

**Relink:**
```json
{ "action": "relink", "assetId": "<uuid>" }
```
- Validates target asset exists and belongs to user's portfolio
- Rejects if target asset is already linked to another SimpleFIN account
- If the SimpleFIN account was previously linked to a different asset, reverts that old asset to manual first
- Updates `simplefinAccounts.assetId`, `isTracked = true`
- Converts target asset: `providerType = "simplefin"`, `providerConfig = { connectionId, simplefinAccountId }`
- Updates asset `currentValue` from SimpleFIN account's current balance, sets `lastSyncedAt`

## Edge cases

| Case | Behavior |
|------|----------|
| Relink to asset already linked to another SimpleFIN account | 400 error — "Asset is already linked to a SimpleFIN account" |
| Unlink last child of a parent | Parent stays, shows $0 value |
| Relink to a child asset | Works — replaces the child's provider, keeps parentAssetId |
| Relink when old asset was a parent with children | Revert old asset to manual; children stay (they're independent assets) |

## Scope

- This spec covers relink/unlink only
- No changes to the initial SimpleFIN connection setup flow
- No changes to sync logic (sync continues to work with whatever asset is linked)
- No bulk operations — one account at a time
