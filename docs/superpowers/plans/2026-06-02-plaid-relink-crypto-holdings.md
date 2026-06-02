# Plaid Relink + Crypto Holdings Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Plaid connection adopt existing manual/ticker asset rows in place (preserving history), driving a crypto account's *quantity* from Plaid holdings while keeping the asset's own live price for value.

**Architecture:** Mirror the existing SimpleFIN relink (`PATCH /api/plaid/accounts/[id]`). The correctness-critical decisions (crypto-vs-cash takeover, holdings parsing, value math) are extracted into **pure, unit-tested helpers**; the route, sync, and cron call them. For crypto accounts, sync writes `quantity` (not USD); the price-refresh cron is widened to include `plaid`+`crypto` rows so `currentValue = quantity × price` stays fresh.

**Tech Stack:** Next.js App Router, Drizzle ORM (Postgres), Plaid Node SDK, TanStack Query, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-02-plaid-relink-crypto-holdings-design.md`

**Test command:** `pnpm vitest run <path>` (no `test` npm script exists; vitest is the runner). `@/` resolves to `src/`.

**Before starting:** this worktree has no deps installed yet. Run `pnpm install` once.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/providers/plaid.ts` | Plaid SDK wrappers | Modify — add `parseCryptoHoldings`, `getCryptoHoldings`, `computeCryptoValue`, types |
| `src/lib/plaid-relink.ts` | Pure takeover/sync-patch decision logic | Create |
| `src/lib/__tests__/plaid-relink.test.ts` | Unit tests for the pure logic | Create |
| `src/app/api/plaid/accounts/[id]/route.ts` | Relink/unlink PATCH endpoint | Create |
| `src/hooks/use-plaid.ts` | React Query hooks | Modify — add `useRelinkPlaidAccount` |
| `src/components/portfolio/plaid-connect-dialog.tsx` | Plaid connect UI | Modify — add "Link to existing asset" picker |
| `src/app/api/plaid/connections/[id]/sync/route.ts` | Manual sync endpoint | Modify — crypto quantity branch |
| `src/lib/cron.ts` | Cron sync + price refresh | Modify — crypto quantity branch; widen price-refresh select |
| `src/lib/__tests__/cron-price-refresh.test.ts` | Existing cron test | Modify — add plaid-crypto selection case |

No DB migration is required (code-only).

---

## Task 1: Holdings parsing + value math (pure helpers in plaid.ts)

**Files:**
- Modify: `src/lib/providers/plaid.ts` (append after `getBalances`, ~line 168)
- Test: `src/lib/__tests__/plaid-holdings.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/plaid-holdings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCryptoHoldings, computeCryptoValue } from "@/lib/providers/plaid";

describe("parseCryptoHoldings", () => {
  const securities = [
    { security_id: "sec_btc", type: "cryptocurrency", ticker_symbol: "BTC", name: "Bitcoin" },
    { security_id: "sec_aapl", type: "equity", ticker_symbol: "AAPL", name: "Apple" },
  ];

  it("maps a crypto holding to its account_id and quantity", () => {
    const holdings = [
      { account_id: "acct_btc", security_id: "sec_btc", quantity: 0.24071935, institution_price: 66936.15 },
    ];
    const result = parseCryptoHoldings(holdings, securities);
    expect(result.get("acct_btc")).toEqual({
      plaidAccountId: "acct_btc",
      quantity: 0.24071935,
      institutionPrice: 66936.15,
    });
  });

  it("ignores non-cryptocurrency securities", () => {
    const holdings = [
      { account_id: "acct_eq", security_id: "sec_aapl", quantity: 10, institution_price: 200 },
    ];
    expect(parseCryptoHoldings(holdings, securities).size).toBe(0);
  });

  it("keeps the largest holding when an account has more than one crypto holding", () => {
    const holdings = [
      { account_id: "acct_btc", security_id: "sec_btc", quantity: 0.1, institution_price: 1 },
      { account_id: "acct_btc", security_id: "sec_btc", quantity: 0.24, institution_price: 1 },
    ];
    expect(parseCryptoHoldings(holdings, securities).get("acct_btc")?.quantity).toBe(0.24);
  });
});

describe("computeCryptoValue", () => {
  it("multiplies quantity by price and rounds to 2 decimals", () => {
    expect(computeCryptoValue(0.24071935, 66936.15)).toBe("16112.83");
  });
  it("returns null when price is missing", () => {
    expect(computeCryptoValue(0.24, null)).toBeNull();
  });
  it("returns null when quantity is missing", () => {
    expect(computeCryptoValue(null, 66936.15)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/plaid-holdings.test.ts`
Expected: FAIL — `parseCryptoHoldings`/`computeCryptoValue` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/providers/plaid.ts`:

```ts
export interface PlaidCryptoHolding {
  plaidAccountId: string;
  quantity: number;
  institutionPrice: number | null;
}

interface RawHolding {
  account_id: string;
  security_id: string;
  quantity: number;
  institution_price?: number | null;
}
interface RawSecurity {
  security_id: string;
  type?: string | null;
}

// Pure: reduce Plaid holdings + securities to one crypto holding per account
// (largest quantity wins — River exposes a single BTC holding per account).
export function parseCryptoHoldings(
  holdings: RawHolding[],
  securities: RawSecurity[]
): Map<string, PlaidCryptoHolding> {
  const secType = new Map(securities.map((s) => [s.security_id, s.type ?? null]));
  const result = new Map<string, PlaidCryptoHolding>();
  for (const h of holdings) {
    if (secType.get(h.security_id) !== "cryptocurrency") continue;
    const existing = result.get(h.account_id);
    if (existing && existing.quantity >= h.quantity) continue;
    result.set(h.account_id, {
      plaidAccountId: h.account_id,
      quantity: h.quantity,
      institutionPrice: h.institution_price ?? null,
    });
  }
  return result;
}

// Pure: value = quantity × price, 2dp; null if either input missing.
export function computeCryptoValue(
  quantity: number | null,
  price: number | null
): string | null {
  if (quantity == null || price == null) return null;
  return (quantity * price).toFixed(2);
}

// Fetches crypto holdings for a connection. Returns an empty map (and logs)
// if the Investments product is unavailable — callers must NOT fall back to
// USD for crypto rows; they simply leave quantity unchanged.
export async function getCryptoHoldings(
  accessToken: string
): Promise<Map<string, PlaidCryptoHolding>> {
  const plaid = getPlaidClient();
  try {
    const response = await plaid.investmentsHoldingsGet({ access_token: accessToken });
    return parseCryptoHoldings(
      response.data.holdings as RawHolding[],
      response.data.securities as RawSecurity[]
    );
  } catch (err: any) {
    console.warn(
      "[plaid] investmentsHoldingsGet failed:",
      err?.response?.data?.error_code ?? err?.message
    );
    return new Map();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/plaid-holdings.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/plaid.ts src/lib/__tests__/plaid-holdings.test.ts
git commit -m "feat(plaid): crypto holdings parsing + value helpers"
```

---

## Task 2: Pure takeover decision (`computePlaidTakeover`)

This is the correctness heart: given a Plaid account, a target asset, and an optional holding quantity, produce the `assets` update patch — crypto sets quantity (not USD) and **merges** providerConfig so `source`/`ticker` survive; cash sets USD balance.

**Files:**
- Create: `src/lib/plaid-relink.ts`
- Test: `src/lib/__tests__/plaid-relink.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/plaid-relink.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computePlaidTakeover } from "@/lib/plaid-relink";

const cryptoAccount = {
  connectionId: "conn1",
  plaidAccountId: "acct_btc",
  type: "investment",
  currentBalance: "16112.83",
};
const cashAccount = {
  connectionId: "conn1",
  plaidAccountId: "acct_usd",
  type: "depository",
  currentBalance: "1730.41",
};

describe("computePlaidTakeover — crypto", () => {
  const targetCrypto = {
    type: "crypto",
    currentPrice: "66936.15",
    quantity: "0.23788197",
    providerConfig: { source: "coingecko", ticker: "bitcoin", exchange: "crypto" },
  };

  it("sets quantity from the holding and merges providerConfig (keeps source/ticker)", () => {
    const patch = computePlaidTakeover(cryptoAccount, targetCrypto, 0.24071935);
    expect(patch.providerType).toBe("plaid");
    expect(patch.providerConfig).toEqual({
      source: "coingecko",
      ticker: "bitcoin",
      exchange: "crypto",
      connectionId: "conn1",
      plaidAccountId: "acct_btc",
    });
    expect(patch.quantity).toBe("0.24071935");
    // value = 0.24071935 * 66936.15 = 16112.83 (the asset's own price, not USD balance)
    expect(patch.currentValue).toBe("16112.83");
  });

  it("does NOT overwrite quantity when the holding is missing", () => {
    const patch = computePlaidTakeover(cryptoAccount, targetCrypto, null);
    expect(patch.quantity).toBeUndefined();
    expect(patch.providerType).toBe("plaid");
  });
});

describe("computePlaidTakeover — cash", () => {
  it("sets USD currentValue from the balance and a clean providerConfig", () => {
    const patch = computePlaidTakeover(cashAccount, { type: "cash", currentPrice: null, quantity: null, providerConfig: {} }, null);
    expect(patch.providerType).toBe("plaid");
    expect(patch.providerConfig).toEqual({ connectionId: "conn1", plaidAccountId: "acct_usd" });
    expect(patch.currentValue).toBe("1730.41");
    expect(patch.quantity).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/plaid-relink.test.ts`
Expected: FAIL — module `@/lib/plaid-relink` not found.

- [ ] **Step 3: Implement `computePlaidTakeover`**

Create `src/lib/plaid-relink.ts`:

```ts
import { computeCryptoValue } from "@/lib/providers/plaid";

type ProviderConfig = Record<string, unknown>;

export interface TakeoverPlaidAccount {
  connectionId: string;
  plaidAccountId: string;
  type: string;
  currentBalance: string | null;
}

export interface TakeoverTargetAsset {
  type: string;
  currentPrice: string | null;
  quantity: string | null;
  providerConfig: ProviderConfig | null;
}

export interface AssetTakeoverPatch {
  providerType: "plaid";
  providerConfig: ProviderConfig;
  currentValue?: string;
  quantity?: string;
}

// Decide how a relink takes over the target asset. Crypto: drive quantity from
// the holding, value = quantity × the asset's own price, and MERGE providerConfig
// so the pricing source/ticker survive. Cash/other: USD balance, fresh config.
export function computePlaidTakeover(
  account: TakeoverPlaidAccount,
  target: TakeoverTargetAsset,
  holdingQuantity: number | null
): AssetTakeoverPatch {
  const isCrypto = account.type === "investment" && target.type === "crypto";

  if (isCrypto) {
    const quantity =
      holdingQuantity ?? (target.quantity != null ? Number(target.quantity) : null);
    const price = target.currentPrice != null ? Number(target.currentPrice) : null;
    const value = computeCryptoValue(quantity, price);
    return {
      providerType: "plaid",
      providerConfig: {
        ...(target.providerConfig ?? {}),
        connectionId: account.connectionId,
        plaidAccountId: account.plaidAccountId,
      },
      ...(holdingQuantity != null && { quantity: holdingQuantity.toString() }),
      ...(value != null && { currentValue: value }),
    };
  }

  const balance = account.currentBalance != null ? Number(account.currentBalance) : 0;
  return {
    providerType: "plaid",
    providerConfig: {
      connectionId: account.connectionId,
      plaidAccountId: account.plaidAccountId,
    },
    currentValue: Math.abs(balance).toFixed(2),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/plaid-relink.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaid-relink.ts src/lib/__tests__/plaid-relink.test.ts
git commit -m "feat(plaid): pure takeover decision for relink (crypto vs cash)"
```

---

## Task 3: Relink/unlink endpoint

**Files:**
- Create: `src/app/api/plaid/accounts/[id]/route.ts`

- [ ] **Step 1: Implement the endpoint**

Create `src/app/api/plaid/accounts/[id]/route.ts`:

```ts
import { db } from "@/lib/db";
import { assets, plaidAccounts, plaidConnections } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import { decrypt } from "@/lib/encryption";
import { getCryptoHoldings } from "@/lib/providers/plaid";
import { computePlaidTakeover } from "@/lib/plaid-relink";
import { z } from "zod";

const relinkBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("unlink") }),
  z.object({ action: z.literal("relink"), assetId: z.string().uuid() }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "account ID");

    const body = relinkBody.parse(await request.json());

    // Find the Plaid account + owning connection, verify ownership
    const [row] = await db
      .select({ account: plaidAccounts, connection: plaidConnections })
      .from(plaidAccounts)
      .innerJoin(
        plaidConnections,
        eq(plaidAccounts.connectionId, plaidConnections.id)
      )
      .where(eq(plaidAccounts.id, id))
      .limit(1);

    if (!row || row.connection.userId !== user.id) {
      return errorResponse("Account not found", 404);
    }
    const plaidAccount = row.account;

    if (body.action === "unlink") {
      if (plaidAccount.assetId) {
        await db
          .update(assets)
          .set({ providerType: "manual", providerConfig: {}, updatedAt: new Date() })
          .where(eq(assets.id, plaidAccount.assetId));
      }
      await db
        .update(plaidAccounts)
        .set({ assetId: null, isTracked: false, updatedAt: new Date() })
        .where(eq(plaidAccounts.id, id));
      return jsonResponse({ success: true });
    }

    // action === "relink"
    const targetAssetId = body.assetId;
    const [targetAsset] = await db
      .select()
      .from(assets)
      .where(eq(assets.id, targetAssetId))
      .limit(1);
    if (!targetAsset) return errorResponse("Target asset not found", 404);

    // Target must not already be linked to a different tracked Plaid account
    const [existingLink] = await db
      .select({ id: plaidAccounts.id })
      .from(plaidAccounts)
      .where(
        and(
          eq(plaidAccounts.assetId, targetAssetId),
          eq(plaidAccounts.isTracked, true)
        )
      )
      .limit(1);
    if (existingLink && existingLink.id !== id) {
      return errorResponse("Asset is already linked to a Plaid account", 400);
    }

    // If this Plaid account was linked to a different asset, revert that one
    if (plaidAccount.assetId && plaidAccount.assetId !== targetAssetId) {
      await db
        .update(assets)
        .set({ providerType: "manual", providerConfig: {}, updatedAt: new Date() })
        .where(eq(assets.id, plaidAccount.assetId));
    }

    // For a crypto takeover, pull the coin quantity from holdings
    let holdingQuantity: number | null = null;
    if (plaidAccount.type === "investment" && targetAsset.type === "crypto") {
      const accessToken = decrypt(row.connection.accessTokenEnc);
      const holdings = await getCryptoHoldings(accessToken);
      holdingQuantity = holdings.get(plaidAccount.plaidAccountId)?.quantity ?? null;
    }

    const patch = computePlaidTakeover(
      {
        connectionId: plaidAccount.connectionId,
        plaidAccountId: plaidAccount.plaidAccountId,
        type: plaidAccount.type,
        currentBalance: plaidAccount.currentBalance,
      },
      {
        type: targetAsset.type,
        currentPrice: targetAsset.currentPrice,
        quantity: targetAsset.quantity,
        providerConfig: targetAsset.providerConfig ?? {},
      },
      holdingQuantity
    );

    await db
      .update(assets)
      .set({ ...patch, lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(assets.id, targetAssetId));

    await db
      .update(plaidAccounts)
      .set({ assetId: targetAssetId, isTracked: true, updatedAt: new Date() })
      .where(eq(plaidAccounts.id, id));

    return jsonResponse({ success: true, assetId: targetAssetId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request body", 400);
    }
    return handleError(error);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in the new file. (If `assets.providerConfig` typing rejects the spread, cast the `set` payload `as typeof assets.$inferInsert` — but the existing SimpleFIN route assigns a plain object, so the plain object should typecheck.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/plaid/accounts/[id]/route.ts
git commit -m "feat(plaid): relink/unlink endpoint (mirror SimpleFIN, crypto-aware)"
```

---

## Task 4: `useRelinkPlaidAccount` hook

**Files:**
- Modify: `src/hooks/use-plaid.ts` (append before the final export)

- [ ] **Step 1: Add the hook**

Append to `src/hooks/use-plaid.ts`:

```ts
export function useRelinkPlaidAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      accountId: string; // plaidAccounts.id
      action: "unlink" | "relink";
      assetId?: string;
    }) => {
      const res = await fetch(`/api/plaid/accounts/${data.accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          data.action === "unlink"
            ? { action: "unlink" }
            : { action: "relink", assetId: data.assetId }
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to update account link");
      }
      return body;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["plaid-connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success(
        variables.action === "unlink" ? "Account unlinked" : "Account relinked"
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update account link"
      );
    },
  });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

```bash
git add src/hooks/use-plaid.ts
git commit -m "feat(plaid): useRelinkPlaidAccount hook"
```

---

## Task 5: "Link to existing asset" picker UI

Add an inline asset picker to each untracked Plaid account row in `ConnectionCard`, mirroring the SimpleFIN panel's `<select>`. The existing "Link" button (creates a *new* asset via `AccountSelector`) stays; we add a second control, "Link to existing".

**Files:**
- Modify: `src/components/portfolio/plaid-connect-dialog.tsx`

- [ ] **Step 1: Import the hook**

In the `use-plaid` import block (lines 32–43), add `useRelinkPlaidAccount`:

```ts
  useDisconnectPlaid,
  useRelinkPlaidAccount,
  type PlaidConnection,
```

- [ ] **Step 2: Build a flat asset list from `sheets`**

In `ConnectionCard` (after `const [relinkAccountId, ...]` at line 303), add the relink mutation, the inline-picker state, and a flattened asset list (sheets → sections → assets):

```ts
  const relinkMutation = useRelinkPlaidAccount();
  const [linkExistingId, setLinkExistingId] = useState<string | null>(null);
  const allAssets = sheets.flatMap((sheet) =>
    sheet.sections.flatMap((section) =>
      section.assets.map((a) => ({
        id: a.id,
        name: a.name,
        sectionName: section.name,
      }))
    )
  );
```

> Note: `Sheet`/`Section` come from `@/hooks/use-portfolio`; `section.assets` carries `{ id, name }`. If `Section` lacks `assets` in the type, import the portfolio via `usePortfolio(portfolioId)` and flatten `portfolio.sheets` exactly as `simplefin-connect-panel.tsx` does (lines 253–265) instead of the `sheets` prop.

- [ ] **Step 3: Render the picker per untracked account**

In the account map (lines 385–411), replace the untracked branch so an untracked account shows both "Link" (new) and "Link existing" (relink). Replace the `a.isTracked ? (...) : relinkAccountId === ... ` block with:

```tsx
              {a.isTracked ? (
                <span className="tabular-nums">Tracked</span>
              ) : (
                <div className="flex items-center gap-1">
                  {relinkAccountId === a.plaidAccountId ? (
                    <Button variant="ghost" size="xs" onClick={() => setRelinkAccountId(null)}>
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setRelinkAccountId(a.plaidAccountId)}
                    >
                      Link new
                    </Button>
                  )}
                  {linkExistingId === a.id ? (
                    <select
                      className="z-10 w-56 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-md"
                      defaultValue=""
                      autoFocus
                      onBlur={() => setLinkExistingId(null)}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        relinkMutation.mutate(
                          { accountId: a.id, action: "relink", assetId: e.target.value },
                          { onSuccess: () => setLinkExistingId(null) }
                        );
                      }}
                    >
                      <option value="" disabled>
                        Select an asset…
                      </option>
                      {allAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name} ({asset.sectionName})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Button variant="ghost" size="xs" onClick={() => setLinkExistingId(a.id)}>
                      Link existing
                    </Button>
                  )}
                </div>
              )}
```

- [ ] **Step 4: Verify it renders**

Run: `pnpm dev`, open the Bank Connections dialog (the toolbar "Connect" entry that sets `plaidDialogOpen`). For the River connection's two untracked accounts, confirm both "Link new" and "Link existing" appear, and "Link existing" shows a dropdown of portfolio assets.

- [ ] **Step 5: Commit**

```bash
git add src/components/portfolio/plaid-connect-dialog.tsx
git commit -m "feat(plaid): link-to-existing-asset picker in connect dialog"
```

---

## Task 6: Crypto-aware sync (manual endpoint + cron)

Today both sync paths set `currentValue = USD balance` for every linked account. Add a crypto branch: drive `quantity` from holdings, value = `quantity × asset.currentPrice`.

**Files:**
- Modify: `src/app/api/plaid/connections/[id]/sync/route.ts`
- Modify: `src/lib/cron.ts` (`refreshPlaidBalances`, ~lines 304–332)

- [ ] **Step 1: Sync endpoint — fetch holdings once, branch per account**

In `src/app/api/plaid/connections/[id]/sync/route.ts`:

Add imports (line 6 area):
```ts
import { getBalances, getCryptoHoldings, computeCryptoValue } from "@/lib/providers/plaid";
```

After `const balances = await getBalances(accessToken);` (line 28) add:
```ts
    const cryptoHoldings = await getCryptoHoldings(accessToken);
```

Replace the asset-update block (lines 43–58) with:
```ts
      if (updated?.assetId) {
        const holding = cryptoHoldings.get(balance.accountId);
        if (holding) {
          // Crypto: drive quantity from the holding; value = quantity × the
          // asset's own price (kept fresh by the price-refresh cron).
          const [asset] = await db
            .select({ currentPrice: assets.currentPrice })
            .from(assets)
            .where(eq(assets.id, updated.assetId))
            .limit(1);
          const value = computeCryptoValue(
            holding.quantity,
            asset?.currentPrice != null ? Number(asset.currentPrice) : null
          );
          await db
            .update(assets)
            .set({
              quantity: holding.quantity.toString(),
              ...(value != null && { currentValue: value }),
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(assets.id, updated.assetId));
          updatedCount++;
        } else if (balance.currentBalance != null) {
          const limitPatch =
            balance.limit != null ? { creditLimit: balance.limit } : null;
          await db
            .update(assets)
            .set({
              currentValue: Math.abs(balance.currentBalance).toFixed(2),
              ...(limitPatch && {
                providerConfig: sql`coalesce(${assets.providerConfig}, '{}'::jsonb) || ${JSON.stringify(limitPatch)}::jsonb`,
              }),
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(assets.id, updated.assetId));
          updatedCount++;
        }
      }
```

- [ ] **Step 2: Cron — same branch in `refreshPlaidBalances`**

In `src/lib/cron.ts`: change the import (line 17) to include the new helpers:
```ts
import { isPlaidConfigured, getBalances, getCryptoHoldings, computeCryptoValue } from "@/lib/providers/plaid";
```

After `const balances = await getBalances(accessToken);` (line 302) add:
```ts
        const cryptoHoldings = await getCryptoHoldings(accessToken);
```

Replace the asset-update block (lines 316–331) with the same crypto/else branch as Step 1 (identical body — `cryptoHoldings.get(balance.accountId)`, set `quantity` + `computeCryptoValue`, else the existing USD path).

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (`assets` and `eq`/`sql` are already imported in both files.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/plaid/connections/[id]/sync/route.ts src/lib/cron.ts
git commit -m "feat(plaid): sync drives crypto quantity from holdings"
```

---

## Task 7: Widen price refresh to plaid-crypto rows

After relink the BTC row is `providerType = "plaid"`. The price-refresh select only takes `ticker` rows, so widen it; the existing grouping already keys off `providerConfig.source`/`.ticker` (preserved by the relink merge) and computes `value = quantity × price`.

**Files:**
- Modify: `src/lib/cron.ts` (`refreshPrices`, lines 56–59)
- Test: `src/lib/__tests__/cron-price-refresh.test.ts` (add a case)

- [ ] **Step 1: Add a failing test case**

In `src/lib/__tests__/cron-price-refresh.test.ts`, add a test asserting a `plaid`+`crypto` asset carrying `{source:"coingecko", ticker:"bitcoin"}` and a quantity gets its `currentValue` recomputed (`quantity × price`). Follow the file's existing `vi.hoisted`/`vi.mock` setup: have `mockSelectWhere` resolve to the plaid-crypto asset, `mockGetCoinGeckoBatchPrices` return `new Map([["bitcoin", { price: 70000 }]])`, run `refreshPrices({ sources: ["coingecko"] })`, and assert `mocks.mockSet` was called with `currentValue: "16850.06"` for quantity `0.24071935` (0.24071935 × 70000 = 16850.3545 → check your exact expected with the quantity you set; use `0.2` × `70000` = `"14000.00"` for a round assertion). Mirror the assertion style already in the file.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/cron-price-refresh.test.ts`
Expected: FAIL — the plaid-crypto asset isn't selected yet, so `mockSet` isn't called for it.

- [ ] **Step 3: Widen the select**

In `src/lib/cron.ts`, replace lines 56–59:

```ts
    const tickerAssets = await db
      .select()
      .from(assets)
      .where(
        or(
          eq(assets.providerType, "ticker"),
          and(eq(assets.providerType, "plaid"), eq(assets.type, "crypto"))
        )
      );
```

(`or`, `and`, `eq` are already imported at line 11. Rows without a `providerConfig.ticker` are still skipped by the existing `if (!ticker) continue` guards, so non-crypto plaid rows are unaffected.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/cron-price-refresh.test.ts`
Expected: PASS (existing cases + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cron.ts src/lib/__tests__/cron-price-refresh.test.ts
git commit -m "feat(plaid): price-refresh includes plaid crypto rows"
```

---

## Task 8: Full verification + River migration

- [ ] **Step 1: Run the whole test suite + typecheck + lint**

```bash
pnpm vitest run
pnpm exec tsc --noEmit
pnpm lint
```
Expected: all green.

- [ ] **Step 2: Integration check against the real River connection (dev)**

With `pnpm dev` running and the River connection already present (two untracked accounts):

1. In the Bank Connections dialog, on **River USD Account** click "Link existing" → choose the manual `Riv` (cash) row. Confirm toast "Account relinked".
2. On **River Bitcoin Account** click "Link existing" → choose the `Riv` (bitcoin, ticker) row.
3. Verify in the DB the BTC row kept its pricing source and gained the Plaid link, quantity came from holdings, and history is intact (same asset id):

```bash
docker exec summa-postgres psql -U summa -d summa -P pager=off -x -c \
  "SELECT name, provider_type, quantity, current_price, current_value, provider_config FROM assets WHERE id='7f95bfd5-3363-4484-a016-ad3be9647ec3';"
```
Expected: `provider_type=plaid`; `quantity≈0.24071935`; `provider_config` contains BOTH `source/ticker/exchange` AND `connectionId/plaidAccountId`.

```bash
docker exec summa-postgres psql -U summa -d summa -P pager=off -c \
  "SELECT count(*) FROM asset_snapshots WHERE asset_id='7f95bfd5-3363-4484-a016-ad3be9647ec3';"
```
Expected: the pre-existing snapshot count is unchanged (history preserved).

4. Cash row check:
```bash
docker exec summa-postgres psql -U summa -d summa -P pager=off -c \
  "SELECT name, provider_type, current_value FROM assets WHERE id='879a7939-8f3f-4fb3-a500-e572857941ed';"
```
Expected: `provider_type=plaid`, `current_value=1730.41`.

5. Trigger a sync (the dialog's per-connection sync button) and a price refresh; confirm the BTC row's `current_value` tracks `quantity × CoinGecko price` and `quantity` only changes on real holding changes.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin worktree-plaid-relink
```

- [ ] **Step 4: Open a PR** (only if the user asks — see Execution Handoff)

---

## Self-Review

**Spec coverage:**
- Relink endpoint (relink/unlink, crypto vs cash takeover, providerConfig merge) → Tasks 2, 3 ✓
- Holdings fetch helper → Task 1 ✓
- Sync drives crypto quantity → Task 6 ✓
- Price refresh includes plaid-crypto → Task 7 ✓
- Snapshots unchanged → (no task needed; `currentValue` stays canonical) ✓
- Hook + picker UI → Tasks 4, 5 ✓
- River migration steps → Task 8 ✓
- Edge cases (holdings fail → quantity unchanged; already-linked → 400; unlink → manual) → Tasks 1 (empty map), 2 (null quantity), 3 (guards) ✓

**Type consistency:** `computeCryptoValue(quantity, price)`, `getCryptoHoldings` → `Map<plaidAccountId, PlaidCryptoHolding>`, `computePlaidTakeover(account, target, holdingQuantity)` → `AssetTakeoverPatch` are used with matching signatures across Tasks 1, 2, 3, 6. `useRelinkPlaidAccount({accountId, action, assetId})` matches the endpoint body and the UI call sites (Tasks 4, 5, 3).

**Placeholder scan:** Task 7 Step 1 asks the implementer to set a concrete quantity/price and assert the exact product — flagged inline with a round-number example to remove ambiguity. No other placeholders.
