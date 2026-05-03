# Portfolio Lenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote `dashboard_pins` to a fuller `lenses` model so users can cherry-pick assets across accounts/providers, view an aggregated value + chart on a dedicated page, and optionally pin the lens to the dashboard.

**Architecture:** Rename `dashboard_pins` → `lenses` and add `description`, `color`, `is_pinned` columns. Reuse the existing `recap-utils` aggregation engine and `/recap/drill-down` endpoint — no duplicated aggregation logic. Add a lens detail page at `/portfolio/[id]/lens/[lensId]`, a canonical-group + advanced picker modal, and a side-panel editor. The dashboard's existing pin section becomes the lenses section.

**Tech Stack:** Next.js App Router, Drizzle ORM (Postgres), TanStack Query, Vitest, Recharts, Tailwind, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-05-03-portfolio-lenses-design.md`

---

## Spec Refinement: Soft Delete

The spec called for cleaning up `lens.asset_ids` when an underlying asset is deleted. Investigation revealed asset deletion is a **soft delete** (sets `isArchived = true`) — the row stays. So instead of mutating `asset_ids` arrays, the lens GET endpoint **filters archived asset IDs out of the response** at read time. If the user un-archives the asset, it reappears in the lens automatically. This is simpler and reversible.

The chart-aggregation drill-down endpoint queries `asset_snapshots` directly by asset_id and does not check `isArchived`. To prevent archived assets from contributing to the lens chart, the lens detail page passes the **filtered** list (non-archived only) to `useRecapDrillDown`. No changes needed to the drill-down endpoint.

---

## File Structure

### New files

| Path | Purpose |
|---|---|
| `src/lib/db/migrations/0017_*.sql` | Rename + add columns |
| `src/lib/lens-utils.ts` | Picker expansion logic (canonical group → asset IDs) |
| `src/lib/__tests__/lens-utils.test.ts` | Unit tests for picker expansion |
| `src/lib/asset-helpers.ts` | Extract `getProviderLabel` so lens table can reuse |
| `src/hooks/use-lenses.ts` | GET lenses (replaces `use-dashboard-pins.ts`) |
| `src/hooks/use-create-lens.ts` | POST (replaces `use-create-dashboard-pin.ts`) |
| `src/hooks/use-delete-lens.ts` | DELETE (replaces `use-delete-dashboard-pin.ts`) |
| `src/hooks/use-update-lens.ts` | PATCH (new) |
| `src/components/lenses/lens-card.tsx` | Dashboard mini-card (replaces `dashboard-pin-card.tsx`) |
| `src/components/lenses/lenses-section.tsx` | Dashboard section (replaces `dashboard-pins-section.tsx`) |
| `src/components/lenses/lens-detail-view.tsx` | Page composition |
| `src/components/lenses/lens-hero.tsx` | Total + period change |
| `src/components/lenses/lens-chart.tsx` | Full-size area chart |
| `src/components/lenses/lens-breakdown-table.tsx` | Per-asset rows |
| `src/components/lenses/lens-edit-panel.tsx` | Side panel for name/color/description/pin/assets |
| `src/components/lenses/lens-picker-modal.tsx` | Canonical-group + advanced picker |
| `src/app/(app)/portfolio/[portfolioId]/lens/[lensId]/page.tsx` | Lens detail route |
| `src/app/api/portfolios/[id]/lenses/route.ts` | GET + POST |
| `src/app/api/portfolios/[id]/lenses/[lensId]/route.ts` | DELETE + PATCH |

### Modified files

| Path | Why |
|---|---|
| `src/lib/db/schema.ts` | Rename `dashboardPins` → `lenses`, add columns |
| `src/components/dashboard/dashboard-view.tsx` | Replace `<DashboardPinsSection>` with `<LensesSection>` |
| `src/components/recap/recap-drill-down.tsx` | Switch hooks `useDashboardPins` → `useLenses`, etc. |
| `src/components/portfolio/account-detail-view.tsx` | Use `getProviderLabel` from new shared module |

### Deleted files

`src/hooks/use-dashboard-pins.ts`, `use-create-dashboard-pin.ts`, `use-delete-dashboard-pin.ts`, `src/components/dashboard/pins/dashboard-pin-card.tsx`, `src/components/dashboard/pins/dashboard-pins-section.tsx`, `src/app/api/portfolios/[id]/dashboard-pins/` (whole directory).

---

## Task 1: Fix migration journal prerequisite

The migration `0015_short_wasp` is in the journal but its row is missing from `drizzle.__drizzle_migrations`. `pnpm db:migrate` fails on it. Fix once before running the new lens migration.

**Files:** none (manual SQL).

- [ ] **Step 1: Verify the issue exists**

```bash
docker exec summa-db psql -U summa -d summa -c "SELECT idx, hash FROM drizzle.__drizzle_migrations ORDER BY idx;"
```

Expected: rows for migrations up through `0014_dear_hairball` but missing `0015_short_wasp` and `0016_greedy_speed`.

- [ ] **Step 2: Read the journal hashes for 0015 and 0016**

```bash
cat /opt/summa/src/lib/db/migrations/meta/_journal.json | head -40
```

Note the `tag` and `when` values for `0015_short_wasp` and `0016_greedy_speed`. The hash inserted into `drizzle.__drizzle_migrations` is the SHA256 of the migration SQL content.

- [ ] **Step 3: Compute the hashes**

```bash
sha256sum /opt/summa/src/lib/db/migrations/0015_short_wasp.sql /opt/summa/src/lib/db/migrations/0016_greedy_speed.sql
```

Save the two hashes — they are the values inserted in the next step.

- [ ] **Step 4: Insert journal rows**

Replace `<HASH_0015>` and `<HASH_0016>` with the values from Step 3. The `created_at` value is the epoch milliseconds from `_journal.json` for each migration's `when` field.

```bash
docker exec summa-db psql -U summa -d summa <<'SQL'
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES
  ('<HASH_0015>', <WHEN_0015>),
  ('<HASH_0016>', <WHEN_0016>)
ON CONFLICT DO NOTHING;
SQL
```

- [ ] **Step 5: Verify `pnpm db:migrate` runs cleanly**

```bash
cd /opt/summa && pnpm db:migrate
```

Expected: "No migrations to apply" or similar — both 0015 and 0016 are now recorded.

- [ ] **Step 6: Commit (no code changes — log a note)**

There's no file change in this task. Skip the commit; the change is environmental. Note in the implementation tracker that the journal was repaired.

---

## Task 2: Rename schema + add columns

**Files:**
- Modify: `src/lib/db/schema.ts:242-258`

- [ ] **Step 1: Update the schema export**

Replace the `dashboardPins` block (lines ~242–258) with:

```typescript
// ── Lenses ──
//
// User-defined views that aggregate a hand-picked set of assets across accounts
// and providers. A Lens has its own detail page and can optionally appear as a
// card on the dashboard via `is_pinned`.
//
// Storage shape mirrors the original dashboard_pins (id, portfolio, label,
// asset_ids, sort_order, created_at) plus description/color/is_pinned. The
// column is still named `label` in the DB to keep the rename migration tight;
// the API response field is also `label` (UI calls it "name").

export const lenses = pgTable("lenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  description: text("description"),
  color: text("color"),
  isPinned: boolean("is_pinned").notNull().default(true),
  assetIds: jsonb("asset_ids").$type<string[]>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Make sure `boolean` is imported from `drizzle-orm/pg-core` at the top of the file. Check the existing imports — if not present, add it.

- [ ] **Step 2: Generate the migration**

```bash
cd /opt/summa && pnpm db:generate
```

Drizzle will detect the rename + new columns and emit `src/lib/db/migrations/0017_<adjective>_<name>.sql`. Inspect the file:

```bash
ls -t /opt/summa/src/lib/db/migrations/*.sql | head -1
cat $(ls -t /opt/summa/src/lib/db/migrations/*.sql | head -1)
```

Expected output: `ALTER TABLE "dashboard_pins" RENAME TO "lenses";`, three `ADD COLUMN` statements, and a `RENAME CONSTRAINT` for the FK.

- [ ] **Step 3: If Drizzle treats it as drop+create, fix manually**

Drizzle sometimes proposes `DROP TABLE dashboard_pins; CREATE TABLE lenses;` if the rename heuristic doesn't fire. If that's what you see, replace the file's contents with:

```sql
ALTER TABLE "dashboard_pins" RENAME TO "lenses";
--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "description" text;
--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "color" text;
--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "is_pinned" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "lenses" RENAME CONSTRAINT "dashboard_pins_portfolio_id_portfolios_id_fk" TO "lenses_portfolio_id_portfolios_id_fk";
```

Then update the journal entry in `src/lib/db/migrations/meta/_journal.json` if Drizzle wrote a placeholder snapshot — re-run `pnpm db:generate` to regenerate the snapshot from the corrected schema.

- [ ] **Step 4: Apply the migration**

```bash
cd /opt/summa && pnpm db:migrate
```

Expected: "Applied migration 0017_..." with no errors.

- [ ] **Step 5: Verify in the DB**

```bash
docker exec summa-db psql -U summa -d summa -c "\d lenses"
```

Expected: table named `lenses` with columns `id, portfolio_id, label, description, color, is_pinned, asset_ids, sort_order, created_at`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat(lenses): rename dashboard_pins to lenses, add description/color/is_pinned"
```

---

## Task 3: Add lens API routes (GET, POST, DELETE, PATCH)

Create new route files under `lenses/`. Existing `dashboard-pins/` files are removed in Task 4.

**Files:**
- Create: `src/app/api/portfolios/[id]/lenses/route.ts`
- Create: `src/app/api/portfolios/[id]/lenses/[lensId]/route.ts`

- [ ] **Step 1: Create the collection route (GET, POST)**

Write `src/app/api/portfolios/[id]/lenses/route.ts`:

```typescript
import { db } from "@/lib/db";
import { lenses, assets, sections, sheets } from "@/lib/db/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
  validateUuid,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const rows = await db
      .select()
      .from(lenses)
      .where(eq(lenses.portfolioId, id))
      .orderBy(asc(lenses.sortOrder), asc(lenses.createdAt));

    // Filter archived asset IDs out of each lens's assetIds at read time.
    // Soft-deleted assets stay in the column but are hidden from views.
    const allIds = Array.from(new Set(rows.flatMap((r) => r.assetIds)));
    if (allIds.length === 0) return jsonResponse(rows);

    const liveAssets = await db
      .select({ id: assets.id })
      .from(assets)
      .innerJoin(sections, eq(assets.sectionId, sections.id))
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .where(
        and(
          eq(sheets.portfolioId, id),
          eq(assets.isArchived, false),
          inArray(assets.id, allIds)
        )
      );

    const liveSet = new Set(liveAssets.map((a) => a.id));
    const filtered = rows.map((r) => ({
      ...r,
      assetIds: r.assetIds.filter((aid) => liveSet.has(aid)),
    }));

    return jsonResponse(filtered);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await request.json();
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : null;
    const color = typeof body.color === "string" ? body.color : null;
    const isPinned = typeof body.isPinned === "boolean" ? body.isPinned : true;
    const assetIds = Array.isArray(body.assetIds)
      ? body.assetIds.filter((v: unknown): v is string => typeof v === "string")
      : [];

    if (!label) throw errorResponse("label is required", 400);
    if (assetIds.length === 0)
      throw errorResponse("assetIds must be a non-empty array", 400);

    const [created] = await db
      .insert(lenses)
      .values({
        portfolioId: id,
        label,
        description,
        color,
        isPinned,
        assetIds,
      })
      .returning();

    return jsonResponse(created, 201);
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 2: Create the item route (DELETE, PATCH)**

Write `src/app/api/portfolios/[id]/lenses/[lensId]/route.ts`:

```typescript
import { db } from "@/lib/db";
import { lenses } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  handleError,
  validateUuid,
  errorResponse,
} from "@/lib/api-helpers";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; lensId: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id, lensId } = await params;
    validateUuid(id, "portfolio ID");
    validateUuid(lensId, "lens ID");
    await requirePortfolioOwnership(id, user.id);

    const result = await db
      .delete(lenses)
      .where(and(eq(lenses.id, lensId), eq(lenses.portfolioId, id)))
      .returning();

    if (result.length === 0) throw errorResponse("Lens not found", 404);

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; lensId: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id, lensId } = await params;
    validateUuid(id, "portfolio ID");
    validateUuid(lensId, "lens ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await request.json();
    const updates: Partial<{
      label: string;
      description: string | null;
      color: string | null;
      isPinned: boolean;
      assetIds: string[];
    }> = {};

    if (typeof body.label === "string") {
      const label = body.label.trim();
      if (!label) throw errorResponse("label cannot be empty", 400);
      updates.label = label;
    }
    if (body.description === null || typeof body.description === "string") {
      updates.description =
        typeof body.description === "string"
          ? body.description.trim() || null
          : null;
    }
    if (body.color === null || typeof body.color === "string") {
      updates.color = body.color;
    }
    if (typeof body.isPinned === "boolean") {
      updates.isPinned = body.isPinned;
    }
    if (Array.isArray(body.assetIds)) {
      const assetIds = body.assetIds.filter(
        (v: unknown): v is string => typeof v === "string"
      );
      if (assetIds.length === 0)
        throw errorResponse("assetIds must be a non-empty array", 400);
      updates.assetIds = assetIds;
    }

    if (Object.keys(updates).length === 0) {
      throw errorResponse("no updatable fields provided", 400);
    }

    const [updated] = await db
      .update(lenses)
      .set(updates)
      .where(and(eq(lenses.id, lensId), eq(lenses.portfolioId, id)))
      .returning();

    if (!updated) throw errorResponse("Lens not found", 404);

    return jsonResponse(updated);
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 3: Smoke test the routes**

Start the dev server:

```bash
cd /opt/summa && pnpm dev
```

In another shell, hit the routes (substitute a real portfolio id):

```bash
curl -s -b /tmp/summa-cookies.txt http://localhost:3000/api/portfolios/<pid>/lenses | jq .
```

Expected: existing dashboard pins (now lenses) returned, with `description`, `color`, `isPinned` columns present (`description: null`, `color: null`, `isPinned: true`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/portfolios/[id]/lenses
git commit -m "feat(lenses): add lens API routes (GET/POST/DELETE/PATCH)"
```

---

## Task 4: Rename hooks (and add `use-update-lens`)

**Files:**
- Create: `src/hooks/use-lenses.ts`
- Create: `src/hooks/use-create-lens.ts`
- Create: `src/hooks/use-delete-lens.ts`
- Create: `src/hooks/use-update-lens.ts`
- Delete: `src/hooks/use-dashboard-pins.ts`
- Delete: `src/hooks/use-create-dashboard-pin.ts`
- Delete: `src/hooks/use-delete-dashboard-pin.ts`

- [ ] **Step 1: Create `use-lenses.ts`**

```typescript
import { useQuery } from "@tanstack/react-query";

export interface Lens {
  id: string;
  portfolioId: string;
  label: string;
  description: string | null;
  color: string | null;
  isPinned: boolean;
  assetIds: string[];
  sortOrder: number;
  createdAt: string;
}

export function useLenses(portfolioId: string) {
  return useQuery<Lens[]>({
    queryKey: ["lenses", portfolioId],
    enabled: !!portfolioId,
    queryFn: async () => {
      const res = await fetch(`/api/portfolios/${portfolioId}/lenses`);
      if (!res.ok) throw new Error("Failed to fetch lenses");
      return res.json();
    },
  });
}
```

- [ ] **Step 2: Create `use-create-lens.ts`**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lens } from "./use-lenses";

interface CreateInput {
  portfolioId: string;
  label: string;
  assetIds: string[];
  description?: string | null;
  color?: string | null;
  isPinned?: boolean;
}

export function useCreateLens() {
  const qc = useQueryClient();
  return useMutation<Lens, Error, CreateInput>({
    mutationFn: async ({ portfolioId, ...body }) => {
      const res = await fetch(`/api/portfolios/${portfolioId}/lenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create lens");
      }
      return res.json();
    },
    onSuccess: (_, { portfolioId }) => {
      qc.invalidateQueries({ queryKey: ["lenses", portfolioId] });
    },
  });
}
```

- [ ] **Step 3: Create `use-delete-lens.ts`**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface DeleteInput {
  portfolioId: string;
  lensId: string;
}

export function useDeleteLens() {
  const qc = useQueryClient();
  return useMutation<void, Error, DeleteInput>({
    mutationFn: async ({ portfolioId, lensId }) => {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/lenses/${lensId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete lens");
      }
    },
    onSuccess: (_, { portfolioId }) => {
      qc.invalidateQueries({ queryKey: ["lenses", portfolioId] });
    },
  });
}
```

- [ ] **Step 4: Create `use-update-lens.ts`**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lens } from "./use-lenses";

interface UpdateInput {
  portfolioId: string;
  lensId: string;
  label?: string;
  description?: string | null;
  color?: string | null;
  isPinned?: boolean;
  assetIds?: string[];
}

export function useUpdateLens() {
  const qc = useQueryClient();
  return useMutation<Lens, Error, UpdateInput>({
    mutationFn: async ({ portfolioId, lensId, ...body }) => {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/lenses/${lensId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update lens");
      }
      return res.json();
    },
    onSuccess: (_, { portfolioId }) => {
      qc.invalidateQueries({ queryKey: ["lenses", portfolioId] });
    },
  });
}
```

- [ ] **Step 5: Find and update all imports**

```bash
grep -rln "use-dashboard-pins\|use-create-dashboard-pin\|use-delete-dashboard-pin" /opt/summa/src
```

For each file in the result:
- Replace `from "@/hooks/use-dashboard-pins"` → `from "@/hooks/use-lenses"`
- Replace `from "@/hooks/use-create-dashboard-pin"` → `from "@/hooks/use-create-lens"`
- Replace `from "@/hooks/use-delete-dashboard-pin"` → `from "@/hooks/use-delete-lens"`
- Replace `useDashboardPins` → `useLenses`
- Replace `useCreateDashboardPin` → `useCreateLens`
- Replace `useDeleteDashboardPin` → `useDeleteLens`
- Replace type `DashboardPin` → `Lens`
- Replace any `pinId:` prop or arg → `lensId:`
- Replace `.label` reads — keep, the field name is unchanged

The `useCreateDashboardPin` mutation took `{ portfolioId, label, assetIds }`. `useCreateLens` takes the same plus optional `description`, `color`, `isPinned` — defaults preserve current behavior.

The `useDeleteDashboardPin` took `{ portfolioId, pinId }`. `useDeleteLens` takes `{ portfolioId, lensId }`. Update call sites accordingly.

- [ ] **Step 6: Delete the old hook files**

```bash
rm /opt/summa/src/hooks/use-dashboard-pins.ts
rm /opt/summa/src/hooks/use-create-dashboard-pin.ts
rm /opt/summa/src/hooks/use-delete-dashboard-pin.ts
```

- [ ] **Step 7: Delete the old API route files**

```bash
rm -r /opt/summa/src/app/api/portfolios/[id]/dashboard-pins
```

- [ ] **Step 8: Type-check the project**

```bash
cd /opt/summa && pnpm tsc --noEmit
```

Expected: no type errors. If there are errors, they will point to forgotten import sites — fix them.

- [ ] **Step 9: Commit**

```bash
git add src/hooks src/app/api src/components
git commit -m "feat(lenses): rename pin hooks/routes to lens, add useUpdateLens"
```

---

## Task 5: Extract `getProviderLabel` to a shared module

**Files:**
- Create: `src/lib/asset-helpers.ts`
- Modify: `src/components/portfolio/account-detail-view.tsx` (remove inline definition + import from new module)

- [ ] **Step 1: Write the test file**

Create `src/lib/__tests__/asset-helpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getProviderLabel } from "@/lib/asset-helpers";

describe("getProviderLabel", () => {
  it("returns Plaid synced for plaid", () => {
    expect(getProviderLabel("plaid")).toBe("Plaid synced");
  });

  it("returns Ticker tracked for ticker", () => {
    expect(getProviderLabel("ticker")).toBe("Ticker tracked");
  });

  it("returns Manual for manual", () => {
    expect(getProviderLabel("manual")).toBe("Manual");
  });

  it("returns the providerType verbatim for unknown values", () => {
    expect(getProviderLabel("simplefin")).toBe("simplefin");
    expect(getProviderLabel("coinbase")).toBe("coinbase");
  });
});
```

- [ ] **Step 2: Run the test — should fail (module missing)**

```bash
cd /opt/summa && pnpm vitest run src/lib/__tests__/asset-helpers.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/asset-helpers'`.

- [ ] **Step 3: Create the module**

Write `src/lib/asset-helpers.ts`:

```typescript
export function getProviderLabel(providerType: string): string {
  switch (providerType) {
    case "plaid":
      return "Plaid synced";
    case "ticker":
      return "Ticker tracked";
    case "manual":
      return "Manual";
    default:
      return providerType;
  }
}
```

- [ ] **Step 4: Run the test — should pass**

```bash
cd /opt/summa && pnpm vitest run src/lib/__tests__/asset-helpers.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Update `account-detail-view.tsx`**

Remove the inline `getProviderLabel` function (lines ~1927-1938 — verify line numbers with `grep -n 'function getProviderLabel' src/components/portfolio/account-detail-view.tsx`). Add an import at the top of the file:

```typescript
import { getProviderLabel } from "@/lib/asset-helpers";
```

Existing call sites (`asset.providerType` arguments) work unchanged.

- [ ] **Step 6: Type-check**

```bash
cd /opt/summa && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/asset-helpers.ts src/lib/__tests__/asset-helpers.test.ts src/components/portfolio/account-detail-view.tsx
git commit -m "refactor: extract getProviderLabel to shared asset-helpers module"
```

---

## Task 6: Lens picker utility (canonical group → asset IDs)

The picker shows canonical groups computed from `getRecapAggregationKey`. When the user saves, we expand checked groups + checked individual assets into a deduped array of asset IDs. This is the pure-function expansion logic.

**Files:**
- Create: `src/lib/lens-utils.ts`
- Create: `src/lib/__tests__/lens-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  buildPickerGroups,
  expandSelection,
  type PickerAsset,
} from "@/lib/lens-utils";

const a = (
  id: string,
  name: string,
  type: string,
  ticker?: string,
  source?: string
): PickerAsset => ({
  id,
  name,
  type,
  currency: "USD",
  currentValueInBase: 1000,
  providerType: "ticker",
  providerConfig: ticker ? { ticker, source } : null,
  parentAssetId: null,
});

describe("buildPickerGroups", () => {
  it("groups crypto assets with the same canonical key", () => {
    const assets = [
      a("1", "BTC (Coinbase)", "crypto", "BTC-USD", "coinbase"),
      a("2", "BTC (Trezor)", "crypto", "bitcoin", "coingecko"),
      a("3", "ETH (Coinbase)", "crypto", "ETH-USD", "coinbase"),
    ];
    const groups = buildPickerGroups(assets);
    const btc = groups.find((g) => g.key === "coin:BTC");
    expect(btc?.assetIds).toEqual(["1", "2"]);
    expect(btc?.totalValue).toBe(2000);
    const eth = groups.find((g) => g.key === "coin:ETH");
    expect(eth?.assetIds).toEqual(["3"]);
  });

  it("groups equities by ticker symbol across brokerages", () => {
    const assets = [
      a("1", "AAPL @ Fidelity", "stock", "AAPL"),
      a("2", "AAPL @ Schwab", "stock", "AAPL"),
      a("3", "MSFT @ Fidelity", "stock", "MSFT"),
    ];
    const groups = buildPickerGroups(assets);
    expect(groups.find((g) => g.key === "equity:AAPL")?.assetIds).toEqual([
      "1",
      "2",
    ]);
    expect(groups.find((g) => g.key === "equity:MSFT")?.assetIds).toEqual([
      "3",
    ]);
  });

  it("falls back to per-asset key for assets with no canonical aggregation", () => {
    const assets = [a("1", "House", "real_estate")];
    const groups = buildPickerGroups(assets);
    expect(groups[0].key).toBe("asset:1");
    expect(groups[0].assetIds).toEqual(["1"]);
  });

  it("excludes group-parent assets (isGroupParent)", () => {
    const assets = [
      {
        ...a("p1", "Fidelity (parent)", "investment"),
        providerConfig: { isGroupParent: true } as Record<string, unknown>,
      },
      a("c1", "AAPL", "stock", "AAPL"),
    ];
    const groups = buildPickerGroups(assets);
    expect(groups.find((g) => g.assetIds.includes("p1"))).toBeUndefined();
    expect(groups.find((g) => g.key === "equity:AAPL")?.assetIds).toEqual([
      "c1",
    ]);
  });
});

describe("expandSelection", () => {
  const assets = [
    a("1", "BTC (Coinbase)", "crypto", "BTC-USD", "coinbase"),
    a("2", "BTC (Trezor)", "crypto", "bitcoin", "coingecko"),
    a("3", "WBTC (Coinbase)", "crypto", "wrapped-bitcoin", "coingecko"),
    a("4", "AAPL", "stock", "AAPL"),
  ];

  it("expands a checked canonical group to its asset IDs", () => {
    const ids = expandSelection(
      { groupKeys: ["coin:BTC"], assetIds: [] },
      assets
    );
    expect(ids.sort()).toEqual(["1", "2"]);
  });

  it("merges multiple groups", () => {
    const ids = expandSelection(
      { groupKeys: ["coin:BTC", "coin:WBTC"], assetIds: [] },
      assets
    );
    expect(ids.sort()).toEqual(["1", "2", "3"]);
  });

  it("merges groups with individual asset picks, deduped", () => {
    const ids = expandSelection(
      { groupKeys: ["coin:BTC"], assetIds: ["1", "4"] },
      assets
    );
    expect(ids.sort()).toEqual(["1", "2", "4"]);
  });

  it("returns an empty array when nothing is selected", () => {
    expect(expandSelection({ groupKeys: [], assetIds: [] }, assets)).toEqual(
      []
    );
  });
});
```

- [ ] **Step 2: Run tests — should fail**

```bash
cd /opt/summa && pnpm vitest run src/lib/__tests__/lens-utils.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement `lens-utils.ts`**

```typescript
import {
  getRecapAggregationKey,
  getAggregationLabel,
  type AggregationKeyInput,
} from "@/lib/recap-utils";

export interface PickerAsset extends AggregationKeyInput {
  currentValueInBase: number;
}

export interface PickerGroup {
  key: string;
  label: string;
  assetIds: string[];
  assets: PickerAsset[];
  totalValue: number;
}

export function buildPickerGroups(assets: PickerAsset[]): PickerGroup[] {
  const byKey = new Map<string, PickerGroup>();

  for (const asset of assets) {
    const key = getRecapAggregationKey(asset);
    if (!key) continue; // group-parent containers and similar — skip

    const existing = byKey.get(key);
    if (existing) {
      existing.assetIds.push(asset.id);
      existing.assets.push(asset);
      existing.totalValue += asset.currentValueInBase;
    } else {
      byKey.set(key, {
        key,
        label: getAggregationLabel(key, asset.name),
        assetIds: [asset.id],
        assets: [asset],
        totalValue: asset.currentValueInBase,
      });
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) => b.totalValue - a.totalValue
  );
}

export interface PickerSelection {
  groupKeys: string[];
  assetIds: string[];
}

export function expandSelection(
  selection: PickerSelection,
  assets: PickerAsset[]
): string[] {
  const groups = buildPickerGroups(assets);
  const groupKeys = new Set(selection.groupKeys);
  const out = new Set<string>(selection.assetIds);

  for (const group of groups) {
    if (groupKeys.has(group.key)) {
      for (const id of group.assetIds) out.add(id);
    }
  }

  return Array.from(out);
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
cd /opt/summa && pnpm vitest run src/lib/__tests__/lens-utils.test.ts
```

Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lens-utils.ts src/lib/__tests__/lens-utils.test.ts
git commit -m "feat(lenses): add picker expansion utility (canonical groups → asset IDs)"
```

---

## Task 7: Lens picker modal component

A modal opened from create / edit flows. Two modes: canonical groups (default) and individual assets (advanced toggle). Search filter at the top.

**Files:**
- Create: `src/components/lenses/lens-picker-modal.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import {
  buildPickerGroups,
  expandSelection,
  type PickerAsset,
  type PickerSelection,
} from "@/lib/lens-utils";

interface LensPickerModalProps {
  open: boolean;
  onClose: () => void;
  assets: PickerAsset[];
  initialAssetIds: string[];
  currency: string;
  btcUsdRate: number | null;
  onSave: (assetIds: string[]) => void;
}

export function LensPickerModal({
  open,
  onClose,
  assets,
  initialAssetIds,
  currency,
  btcUsdRate,
  onSave,
}: LensPickerModalProps) {
  const groups = useMemo(() => buildPickerGroups(assets), [assets]);
  const [advanced, setAdvanced] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Initial selection: figure out which group keys are fully selected (all
  // their members are in initialAssetIds), and which individual assets are
  // selected outside any fully-selected group.
  const initial = useMemo<PickerSelection>(() => {
    const initialSet = new Set(initialAssetIds);
    const groupKeys: string[] = [];
    const individualIds: string[] = [];
    for (const group of groups) {
      const allIn = group.assetIds.every((id) => initialSet.has(id));
      if (allIn && group.assetIds.length > 0) {
        groupKeys.push(group.key);
      } else {
        for (const id of group.assetIds) {
          if (initialSet.has(id)) individualIds.push(id);
        }
      }
    }
    return { groupKeys, assetIds: individualIds };
  }, [groups, initialAssetIds]);

  const [selection, setSelection] = useState<PickerSelection>(initial);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.label.toLowerCase().includes(q) ||
        g.assets.some((a) => a.name.toLowerCase().includes(q))
    );
  }, [groups, search]);

  const toggleGroup = (key: string) => {
    setSelection((s) => {
      const groupKeys = s.groupKeys.includes(key)
        ? s.groupKeys.filter((k) => k !== key)
        : [...s.groupKeys, key];
      return { ...s, groupKeys };
    });
  };

  const toggleAsset = (id: string) => {
    setSelection((s) => {
      const assetIds = s.assetIds.includes(id)
        ? s.assetIds.filter((x) => x !== id)
        : [...s.assetIds, id];
      return { ...s, assetIds };
    });
  };

  const toggleExpanded = (key: string) => {
    setExpanded((e) => {
      const next = new Set(e);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = () => {
    const ids = expandSelection(selection, assets);
    if (ids.length === 0) return;
    onSave(ids);
  };

  const expandedIds = useMemo(
    () => expandSelection(selection, assets),
    [selection, assets]
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select assets</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets..."
              className="pl-8"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={advanced}
              onCheckedChange={setAdvanced}
              aria-label="Advanced mode"
            />
            Advanced
          </label>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {filteredGroups.map((group) => {
            const groupChecked = selection.groupKeys.includes(group.key);
            const isExpanded = expanded.has(group.key) || advanced;
            return (
              <div
                key={group.key}
                className="rounded-md border border-border"
              >
                <div className="flex items-center gap-2 p-2">
                  <Checkbox
                    checked={groupChecked}
                    onCheckedChange={() => toggleGroup(group.key)}
                    aria-label={`Select ${group.label}`}
                  />
                  {advanced || group.assets.length > 1 ? (
                    <button
                      type="button"
                      className="size-5 grid place-items-center text-muted-foreground hover:text-foreground"
                      onClick={() => toggleExpanded(group.key)}
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="size-4" />
                      ) : (
                        <ChevronRightIcon className="size-4" />
                      )}
                    </button>
                  ) : (
                    <span className="size-5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {group.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {group.assets.length} source
                      {group.assets.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <MoneyDisplay
                    amount={group.totalValue}
                    currency={currency}
                    btcUsdRate={btcUsdRate}
                    className="text-sm tabular-nums"
                  />
                </div>

                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 px-2 py-1.5 space-y-1">
                    {group.assets.map((asset) => {
                      const checked =
                        groupChecked || selection.assetIds.includes(asset.id);
                      return (
                        <div
                          key={asset.id}
                          className="flex items-center gap-2 pl-7 py-1"
                        >
                          <Checkbox
                            checked={checked}
                            disabled={groupChecked}
                            onCheckedChange={() => toggleAsset(asset.id)}
                            aria-label={`Select ${asset.name}`}
                          />
                          <p className="flex-1 text-sm truncate">
                            {asset.name}
                          </p>
                          <MoneyDisplay
                            amount={asset.currentValueInBase}
                            currency={currency}
                            btcUsdRate={btcUsdRate}
                            className="text-xs text-muted-foreground tabular-nums"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {filteredGroups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No assets match your search.
            </p>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {expandedIds.length} asset{expandedIds.length === 1 ? "" : "s"}{" "}
            selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={expandedIds.length === 0}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /opt/summa && pnpm tsc --noEmit
```

Expected: no errors. If `Switch` or `Checkbox` is missing from `@/components/ui/`, install via shadcn:

```bash
cd /opt/summa && pnpm dlx shadcn@latest add switch checkbox
```

(Verify by `ls src/components/ui/{switch,checkbox}.tsx` first — they may already exist.)

- [ ] **Step 3: Commit**

```bash
git add src/components/lenses/lens-picker-modal.tsx
git commit -m "feat(lenses): add picker modal with canonical groups + advanced mode"
```

---

## Task 8: `LensHero` — total value + period change

**Files:**
- Create: `src/components/lenses/lens-hero.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { useRecapDrillDown } from "@/hooks/use-recap-drill-down";
import { useDisplayCurrency } from "@/contexts/display-currency-context";
import { getFromDate, type DateRangeKey } from "@/lib/chart-utils";
import { cn } from "@/lib/utils";

const RANGES: DateRangeKey[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];

interface LensHeroProps {
  portfolioId: string;
  assetIds: string[];
  currency: string;
  btcUsdRate: number | null;
  range?: DateRangeKey;
  onRangeChange?: (r: DateRangeKey) => void;
}

export function LensHero({
  portfolioId,
  assetIds,
  currency,
  btcUsdRate,
  range: rangeProp,
  onRangeChange,
}: LensHeroProps) {
  const [internalRange, setInternalRange] = useState<DateRangeKey>("1Y");
  const range = rangeProp ?? internalRange;
  const setRange = onRangeChange ?? setInternalRange;

  const from = getFromDate(range);
  const { data, isLoading } = useRecapDrillDown(portfolioId, assetIds, from);
  const dc = useDisplayCurrency();

  const points = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((pt) => {
      let val = pt.value;
      if (btcUsdRate && dc.displayCurrency !== "USD") {
        val = dc.convert(val, btcUsdRate);
      }
      return val;
    });
  }, [data, btcUsdRate, dc]);

  const latest = points.length > 0 ? points[points.length - 1] : null;
  const earliest = points.length > 1 ? points[0] : null;
  const change = latest != null && earliest != null ? latest - earliest : null;
  const changePct =
    change != null && earliest && earliest !== 0
      ? (change / Math.abs(earliest)) * 100
      : null;

  if (isLoading) {
    return <Skeleton className="h-16 w-64" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        {latest != null ? (
          <>
            <MoneyDisplay
              amount={latest}
              currency={currency}
              btcUsdRate={btcUsdRate}
              className="text-3xl font-semibold tabular-nums"
            />
            {change != null && (
              <span
                className={cn(
                  "text-sm tabular-nums",
                  change > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : change < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                )}
              >
                {change > 0 ? "+" : ""}
                {dc.displayCurrency !== "USD"
                  ? dc.format(change)
                  : `$${change.toFixed(0)}`}
                {changePct != null && (
                  <>
                    {" "}
                    ({changePct > 0 ? "+" : ""}
                    {changePct.toFixed(1)}%)
                  </>
                )}
              </span>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">No data yet.</p>
        )}
      </div>

      <div className="flex items-center gap-1">
        {RANGES.map((r) => (
          <Button
            key={r}
            variant={r === range ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setRange(r)}
          >
            {r}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/lenses/lens-hero.tsx
git commit -m "feat(lenses): add hero component with total + period change"
```

---

## Task 9: `LensChart` — full-width area chart

**Files:**
- Create: `src/components/lenses/lens-chart.tsx`

- [ ] **Step 1: Create the component**

This is essentially the chart half of `recap-drill-down.tsx`, parameterized.

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecapDrillDown } from "@/hooks/use-recap-drill-down";
import { useDisplayCurrency } from "@/contexts/display-currency-context";
import {
  getFromDate,
  formatChartDate,
  formatCompactDisplayCurrency,
  type DateRangeKey,
} from "@/lib/chart-utils";

interface LensChartProps {
  portfolioId: string;
  assetIds: string[];
  currency: string;
  btcUsdRate: number | null;
  range?: DateRangeKey;
}

export function LensChart({
  portfolioId,
  assetIds,
  btcUsdRate,
  range = "1Y",
}: LensChartProps) {
  const from = getFromDate(range);
  const { data, isLoading } = useRecapDrillDown(portfolioId, assetIds, from);
  const dc = useDisplayCurrency();

  const chartData = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((pt) => {
      let val = pt.value;
      if (btcUsdRate && dc.displayCurrency !== "USD") {
        val = dc.convert(val, btcUsdRate);
      }
      return { date: pt.date, value: val };
    });
  }, [data, btcUsdRate, dc]);

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (chartData.length <= 1) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
        Not enough data to display a chart.
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="lensGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v: number) =>
              formatCompactDisplayCurrency(
                v,
                dc.displayCurrency,
                dc.formatCompact
              )
            }
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip
            content={({ active, payload, label: tipLabel }) => {
              if (!active || !payload?.[0]) return null;
              const v = payload[0].value as number;
              return (
                <div className="rounded-lg bg-popover px-3 py-2 text-sm ring-1 ring-border shadow-md">
                  <p className="text-muted-foreground text-xs">
                    {formatChartDate(tipLabel as string)}
                  </p>
                  <p className="font-medium tabular-nums">
                    {dc.displayCurrency !== "USD"
                      ? dc.format(v)
                      : `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--chart-1)"
            fill="url(#lensGrad)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/lenses/lens-chart.tsx
git commit -m "feat(lenses): add full-width chart component"
```

---

## Task 10: `LensBreakdownTable` — per-asset rows

**Files:**
- Create: `src/components/lenses/lens-breakdown-table.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import Link from "next/link";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { getProviderLabel } from "@/lib/asset-helpers";
import type { Asset } from "@/hooks/use-portfolio";
import type { Lens } from "@/hooks/use-lenses";

interface LensBreakdownTableProps {
  portfolioId: string;
  lens: Lens;
  assets: Asset[];
  currency: string;
  btcUsdRate: number | null;
}

export function LensBreakdownTable({
  portfolioId,
  assets,
  currency,
  btcUsdRate,
}: LensBreakdownTableProps) {
  // Convert each asset's currentValue to base currency. The portfolio loader
  // already provides values in the asset's own currency, so use the precomputed
  // valueInBase if available; otherwise fall back to currentValue.
  const rows = assets.map((a) => {
    const value = Number(a.currentValue ?? 0);
    return {
      id: a.id,
      name: a.name,
      provider: getProviderLabel(a.providerType),
      value,
    };
  });

  const total = rows.reduce((s, r) => s + r.value, 0);
  const sorted = [...rows].sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-card border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-4 py-2">Asset</th>
            <th className="text-left font-medium px-4 py-2">Source</th>
            <th className="text-right font-medium px-4 py-2">Value</th>
            <th className="text-right font-medium px-4 py-2">% of lens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((row) => {
            const pct = total > 0 ? (row.value / total) * 100 : 0;
            return (
              <tr
                key={row.id}
                className="hover:bg-muted/30 cursor-pointer"
                onClick={() => {
                  window.location.href = `/portfolio/${portfolioId}/asset/${row.id}`;
                }}
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/portfolio/${portfolioId}/asset/${row.id}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {row.provider}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  <MoneyDisplay
                    amount={row.value}
                    currency={currency}
                    btcUsdRate={btcUsdRate}
                  />
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {pct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/lenses/lens-breakdown-table.tsx
git commit -m "feat(lenses): add asset breakdown table"
```

---

## Task 11: `LensEditPanel` — side panel editor

A slide-in panel from the right with the lens's editable fields. Uses shadcn's `Sheet` component.

**Files:**
- Create: `src/components/lenses/lens-edit-panel.tsx`

- [ ] **Step 1: Verify the Sheet primitive exists**

```bash
ls /opt/summa/src/components/ui/sheet.tsx
```

If missing:

```bash
cd /opt/summa && pnpm dlx shadcn@latest add sheet
```

- [ ] **Step 2: Create the component**

```tsx
"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useUpdateLens } from "@/hooks/use-update-lens";
import { LensPickerModal } from "./lens-picker-modal";
import type { Lens } from "@/hooks/use-lenses";
import type { Portfolio, Asset } from "@/hooks/use-portfolio";
import type { PickerAsset } from "@/lib/lens-utils";

const COLOR_PALETTE = [
  "#ef4444", // red
  "#f59e0b", // amber
  "#eab308", // yellow
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

interface LensEditPanelProps {
  lens: Lens;
  portfolio: Portfolio;
  allAssets: Asset[];
  onClose: () => void;
}

export function LensEditPanel({
  lens,
  portfolio,
  allAssets,
  onClose,
}: LensEditPanelProps) {
  const [name, setName] = useState(lens.label);
  const [description, setDescription] = useState(lens.description ?? "");
  const [color, setColor] = useState<string | null>(lens.color);
  const [isPinned, setIsPinned] = useState(lens.isPinned);
  const [assetIds, setAssetIds] = useState(lens.assetIds);
  const [pickerOpen, setPickerOpen] = useState(false);

  const updateLens = useUpdateLens();

  const pickerAssets: PickerAsset[] = allAssets.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    providerType: a.providerType,
    providerConfig: (a.providerConfig as Record<string, unknown>) ?? null,
    parentAssetId: a.parentAssetId,
    currentValueInBase: Number(a.currentValue ?? 0),
  }));

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateLens.mutate(
      {
        portfolioId: lens.portfolioId,
        lensId: lens.id,
        label: trimmed,
        description: description.trim() || null,
        color,
        isPinned,
        assetIds: assetIds.length > 0 ? assetIds : undefined,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Edit lens</SheetTitle>
            <SheetDescription>
              Update name, color, dashboard placement, or asset selection.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto py-4">
            <div className="space-y-2">
              <Label htmlFor="lens-name">Name</Label>
              <Input
                id="lens-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lens-description">Description</Label>
              <Textarea
                id="lens-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  aria-label="No color"
                  className={`size-7 rounded-full border-2 ${
                    color === null ? "border-foreground" : "border-border"
                  }`}
                  style={{
                    background:
                      "repeating-linear-gradient(45deg, transparent 0 4px, var(--muted-foreground) 4px 5px)",
                  }}
                />
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Color ${c}`}
                    className={`size-7 rounded-full border-2 ${
                      color === c ? "border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Pinned to dashboard</p>
                <p className="text-xs text-muted-foreground">
                  Show this lens as a card on the portfolio dashboard.
                </p>
              </div>
              <Switch
                checked={isPinned}
                onCheckedChange={setIsPinned}
                aria-label="Pinned to dashboard"
              />
            </div>

            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-sm font-medium">Assets</p>
              <p className="text-xs text-muted-foreground">
                {assetIds.length} asset{assetIds.length === 1 ? "" : "s"}{" "}
                selected
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPickerOpen(true)}
              >
                Edit assets
              </Button>
            </div>
          </div>

          <SheetFooter className="flex gap-2">
            <Button variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || updateLens.isPending}
              className="flex-1"
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <LensPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        assets={pickerAssets}
        initialAssetIds={assetIds}
        currency={portfolio.currency}
        btcUsdRate={portfolio.btcUsdRate}
        onSave={(ids) => {
          setAssetIds(ids);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
```

- [ ] **Step 3: Verify shadcn primitives**

```bash
ls /opt/summa/src/components/ui/{sheet,textarea,label}.tsx
```

If any are missing, `pnpm dlx shadcn@latest add <name>`.

- [ ] **Step 4: Type-check**

```bash
cd /opt/summa && pnpm tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/lenses/lens-edit-panel.tsx
git commit -m "feat(lenses): add edit side panel with color palette"
```

---

## Task 12: Lens detail page route + container

Now that all subcomponents exist, wire them up in the page route. This commit will compile cleanly because every imported child is already on disk.

**Files:**
- Create: `src/app/(app)/portfolio/[portfolioId]/lens/[lensId]/page.tsx`
- Create: `src/components/lenses/lens-detail-view.tsx`

- [ ] **Step 1: Create the page route**

```tsx
import { LensDetailView } from "@/components/lenses/lens-detail-view";

export default async function LensDetailPage({
  params,
}: {
  params: Promise<{ portfolioId: string; lensId: string }>;
}) {
  const { portfolioId, lensId } = await params;
  return <LensDetailView portfolioId={portfolioId} lensId={lensId} />;
}
```

- [ ] **Step 2: Create the detail view**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, PencilIcon, Trash2Icon, PinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLenses } from "@/hooks/use-lenses";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useUpdateLens } from "@/hooks/use-update-lens";
import { useDeleteLens } from "@/hooks/use-delete-lens";
import { LensHero } from "./lens-hero";
import { LensChart } from "./lens-chart";
import { LensBreakdownTable } from "./lens-breakdown-table";
import { LensEditPanel } from "./lens-edit-panel";
import type { DateRangeKey } from "@/lib/chart-utils";

interface LensDetailViewProps {
  portfolioId: string;
  lensId: string;
}

export function LensDetailView({ portfolioId, lensId }: LensDetailViewProps) {
  const router = useRouter();
  const { data: lenses, isLoading: lensesLoading } = useLenses(portfolioId);
  const { data: portfolio, isLoading: portfolioLoading } =
    usePortfolio(portfolioId);
  const updateLens = useUpdateLens();
  const deleteLens = useDeleteLens();
  const [editing, setEditing] = useState(false);
  const [range, setRange] = useState<DateRangeKey>("1Y");

  if (lensesLoading || portfolioLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const lens = lenses?.find((l) => l.id === lensId);
  if (!lens || !portfolio) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Lens not found.</p>
        <Link
          href={`/portfolio/${portfolioId}`}
          className="text-sm underline mt-2 inline-block"
        >
          Back to portfolio
        </Link>
      </div>
    );
  }

  const togglePinned = () => {
    updateLens.mutate({
      portfolioId,
      lensId,
      isPinned: !lens.isPinned,
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete lens "${lens.label}"?`)) return;
    deleteLens.mutate(
      { portfolioId, lensId },
      {
        onSuccess: () => router.push(`/portfolio/${portfolioId}`),
      }
    );
  };

  const allAssets = portfolio.sheets.flatMap((sheet) =>
    sheet.sections.flatMap((section) =>
      section.assets.flatMap((a) => [a, ...(a.children ?? [])])
    )
  );
  const lensAssets = allAssets.filter((a) => lens.assetIds.includes(a.id));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/portfolio/${portfolioId}`}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Back to portfolio"
          >
            <ArrowLeftIcon className="size-5" />
          </Link>
          {lens.color && (
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: lens.color }}
              aria-hidden
            />
          )}
          <h1 className="text-2xl font-semibold tracking-tight truncate">
            {lens.label}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={lens.isPinned ? "default" : "outline"}
            size="sm"
            onClick={togglePinned}
            disabled={updateLens.isPending}
          >
            <PinIcon className="size-3.5 mr-1" />
            {lens.isPinned ? "Pinned" : "Pin to dashboard"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon className="size-3.5 mr-1" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleteLens.isPending}
            className="text-destructive hover:text-destructive"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      </div>

      {lens.description && (
        <p className="text-sm text-muted-foreground -mt-3">
          {lens.description}
        </p>
      )}

      {lens.assetIds.length === 0 ? (
        <div className="rounded-card border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            This lens has no assets. Add some to start tracking.
          </p>
          <Button className="mt-4" onClick={() => setEditing(true)}>
            Add assets
          </Button>
        </div>
      ) : (
        <>
          <LensHero
            portfolioId={portfolioId}
            assetIds={lens.assetIds}
            currency={portfolio.currency}
            btcUsdRate={portfolio.btcUsdRate}
            range={range}
            onRangeChange={setRange}
          />
          <LensChart
            portfolioId={portfolioId}
            assetIds={lens.assetIds}
            currency={portfolio.currency}
            btcUsdRate={portfolio.btcUsdRate}
            range={range}
          />
          <LensBreakdownTable
            portfolioId={portfolioId}
            lens={lens}
            assets={lensAssets}
            currency={portfolio.currency}
            btcUsdRate={portfolio.btcUsdRate}
          />
        </>
      )}

      {editing && (
        <LensEditPanel
          lens={lens}
          portfolio={portfolio}
          allAssets={allAssets}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd /opt/summa && pnpm tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/portfolio src/components/lenses/lens-detail-view.tsx
git commit -m "feat(lenses): add lens detail page wiring hero + chart + breakdown + edit panel"
```

---

## Task 13: Rename pin components → lens components

Replace `DashboardPinCard` and `DashboardPinsSection` with `LensCard` and `LensesSection`. The card now navigates to the lens detail page; the X button toggles `is_pinned` rather than deleting.

**Files:**
- Create: `src/components/lenses/lens-card.tsx`
- Create: `src/components/lenses/lenses-section.tsx`
- Delete: `src/components/dashboard/pins/dashboard-pin-card.tsx`
- Delete: `src/components/dashboard/pins/dashboard-pins-section.tsx`
- Modify: `src/components/dashboard/dashboard-view.tsx`

- [ ] **Step 1: Create `lens-card.tsx`**

```tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PinOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { useRecapDrillDown } from "@/hooks/use-recap-drill-down";
import { useUpdateLens } from "@/hooks/use-update-lens";
import { useDisplayCurrency } from "@/contexts/display-currency-context";
import { getFromDate, formatChartDate } from "@/lib/chart-utils";
import { cn } from "@/lib/utils";
import type { Lens } from "@/hooks/use-lenses";

interface LensCardProps {
  lens: Lens;
  currency: string;
  btcUsdRate: number | null;
}

export function LensCard({ lens, currency, btcUsdRate }: LensCardProps) {
  const from = getFromDate("1Y");
  const { data, isLoading } = useRecapDrillDown(
    lens.portfolioId,
    lens.assetIds,
    from
  );
  const dc = useDisplayCurrency();
  const updateLens = useUpdateLens();

  const chartData = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((pt) => {
      let val = pt.value;
      if (btcUsdRate && dc.displayCurrency !== "USD") {
        val = dc.convert(val, btcUsdRate);
      }
      return { date: pt.date, value: val };
    });
  }, [data, btcUsdRate, dc]);

  const latest =
    chartData.length > 0 ? chartData[chartData.length - 1].value : null;
  const earliest = chartData.length > 1 ? chartData[0].value : null;
  const change = latest != null && earliest != null ? latest - earliest : null;
  const changePct =
    change != null && earliest && earliest !== 0
      ? (change / Math.abs(earliest)) * 100
      : null;

  const handleUnpin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateLens.mutate({
      portfolioId: lens.portfolioId,
      lensId: lens.id,
      isPinned: false,
    });
  };

  return (
    <Link
      href={`/portfolio/${lens.portfolioId}/lens/${lens.id}`}
      className="group relative rounded-card border border-border bg-card p-4 space-y-2 block hover:border-foreground/20 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          {lens.color && (
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ backgroundColor: lens.color }}
              aria-hidden
            />
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-medium truncate">{lens.label}</h3>
            {latest != null ? (
              <div className="mt-1 flex items-baseline gap-2">
                <MoneyDisplay
                  amount={latest}
                  currency={currency}
                  btcUsdRate={btcUsdRate}
                  className="text-lg font-semibold"
                />
                {change != null && (
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      change > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : change < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                    )}
                  >
                    {change > 0 ? "+" : ""}
                    {changePct != null ? `${changePct.toFixed(1)}%` : ""}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">No data yet</p>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleUnpin}
          disabled={updateLens.isPending}
          aria-label="Unpin from dashboard"
        >
          <PinOffIcon className="size-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : chartData.length > 1 ? (
        <div className="h-24 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient
                  id={`lens-grad-${lens.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={lens.color ?? "var(--chart-1)"}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={lens.color ?? "var(--chart-1)"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                content={({ active, payload, label: tipLabel }) => {
                  if (!active || !payload?.[0]) return null;
                  const v = payload[0].value as number;
                  return (
                    <div className="rounded-lg bg-popover px-2 py-1 text-xs ring-1 ring-border shadow-md">
                      <p className="text-muted-foreground">
                        {formatChartDate(tipLabel as string)}
                      </p>
                      <p className="font-medium tabular-nums">
                        {dc.displayCurrency !== "USD"
                          ? dc.format(v)
                          : `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={lens.color ?? "var(--chart-1)"}
                fill={`url(#lens-grad-${lens.id})`}
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
          Not enough data
        </div>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Create `lenses-section.tsx`**

```tsx
"use client";

import Link from "next/link";
import { ArrowRightIcon, PinIcon } from "lucide-react";
import { useLenses } from "@/hooks/use-lenses";
import { LensCard } from "./lens-card";

interface LensesSectionProps {
  portfolioId: string;
  currency: string;
  btcUsdRate: number | null;
}

export function LensesSection({
  portfolioId,
  currency,
  btcUsdRate,
}: LensesSectionProps) {
  const { data: lenses, isLoading } = useLenses(portfolioId);

  if (isLoading) return null;
  const visible = lenses?.filter((l) => l.isPinned) ?? [];
  if (visible.length === 0) return null;

  return (
    <section className="md:rounded-card md:border md:border-border md:bg-card/50 md:p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Lenses
          </p>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <PinIcon className="size-4" />
            Pinned views
          </h2>
        </div>
        <Link
          href="/recap"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Add more from Recap
          <ArrowRightIcon className="size-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((lens) => (
          <LensCard
            key={lens.id}
            lens={lens}
            currency={currency}
            btcUsdRate={btcUsdRate}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Update `dashboard-view.tsx`**

In `src/components/dashboard/dashboard-view.tsx`:
- Replace the import: `import { DashboardPinsSection } from "./pins/dashboard-pins-section";` → `import { LensesSection } from "@/components/lenses/lenses-section";`
- Replace the JSX usage: `<DashboardPinsSection ... />` → `<LensesSection ... />` (props are identical: `portfolioId`, `currency`, `btcUsdRate`)

- [ ] **Step 4: Delete old files**

```bash
rm /opt/summa/src/components/dashboard/pins/dashboard-pin-card.tsx
rm /opt/summa/src/components/dashboard/pins/dashboard-pins-section.tsx
rmdir /opt/summa/src/components/dashboard/pins
```

- [ ] **Step 5: Type-check**

```bash
cd /opt/summa && pnpm tsc --noEmit
```

Fix any remaining import references that the earlier rename missed.

- [ ] **Step 6: Commit**

```bash
git add src/components/lenses src/components/dashboard
git commit -m "feat(lenses): replace pin card/section with lens card/section, link to detail page"
```

---

## Task 14: Update recap drill-down "Add to Dashboard" → creates pinned lens

The `recap-drill-down.tsx` modal already calls `useCreateDashboardPin` (now `useCreateLens`) and `useDashboardPins` (now `useLenses`). The hook rename in Task 5 already updated this file. Verify the flow still works and refine the matching logic to filter by lens (rather than pin), and the button label.

**Files:**
- Modify: `src/components/recap/recap-drill-down.tsx`

- [ ] **Step 1: Verify earlier rename caught this file**

```bash
grep -n "useDashboardPin\|useCreateDashboardPin\|useDeleteDashboardPin\|matchingPin" /opt/summa/src/components/recap/recap-drill-down.tsx
```

Expected (after Task 5): no matches for `useDashboardPin*`. The variable name `matchingPin` may still be present from the original code — rename it to `matchingLens` and adjust references.

- [ ] **Step 2: Apply minor cleanup**

In `recap-drill-down.tsx`:
- Rename local `matchingPin` → `matchingLens`
- Rename `pins` → `lenses` (variable from `useLenses`)
- The `togglePin` → `toggleLensPin` (function)
- The button text "Add to dashboard" / "Pinned" — keep as-is (still accurate)
- The `useDeleteLens` call should now be `useUpdateLens` setting `isPinned: false` instead of deleting (preserving the lens):

```tsx
const updateLens = useUpdateLens();

const toggleLensPin = () => {
  if (matchingLens) {
    updateLens.mutate({
      portfolioId,
      lensId: matchingLens.id,
      isPinned: !matchingLens.isPinned,
    });
  } else {
    createLens.mutate({
      portfolioId,
      label,
      assetIds,
      isPinned: true,
    });
  }
};
```

Add `import { useUpdateLens } from "@/hooks/use-update-lens";` and remove the `useDeleteLens` import if no longer used.

The matching predicate should also consider `isPinned`:

```tsx
const matchingLens = useMemo(() => {
  if (!lenses) return null;
  const sorted = [...assetIds].sort().join(",");
  return (
    lenses.find(
      (l) => [...l.assetIds].sort().join(",") === sorted
    ) ?? null
  );
}, [lenses, assetIds]);

// Show "Pinned" only if matching lens exists AND is pinned
const isPinned = matchingLens?.isPinned ?? false;
```

Update the JSX to use `isPinned` for the visual state:

```tsx
<Button
  variant={isPinned ? "default" : "outline"}
  ...
>
  {isPinned ? <><CheckIcon /> Pinned</> : <><PinIcon /> Add to dashboard</>}
</Button>
```

- [ ] **Step 3: Type-check**

```bash
cd /opt/summa && pnpm tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/recap/recap-drill-down.tsx
git commit -m "feat(lenses): drill-down 'Add to dashboard' creates a pinned lens, toggles is_pinned on existing"
```

---

## Task 15: End-to-end smoke test

Run the dev server and walk through the user flows from the spec.

**Files:** none.

- [ ] **Step 1: Start the dev server**

```bash
cd /opt/summa && pnpm dev
```

- [ ] **Step 2: Verify migration journal is OK**

```bash
docker exec summa-db psql -U summa -d summa -c "\d lenses"
```

Expected: table exists with all columns (`id, portfolio_id, label, description, color, is_pinned, asset_ids, sort_order, created_at`).

- [ ] **Step 3: Existing pins still load**

Open the dashboard. The previously-pinned charts (now lenses) appear under the "Lenses → Pinned views" section. Each card shows label + total + mini chart.

- [ ] **Step 4: Card navigation**

Click a lens card. Browser navigates to `/portfolio/<pid>/lens/<lid>`. Lens detail page renders: header with name + Pin / Edit / Delete buttons, hero with total + period change, full-width chart, breakdown table with one row per asset.

- [ ] **Step 5: Edit lens**

Click Edit. Side panel slides in from the right. Change the name, pick a color, toggle pin off. Click Save. Sheet closes. Header reflects new name + color. Card no longer appears on the dashboard. Re-pin via the header button — appears again.

- [ ] **Step 6: Picker — canonical groups**

Click Edit → Edit assets. Picker opens. Default mode shows canonical groups. Search for "Bitcoin", check the BTC group (and WBTC, BITU if present). Save. Lens chart updates.

- [ ] **Step 7: Picker — advanced mode**

Reopen the picker. Toggle Advanced. Each group expands to its individual assets. Uncheck one (e.g., a specific BTC source). Save. Lens reflects the narrower selection.

- [ ] **Step 8: Create from recap drill-down**

Navigate to `/recap`. Drill into a group (click a row to open the modal). Click "Add to dashboard". A lens is created with `is_pinned: true`. Verify on the dashboard that it appears, and at `/portfolio/<pid>/lens/<lid>` the detail page works.

- [ ] **Step 9: Delete lens**

On the lens detail page, click the trash button. Confirm. Browser redirects to `/portfolio/<pid>`. Card no longer appears on dashboard.

- [ ] **Step 10: Soft-deleted asset doesn't appear**

Pick an asset that's in a lens. Archive it (delete it via the existing UI — soft delete). Reload the lens detail page. The asset is no longer in the breakdown table. The chart still renders (without that asset's contribution to recent dates). Lens stays put.

- [ ] **Step 11: Empty lens**

Create a lens with one asset, then archive that asset. Reload the lens. Empty-state placeholder shows with "Add assets" button. Click it — picker opens.

- [ ] **Step 12: Commit (no code change)**

No commit unless smoke testing surfaced bugs. If bugs were found, fix them in their own commits referencing this task.

---

## Self-Review Checklist

Skim the spec sections; each maps to a task here:

| Spec Section | Tasks |
|---|---|
| Goal | 1-16 (whole plan) |
| Relationship to dashboard_pins | 2 |
| Data Model | 2 |
| Referential integrity (soft delete) | 3 (GET filter), 16 step 10 (smoke) |
| API Surface | 3, 5 |
| POST/PATCH request shapes | 3, 5 |
| Picker UX | 7, 8 |
| Lens Detail Page | 9-12 |
| Edit Side Panel | 13 |
| Dashboard Integration | 14 |
| Migration & Prerequisite | 1, 2 |
| Testing — Unit | 6 (asset-helpers), 7 (lens-utils) |
| Testing — Integration | 16 |
| Testing — Manual smoke | 16 |

All sections covered. No placeholders. Type signatures referenced consistently across tasks (`Lens`, `PickerAsset`, `PickerGroup`, `PickerSelection`).
