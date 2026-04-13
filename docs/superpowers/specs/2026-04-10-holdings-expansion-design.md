# Holdings Expansion — Design Spec

## Overview

Add parent-child asset relationships so multi-holding accounts (Coinbase via SimpleFIN, Fidelity via CSV) display as a single expandable row in the portfolio view instead of dozens of flat rows. Children are full assets with tickers, price refresh, and snapshots.

## Parts

| Part | What | Depends on |
|------|------|-----------|
| **A. Schema + portfolio UI** | Add `parentAssetId`, expandable rows in portfolio view, filter children from top-level aggregation | Nothing |
| **B. SimpleFIN auto-grouping** | Group multi-account institutions under a parent during sync, zero-balance archiving | Part A |
| **C. Brokerage CSV import** | New `/import/brokerage` page, CSV parser, creates parent + ticker-based children | Part A |

Each part is one PR. B and C are independent of each other after A ships.

---

## Part A: Schema + Portfolio UI

### Schema change

Add one column to `assets`:

```sql
ALTER TABLE assets ADD COLUMN parent_asset_id uuid REFERENCES assets(id) ON DELETE CASCADE;
```

- `parentAssetId = null` → top-level asset (normal behavior, or a parent)
- `parentAssetId = <uuid>` → child holding nested under that parent
- Cascade delete: deleting a parent deletes all children
- No depth limit needed — only one level of nesting (parent → children, no grandchildren)

A parent asset's `currentValue` is the sum of its non-archived children's `currentValue`. This is computed on read (in the API or query), not stored redundantly.

### Drizzle schema update

In `src/lib/db/schema.ts`, add to the `assets` table:

```ts
parentAssetId: uuid("parent_asset_id").references(() => assets.id, { onDelete: "cascade" }),
```

Generate and run migration.

### API changes

**`GET /api/portfolios/[id]`** (the main portfolio fetch):
- Top-level assets: filter to `WHERE parent_asset_id IS NULL`
- For each parent (assets that have children), include a `children` array with the child assets
- For each parent, compute `currentValue` as sum of children's values
- Filter out archived children (`isArchived = true`) from the children array
- Maintain backward compatibility: assets without children behave exactly as today

Response shape change for assets:

```ts
// Existing asset shape, plus:
{
  ...existingAssetFields,
  children?: Asset[],      // only present if asset has children
  childCount?: number,     // total children (including archived)
  isChild: boolean,        // true if parentAssetId is set
}
```

**Snapshots**: Children get their own snapshots individually (they're full assets). The parent's snapshot is computed from children at snapshot time — the nightly cron sums children's values to produce the parent's snapshot value.

### Portfolio UI changes

In the portfolio view's asset list, render parent assets as expandable rows:

**Collapsed state:**
- Shows parent name, total value (sum of children), holding count badge ("6 holdings")
- Expand chevron on the left

**Expanded state:**
- Parent row stays visible
- Children render indented underneath with: name, ticker badge, quantity, value
- Each child row is clickable (opens asset detail view)

**Non-parent assets:** render exactly as today — no chevron, no expand.

### Edge cases

| Case | Behavior |
|------|----------|
| Parent with all children archived | Show parent with $0 value, "0 holdings" — user can unarchive from detail view |
| Delete a child | Parent's computed value updates on next read |
| Move a child to a different parent | Update `parentAssetId` — works naturally |
| Orphaned child (parent deleted) | Cascade delete handles this |
| Parent has no children yet | Behaves as a normal asset until children are added |

---

## Part B: SimpleFIN Auto-Grouping

### During sync

When the SimpleFIN sync cron runs (`/api/simplefin/connections/[id]/sync`):

1. After fetching account balances, group SimpleFIN accounts by `institutionName`
2. For groups with **2+ accounts** from the same institution:
   - Check if a parent asset already exists for this institution (look for an asset with `providerType: "simplefin"` and `providerConfig.isGroupParent: true` and matching institution name)
   - If no parent exists, create one: name = institution name (e.g., "Coinbase"), `providerType: "simplefin"`, `providerConfig: { isGroupParent: true, institutionName: "Coinbase", connectionId: "..." }`
   - For each account in the group: create/update the child asset with `parentAssetId` pointing to the parent
3. For groups with **1 account**: no parent, stays a normal top-level asset (like today)
4. Recompute parent's `currentValue` as sum of non-archived children

### Zero-balance handling

- On sync, if a child's balance is $0.00: set `isArchived: true`
- If a previously-archived child gets a non-zero balance: set `isArchived: false`
- Archived children don't show in the expanded view but aren't deleted

### First sync for existing users

When auto-grouping runs for the first time on accounts that were previously flat:

1. Detect that multiple assets share the same SimpleFIN `connectionId` and institution
2. Create the parent asset
3. Update existing child assets to set `parentAssetId`
4. This is a one-time migration within the sync — subsequent syncs just update values

### Account linking during initial SimpleFIN setup

The SimpleFIN "link accounts" flow (`POST /api/simplefin/connections/[id]/accounts`) currently creates one asset per account. Update it to:

1. After creating all individual assets, check for multi-account institutions
2. Create parent assets and set `parentAssetId` on children
3. Filter out zero-balance accounts (create them archived)

---

## Part C: Brokerage CSV Import

### Page: `/import/brokerage`

Separate from the Kubera import. Different intent: "create an account with holdings" vs. "import your whole portfolio."

### Flow

**Step 1 — Upload/paste**
File input or textarea (same pattern as Kubera import). Accepts `.csv`.

**Step 2 — Auto-detect format**
Parse headers to identify the brokerage:

| Brokerage | Key headers |
|-----------|-------------|
| Fidelity | `Symbol`, `Description`, `Quantity`, `Last Price`, `Current Value` |
| Schwab | `Symbol`, `Name`, `Quantity`, `Price`, `Market Value` |
| Generic | Any CSV with at least `symbol` and `quantity` or `value` columns |

Show detected format and a preview of positions.

**Step 3 — Configure**
- Account name (text input, e.g., "Fidelity 401k")
- Section picker (dropdown of existing sections, or "Create new")
- Confirm which positions to include (checkboxes, all checked by default)

**Step 4 — Confirm & import**
Shows: "Creating 'Fidelity 401k' with 12 holdings. Total value: $45,230."

**Step 5 — Result**
Success with link to portfolio view.

### What gets created

- **Parent asset**: name from step 3, `providerType: "manual"`, no ticker
- **Child assets**: one per position, each with:
  - `name`: stock/fund description (e.g., "Vanguard S&P 500 ETF")
  - `providerType: "ticker"`
  - `providerConfig: { ticker: "VOO" }` — enables Yahoo Finance auto-refresh
  - `quantity`: shares from the CSV
  - `currentValue`: market value from the CSV
  - `currentPrice`: price per share from the CSV
  - `parentAssetId`: points to the parent

After import, the Yahoo Finance cron (every 15 min) auto-refreshes all ticker-based children. Prices update in real time.

### Re-import

Uploading a new CSV for the same account: match children by ticker within the parent. Update quantities/values for existing holdings, create new ones, archive holdings no longer in the CSV.

### API

**`POST /api/import/brokerage`**

```ts
// Request
{
  accountName: string,
  sectionId: string,
  positions: Array<{
    symbol: string,
    name: string,
    quantity: number,
    price: number,
    value: number,
  }>,
}

// Response
{
  parentAssetId: string,
  holdingsCreated: number,
  totalValue: number,
}
```

Single endpoint, transactional (parent + all children in one DB transaction).

---

## Out of scope

- Cross-sheet aggregation / Recap page (v0.4 — see separate spec)
- Provider linking UI ("link this manual asset to SimpleFIN")
- Exchange API connections (Coinbase/Kraken direct API — separate v0.2 item)
- Wallet token promotion (moving ETH/SOL tokens from metadata to child assets)
- Grandchild nesting (only one level: parent → children)
- Drag-and-drop reordering of children
- Manual "group these assets" UI (could be added later)
