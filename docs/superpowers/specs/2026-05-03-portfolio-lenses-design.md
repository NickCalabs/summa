# Portfolio Lenses

## Goal

Let the user create read-only "lenses" — named, cherry-picked sets of assets — and view them as a mini-dashboard scoped to that set. Aggregated total, growth chart, and a per-asset breakdown. The use case driving this: viewing total Bitcoin exposure across direct BTC, wrapped BTC, and Bitcoin ETFs in one view; same pattern for precious metals (ETF + manual physical), or any other thesis-based grouping.

A lens does not modify or move underlying assets. It is a pure view.

## Relationship to Existing `dashboard_pins`

The `dashboard_pins` table shipped on `feat/recap` (now merged to master) is functionally a minimal lens: portfolio_id, label, asset_ids[], sort_order. Rather than creating parallel `lenses` and `lens_assets` tables, we promote `dashboard_pins` to `lenses` and add the columns a fuller lens needs. One model, no split brain.

The aggregation engine in `src/lib/recap-utils.ts` and the drill-down endpoint at `/api/portfolios/[id]/recap/drill-down` are reused as-is. Lens charts call the existing drill-down API — we do not duplicate aggregation logic.

## Data Model

Rename `dashboard_pins` → `lenses` and add three columns:

| Column | Type | Purpose |
|---|---|---|
| `description` | text, nullable | Optional notes |
| `color` | text, nullable | Hex or named color for visual differentiation. When null, UI falls back to a deterministic palette indexed by lens id. |
| `is_pinned` | boolean, NOT NULL, default true | Controls whether the lens appears as a card on the portfolio dashboard. |

Existing columns kept as-is: `id`, `portfolio_id`, `label` (will be referred to as `name` in UI but column name stays `label` to keep the migration tight), `asset_ids` (jsonb string array), `sort_order`, `created_at`.

### Referential integrity

The current `dashboard_pins` has no cleanup when an underlying asset is deleted, leaving orphan asset IDs in `asset_ids`. Add cleanup to the asset delete path: in the same transaction that deletes an asset, filter the deleted asset's id out of every lens's `asset_ids` for the same portfolio. This is implemented in the asset deletion handler, not at the DB layer (jsonb GIN updates are awkward and we already control the deletion path in code).

If a lens's `asset_ids` becomes empty after cleanup, the lens is **kept** as an empty placeholder. The user can add assets to it later or delete it manually. Auto-deletion is destructive and surprising.

## API Surface

Renamed routes (existing handlers move; behavior preserved):

| Old | New |
|---|---|
| `GET /api/portfolios/[id]/dashboard-pins` | `GET /api/portfolios/[id]/lenses` |
| `POST /api/portfolios/[id]/dashboard-pins` | `POST /api/portfolios/[id]/lenses` |
| `DELETE /api/portfolios/[id]/dashboard-pins/[pinId]` | `DELETE /api/portfolios/[id]/lenses/[lensId]` |

New route:

| Method | Path | Purpose |
|---|---|---|
| `PATCH` | `/api/portfolios/[id]/lenses/[lensId]` | Edit name, asset_ids, color, description, is_pinned |

Lens charts call the existing `/api/portfolios/[id]/recap/drill-down?assetIds=<csv>` endpoint. No new chart endpoint.

### POST/PATCH request shapes

```ts
// POST /api/portfolios/[id]/lenses
{
  name: string;
  assetIds: string[];           // already-expanded list of asset UUIDs
  description?: string | null;
  color?: string | null;
  isPinned?: boolean;            // defaults true
}

// PATCH /api/portfolios/[id]/lenses/[lensId]
// All fields optional, only provided fields are updated
{
  name?: string;
  assetIds?: string[];
  description?: string | null;
  color?: string | null;
  isPinned?: boolean;
}
```

## Picker UX

A modal opened from the lens detail page (edit button) and from the create-lens flow. Two modes, toggled by a switch at the top of the modal.

### Default mode — Canonical groups

The recap engine groups assets by canonical aggregation key (`coin:BTC`, `equity:AAPL`, etc.) via `getRecapAggregationKey()` in `recap-utils.ts`. The picker shows one row per canonical group present in the user's portfolio:

```
[ ] Bitcoin              3 sources    $47,200.00
[ ] Apple                2 sources    $12,450.00
[ ] Wrapped Bitcoin      1 source     $5,100.00
[ ] BITU (2x BTC ETF)    1 source     $2,300.00
[ ] ...
```

User checks the groups they want. On save, each checked group expands to its underlying asset IDs and the union is stored in `lens.asset_ids`. Group membership is computed at pick time and **not** persisted as a group reference. Consequence: if a new BTC source is added later, it does not auto-join existing lenses. The user edits the lens to add it. This is predictable behavior; auto-membership would be surprising.

The user's stated use case (BTC + WBTC + BITU as one "Bitcoin Exposure" lens) requires checking three separate canonical groups. That's fine and expected — they are genuinely different assets with different prices.

### Advanced mode — Individual assets

A toggle reveals every asset under each canonical group, allowing per-source selection:

```
▼ Bitcoin                3 sources   $47,200.00   [select all]
    [ ] BTC (Coinbase)              $30,000.00
    [ ] BTC (Trezor wallet)          $15,000.00
    [ ] BTC (Manual entry)            $2,200.00
▼ Wrapped Bitcoin        1 source    $5,100.00
    [ ] WBTC (Coinbase)              $5,100.00
```

Mixed selection is allowed (e.g., the entire "Bitcoin" group plus only one specific WBTC asset). Storage shape is unchanged.

### Search

A search input at the top filters group/asset names client-side. No server-side search needed — the user has at most a few hundred assets.

## Lens Detail Page

Route: `/portfolio/[portfolioId]/lens/[lensId]`

Layout, top to bottom:

### Header

- Lens name, color dot
- "Pinned to dashboard" toggle (sets `is_pinned`)
- Edit button (opens side panel)
- Delete button (confirmation, then redirects to portfolio dashboard)

### Hero

Mirrors the recap drill-down hero:
- Aggregated current value in the active display currency
- Period change (absolute + %) over the selected range

### Chart

Full-width area chart driven by `useRecapDrillDown(portfolioId, assetIds)`. Date range buttons: 1M / 3M / 6M / YTD / 1Y / ALL. Reuses the chart pattern from `src/components/recap/recap-drill-down.tsx` — same hook, same Recharts area composition — but rendered in-page rather than as a slide-over panel.

Display currency respect: the chart honors `DisplayCurrencyContext` (BTC/sats toggle), same as existing dashboard pin cards.

### Asset Breakdown Table

Each underlying asset, one row:

| Column | Source |
|---|---|
| Name | `asset.name` |
| Source / Account | `getProviderLabel(asset.providerType)` (the helper at `src/components/portfolio/account-detail-view.tsx:1927` — extract to `src/lib/asset-helpers.ts` as part of this work so it can be shared) |
| Value | `asset.currentValue` converted to display currency |
| % of lens | `asset.value / lens.total` |

Row click navigates to `/portfolio/[id]/asset/[assetId]`.

**Note on period change column:** The existing drill-down endpoint returns only aggregated `{date, value}[]` — no per-asset series. Per-asset period change is **deferred to v2**. The aggregated period change is shown in the lens hero, which is the primary "how is this thesis doing" signal. If we want per-asset period change in v2, the cleanest path is extending `/recap/drill-down` with an optional `groupBy=asset` query param that returns `{date, perAsset: {[assetId]: value}}[]`.

### Empty state

If `asset_ids` is empty, show a placeholder explaining the lens has no assets and a button to open the picker.

## Edit Side Panel

Triggered by the Edit button on the lens detail page. Slide-in side panel (matches the existing detail-panel pattern in the app). Fields:

- Name (text input)
- Description (textarea, optional)
- Color (swatch picker with ~8 fixed colors from a curated palette, optional; stored as hex)
- Pinned to dashboard (toggle, mirrors header toggle)
- Assets (button: "Edit assets" → opens the picker modal on top of the side panel)

Save commits a single `PATCH` with only changed fields. Cancel discards.

## Dashboard Integration

The existing `DashboardPinsSection` and `DashboardPinCard` components are renamed and updated:

- `DashboardPinsSection` → `LensesSection`
  - Queries `useLenses(portfolioId)`, filters to `is_pinned = true`, sorts by `sort_order`
- `DashboardPinCard` → `LensCard`
  - Same mini chart + label + total layout
  - **Change:** clicking the card navigates to `/portfolio/[id]/lens/[lensId]` (currently the card is non-navigable)
  - The hover-to-remove button is repurposed as "Unpin from dashboard" — sets `is_pinned = false` rather than deleting the lens
  - A separate "Delete lens" action lives on the lens detail page

The "Add to Dashboard" flow on the recap drill-down chart now creates a Lens with `is_pinned: true`. The default lens name comes from the canonical group label (same as the current pin label behavior). UX is preserved.

## Migration & Prerequisite

### Step 0 — Fix migration journal (lands first)

The migration journal is currently out of sync. Migration `0015_short_wasp` is in the journal but its row is missing from `drizzle.__drizzle_migrations` (its columns already exist in the DB from a prior path). `pnpm db:migrate` fails on 0015 until this is resolved.

Fix: insert a one-time `drizzle.__drizzle_migrations` row marking 0015 as applied. This is less invasive than rewriting `0015_short_wasp.sql` to use `IF NOT EXISTS`. Document the SQL in the implementation plan; the user runs it manually via `docker exec ... psql` once.

### Step 1 — `0017_lenses.sql`

```sql
ALTER TABLE "dashboard_pins" RENAME TO "lenses";
ALTER TABLE "lenses" ADD COLUMN "description" text;
ALTER TABLE "lenses" ADD COLUMN "color" text;
ALTER TABLE "lenses" ADD COLUMN "is_pinned" boolean DEFAULT true NOT NULL;
ALTER TABLE "lenses" RENAME CONSTRAINT "dashboard_pins_portfolio_id_portfolios_id_fk" TO "lenses_portfolio_id_portfolios_id_fk";
```

Generated via `pnpm db:generate` after schema rename, then committed. Drizzle should produce the rename in its journal automatically.

### Step 2 — Code rename (same PR as the migration)

Mechanical rename across these files (verified with grep):

- `src/lib/db/schema.ts` — `dashboardPins` table reference → `lenses`
- `src/app/api/portfolios/[id]/dashboard-pins/route.ts` → `.../lenses/route.ts`
- `src/app/api/portfolios/[id]/dashboard-pins/[pinId]/route.ts` → `.../lenses/[lensId]/route.ts`
- `src/hooks/use-dashboard-pins.ts` → `use-lenses.ts`
- `src/hooks/use-create-dashboard-pin.ts` → `use-create-lens.ts`
- `src/hooks/use-delete-dashboard-pin.ts` → `use-delete-lens.ts` (add `use-update-lens.ts`)
- `src/components/dashboard/pins/dashboard-pin-card.tsx` → `src/components/lenses/lens-card.tsx`
- `src/components/dashboard/pins/dashboard-pins-section.tsx` → `src/components/lenses/lenses-section.tsx`
- `src/components/dashboard/dashboard-view.tsx` — update import + JSX tag
- Recap drill-down chart's "Add to Dashboard" button — update mutation hook + label

## New Files

- `src/app/(app)/portfolio/[portfolioId]/lens/[lensId]/page.tsx` — lens detail page
- `src/components/lenses/lens-detail-view.tsx` — page composition
- `src/components/lenses/lens-hero.tsx` — aggregated total + period change
- `src/components/lenses/lens-chart.tsx` — area chart wrapper around drill-down hook
- `src/components/lenses/lens-breakdown-table.tsx` — per-asset rows
- `src/components/lenses/lens-edit-panel.tsx` — side panel for editing
- `src/components/lenses/lens-picker-modal.tsx` — canonical-group + advanced picker
- `src/hooks/use-update-lens.ts` — PATCH mutation
- `src/lib/lens-utils.ts` — picker expansion logic (canonical group → asset IDs), shared between picker and any server-side validation
- `src/lib/asset-helpers.ts` — extract `getProviderLabel` (currently inline at `src/components/portfolio/account-detail-view.tsx:1927`) so it can be reused by the lens breakdown table

## Testing

### Unit tests

- **Picker expansion** (`src/lib/lens-utils.test.ts`): given a portfolio with N assets, mock canonical-group + individual selections, assert resulting `asset_ids` list is correct, deduplicated, and order-stable.
- **Asset deletion cleanup**: mock asset delete, verify lens `asset_ids` arrays no longer contain the deleted ID. Verify a lens whose final asset is deleted is kept (empty), not auto-deleted.
- **Drill-down aggregation for mixed canonical groups**: BTC + WBTC + BITU snapshot data → drill-down sum matches expected total per date. (May already exist for the recap engine — extend if needed.)

### Integration test

- Create lens via POST → fetch via GET → drill-down returns aggregated time series → PATCH `is_pinned: false` → no longer in dashboard query → PATCH `is_pinned: true` → reappears.

### Manual smoke test

- Create a "Bitcoin Exposure" lens picking BTC + WBTC + BITU canonical groups. Verify chart shows aggregated value, breakdown shows all three with correct percentages.
- Create a "Precious Metals" lens with a gold ETF + manual physical gold entry. Verify same.
- Create a lens, pin it, verify it appears on the dashboard. Click the card — navigates to detail page. Toggle unpin — disappears from dashboard but lens still exists.
- Delete an asset that's in a lens. Verify the lens still loads with the remaining assets.

## Out of Scope

- Cross-portfolio lenses (deferred; current model is one lens per portfolio)
- Tag-based auto-membership (e.g., "all assets tagged #crypto") — picker-based selection only
- Sharing or exporting lenses
- Per-lens currency override — lenses inherit the portfolio's display currency
- Dedicated `/lenses` browser/management page — handful of lenses, lightweight UI
- Reordering lens cards on the dashboard via drag-and-drop (the existing `sort_order` column stays; reorder UI can come later)
- Per-asset period change in the breakdown table (deferred to v2; see Lens Detail Page → Asset Breakdown Table)
