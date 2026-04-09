# Kubera JSON Import — Design Spec

## Overview

One-time migration tool to import a Kubera JSON export into Summa. Recreates the Kubera portfolio structure (sheets, sections, accounts) and populates asset data for accounts that don't already exist in Summa.

**Not** a historical import — Kubera exports a single point-in-time snapshot. This tool scaffolds the account structure and captures current values so the user doesn't have to manually re-enter ~20+ accounts.

## Data source

Kubera exports JSON, CSV, and Excel. We parse the **JSON** — it's typed, hierarchical, and unambiguous.

### Kubera JSON structure

Top level: `{ asset: [...], debt: [...] }`

Each account object:

```json
{
  "id": "uuid",
  "name": "Chase - TOTAL CHECKING - 5988",
  "sectionId": "uuid",
  "sectionName": "Cash",
  "sheetId": "uuid",
  "sheetName": "Cash",
  "category": "asset",
  "value": { "amount": 466.36, "currency": "USD" },
  "ticker": "USD",
  "quantity": 466.36,
  "investable": "investable_cash",
  "ownership": 1,
  "subType": "cash",
  "rate": { "price": 70771, "currency": "USD" },
  "assetClass": "crypto",
  "type": "bank",
  "purchaseDate": "2022-12-06",
  "isManual": true,
  "connection": { "aggregator": "yodlee", "providerName": "Chase", ... }
}
```

Key observations:
- `category` is "asset" or "debt" — maps to sheet type
- `value.currency` is always USD in this export
- `ticker` differentiates crypto (BTC/SOL/ETH) from fiat (USD)
- `rate.price` is present for crypto assets (price per unit)
- `connection` is present for provider-linked accounts (Plaid/Yodlee)
- `sheetName` + `sectionName` define the hierarchy
- `ownership` is 0–1 (Summa uses 0–100)

## User flow

### Page: `/import/kubera`

Standalone page (not a modal). Accessed from settings or a direct link. One-time use.

**Step 1 — Upload**

File input accepting `.json`. Parsed client-side with `FileReader` — no server upload. The JSON may not contain the export date, so show a date picker defaulting to today. The user can adjust to the actual export date (shown in the companion CSV header).

**Step 2 — Review & match**

Tree view grouped by Sheet > Section > Account, mirroring the Kubera hierarchy:

```
┌─────────────────────────────────────────────────────────┐
│  Import from Kubera                                     │
│  Portfolio: Nick · Exported Mar 20, 2026                │
├─────────────────────────────────────────────────────────┤
│  ▼ Cash (sheet)                                         │
│    ▼ Cash (section)                                     │
│      Chase - TOTAL CHECKING - 5988   $466    [Match ▾]  │
│        → Matched: "Chase Checking" (Plaid)              │
│      Chase - CHASE SAVINGS - 2990    $0      [Skip  ▾]  │
│    ▼ CEX (section)                                      │
│      Riv                             $50     [Create ▾] │
│  ▼ Bitcoin (sheet)                                      │
│    ▼ Cold (section)                                     │
│      Sparr     0.15 BTC  $10,615             [Create ▾] │
│      Trez      0.08 BTC  $5,661              [Create ▾] │
│  ▼ Debts (sheet)                                        │
│    ▼ Loans (section)                                    │
│      Nelnet                          $14,988 [Create ▾] │
├─────────────────────────────────────────────────────────┤
│  Summary: 5 create · 1 match · 1 skip                  │
│  Will create 2 sheets, 3 sections                       │
│                                              [Import]   │
└─────────────────────────────────────────────────────────┘
```

**Per-account dropdown options:**

| Action | Behavior |
|--------|----------|
| Create | Create new asset in the corresponding Summa sheet/section (auto-created if needed) |
| Match  | Link to existing Summa asset via searchable dropdown. No value update. |
| Skip   | Ignore this account entirely |

**Auto-matching logic** (runs on parse):
1. Exact name match against existing Summa assets → pre-select "Match"
2. Case-insensitive substring match → suggest match, user confirms
3. No match → default to "Create"

**Step 3 — Confirm**

Summary screen: "Creating X assets, matching Y, skipping Z. Creating N sheets and M sections." Single "Confirm" button.

**Step 4 — Result**

Success summary with link to dashboard.

## Field mapping (Create)

| Kubera field | Summa field | Transform |
|---|---|---|
| `name` | `assets.name` | Direct |
| `category` | Sheet `type` | "asset" → "assets", "debt" → "debts" |
| `value.amount` | `assets.currentValue` | Direct |
| `value.currency` | `assets.currency` | Direct |
| `ticker` | `providerConfig.ticker` | Direct (for ticker-based assets) |
| `quantity` | `assets.quantity` | Direct |
| `rate.price` | `assets.currentPrice` | Direct |
| `ownership` | `assets.ownershipPct` | Multiply by 100 |
| `sheetName` | Sheet name | Create if not exists |
| `sectionName` | Section name | Create if not exists, under corresponding sheet |
| `assetClass` | `assets.type` | Map: "crypto"→"crypto", "cash"→"cash", etc. |
| `investable` | `assets.isInvestable` | "investable_cash" or "investable_easy_convert" → true |
| `investable` | `assets.isCashEquivalent` | "investable_cash" → true |
| `purchaseDate` | `assets.notes` | Append "Purchased: YYYY-MM-DD" (no dedicated field) |
| `cost` | `assets.costBasis` | Direct (if present in JSON) |
| ticker + `isManual` | `assets.providerType` | Non-USD ticker (BTC/SOL/ETH) → "ticker" (enables auto price refresh); USD → "manual" |

**Fields dropped:** `tickerId`, `tickerSector`, `holdingPeriodInDays`, `liquidity`, `geography`, `sector`, Kubera UUIDs, `connection` details. Not useful in Summa.

## Field mapping (Match)

Matching links a Kubera account to an existing Summa asset. **No data is updated** on the matched asset — it already has its own data source (Plaid, SimpleFIN, wallet sync, or manual entry). The match only prevents creating a duplicate.

## Snapshots

For each **created** asset, insert one row into `asset_snapshots`:
- `date`: Kubera export date (from file metadata or user-confirmed)
- `value`: `value.amount`
- `valueInBase`: `value.amount` (USD-only assumption; same as value)
- `price`: `rate.price` (if present)
- `quantity`: `quantity`
- `source`: `"import"`

No portfolio snapshot recomputation — the nightly cron will pick it up.

## API

### `POST /api/import/kubera`

Single endpoint. All writes in one DB transaction.

**Request:**

```ts
{
  exportDate: string,           // "2026-03-20"
  portfolioId: string,
  actions: Array<{
    kuberaId: string,
    action: "create" | "match" | "skip",
    summaAssetId?: string,      // required when action = "match"
    kuberaData: KuberaAccount,  // full Kubera account object
  }>,
  sheetsToCreate: Array<{ name: string, type: "assets" | "debts" }>,
  sectionsToCreate: Array<{ name: string, sheetName: string }>
}
```

**Response:**

```ts
{
  assetsCreated: number,
  assetsMatched: number,
  assetsSkipped: number,
  snapshotsInserted: number,
  sheetsCreated: number,
  sectionsCreated: number,
  errors: string[]
}
```

**Insert order** (foreign keys): Sheets → Sections → Assets → Snapshots.

**Transaction:** All-or-nothing. If any insert fails, the entire import rolls back.

**Idempotency:** `asset_snapshots` unique constraint on `(assetId, date)` — use `INSERT ... ON CONFLICT DO UPDATE` so re-running the import with the same data is safe.

## Failure modes

| Mode | Handling |
|---|---|
| Invalid JSON / wrong format | Client-side parse error, no server call |
| Sheet/section name collision | Find existing sheet/section by name, reuse it |
| Asset name collision on "Create" | Allow it — user made a conscious choice |
| Duplicate snapshot (re-run) | ON CONFLICT DO UPDATE — overwrites safely |
| Transaction failure | Roll back everything, show error message |
| Empty value.amount | Create asset with value 0 — that's valid |

## Component structure

```
src/app/(app)/import/kubera/page.tsx          — page shell
src/components/import/
  kubera-import.tsx                           — main stateful component (upload → review → confirm → result)
  kubera-tree.tsx                             — tree view of parsed accounts
  kubera-account-row.tsx                      — single account row with action dropdown
  kubera-match-dropdown.tsx                   — searchable existing-asset picker
```

## Out of scope

- Historical data import (Kubera doesn't export it)
- Importing Kubera connections/provider links (those don't transfer)
- CSV or Excel parsing (JSON is sufficient)
- AI-powered PDF extraction (v0.7)
- Re-import / sync (this is one-shot)
- Portfolio snapshot recomputation (nightly cron handles it)
