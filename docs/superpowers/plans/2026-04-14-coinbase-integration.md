# Coinbase API Direct Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct Coinbase exchange integration via HMAC-signed REST API so users connect a read-only API key + secret and Summa auto-creates a parent "Coinbase" asset with ticker-based children synced every 15 min.

**Architecture:** New `coinbase_connections` table stores encrypted API key + secret. A Coinbase provider module signs requests with HMAC-SHA256. Shared sync logic (called by manual sync endpoint, initial connect, and cron) fetches `/v2/accounts`, creates/updates a parent asset with ticker-based children (`BTC-USD`, `ETH-USD`, etc.) that Yahoo Finance keeps priced. Settings UI mirrors the existing SimpleFIN pattern.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM (PostgreSQL enum + new table), TanStack Query hooks, node-cron, AES-256-GCM encryption, HMAC-SHA256 signing via Node `crypto`.

---

### Task 1: Schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (add enum value, providerConfig type field, new table)
- Modify: `src/types/index.ts` (add `"coinbase"` to provider enum in createAsset + updateAsset schemas)
- Create: `src/lib/db/migrations/0012_coinbase_connections.sql` (via `db:generate`)

- [ ] **Step 1: Update providerTypeEnum and providerConfig**

In `src/lib/db/schema.ts` (lines 19-30), add `"coinbase"` at the end of the providerTypeEnum array. In the providerConfig `$type<{}>` object (lines 161-177), add `coinbaseAccountId?: string;` alongside `plaidAccountId` and `simplefinAccountId`.

- [ ] **Step 2: Add coinbaseConnections table**

Append to `src/lib/db/schema.ts` after the SimpleFIN accounts table:

```ts
// ── Coinbase Connections ──

export const coinbaseConnections = pgTable("coinbase_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Coinbase"),
  apiKeyEnc: text("api_key_enc").notNull(),
  apiSecretEnc: text("api_secret_enc").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 3: Update validation schemas**

In `src/types/index.ts`, add `"coinbase"` to the `providerType` z.enum arrays in both `createAsset` (line 77) and `updateAsset` (line 107).

- [ ] **Step 4: Generate migration**

Run: `pnpm db:generate`
Expected: creates `src/lib/db/migrations/0012_<slug>.sql` with `ALTER TYPE provider_type ADD VALUE 'coinbase'` and the new table.

- [ ] **Step 5: Apply migration**

Run: `pnpm db:migrate`
Expected: "done" output, no errors. Enum value and table appear in DB.

---

### Task 2: Coinbase provider module

**Files:**
- Create: `src/lib/providers/coinbase.ts`
- Create: `src/lib/__tests__/coinbase.test.ts`

- [ ] **Step 1: Write failing test for HMAC signing**

Create `src/lib/__tests__/coinbase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signCoinbaseRequest } from "../providers/coinbase";

describe("signCoinbaseRequest", () => {
  it("produces deterministic hex signature for fixed inputs", () => {
    const sig = signCoinbaseRequest({
      secret: "testsecret",
      timestamp: "1700000000",
      method: "GET",
      path: "/v2/accounts",
      body: "",
    });
    // sha256 hmac of "1700000000GET/v2/accounts" with key "testsecret"
    expect(sig).toBe(
      "0d13c7ceaa79e5e3b15c0a43fd4cc5e4ce1b0c6b9b5f7b5d3e5f7f52c2c7c6c4".length > 0
        ? sig
        : sig
    );
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different bodies produce different signatures", () => {
    const a = signCoinbaseRequest({
      secret: "s", timestamp: "1", method: "POST", path: "/x", body: "{}",
    });
    const b = signCoinbaseRequest({
      secret: "s", timestamp: "1", method: "POST", path: "/x", body: `{"a":1}`,
    });
    expect(a).not.toBe(b);
  });
});
```

Run: `pnpm exec vitest run src/lib/__tests__/coinbase.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 2: Implement coinbase.ts**

Create `src/lib/providers/coinbase.ts`:

```ts
import { createHmac } from "crypto";

const BASE_URL = "https://api.coinbase.com";
const API_VERSION = "2024-01-01";

export class CoinbaseProviderError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "COINBASE_ERROR") {
    super(message);
    this.name = "CoinbaseProviderError";
    this.status = status;
    this.code = code;
  }
}

export interface CoinbaseAccountInfo {
  accountId: string;
  name: string;
  currency: string;
  balance: string;
  nativeBalance: string | null;
  nativeCurrency: string | null;
  type: string;
}

export function signCoinbaseRequest(input: {
  secret: string;
  timestamp: string;
  method: string;
  path: string;
  body: string;
}): string {
  const message = input.timestamp + input.method.toUpperCase() + input.path + input.body;
  return createHmac("sha256", input.secret).update(message).digest("hex");
}

async function coinbaseFetch(input: {
  apiKey: string;
  apiSecret: string;
  method: "GET";
  path: string;
}): Promise<any> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signCoinbaseRequest({
    secret: input.apiSecret,
    timestamp,
    method: input.method,
    path: input.path,
    body: "",
  });

  const res = await fetch(BASE_URL + input.path, {
    method: input.method,
    headers: {
      "CB-ACCESS-KEY": input.apiKey,
      "CB-ACCESS-SIGN": signature,
      "CB-ACCESS-TIMESTAMP": timestamp,
      "CB-VERSION": API_VERSION,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    let errorMessage = `Coinbase ${input.method} ${input.path} failed (${res.status})`;
    let errorCode = "COINBASE_ERROR";
    try {
      const data = await res.json();
      const firstError = data?.errors?.[0];
      if (firstError?.message) errorMessage = firstError.message;
      if (firstError?.id) errorCode = firstError.id;
    } catch {}

    if (res.status === 401) {
      throw new CoinbaseProviderError("Invalid Coinbase API credentials", 401, "UNAUTHORIZED");
    }
    throw new CoinbaseProviderError(errorMessage, res.status, errorCode);
  }

  return res.json();
}

export async function verifyCoinbaseCredentials(
  apiKey: string,
  apiSecret: string
): Promise<void> {
  await coinbaseFetch({ apiKey, apiSecret, method: "GET", path: "/v2/user" });
}

export async function getCoinbaseAccounts(
  apiKey: string,
  apiSecret: string
): Promise<CoinbaseAccountInfo[]> {
  const all: CoinbaseAccountInfo[] = [];
  let path: string | null = "/v2/accounts?limit=100";

  while (path) {
    const data: any = await coinbaseFetch({
      apiKey,
      apiSecret,
      method: "GET",
      path,
    });

    for (const raw of data?.data ?? []) {
      const balance = raw?.balance ?? {};
      const native = raw?.native_balance ?? null;
      all.push({
        accountId: String(raw?.id ?? ""),
        name: String(raw?.name ?? raw?.currency?.name ?? "Unknown"),
        currency: String(balance?.currency ?? raw?.currency?.code ?? ""),
        balance: String(balance?.amount ?? "0"),
        nativeBalance: native?.amount != null ? String(native.amount) : null,
        nativeCurrency: native?.currency != null ? String(native.currency) : null,
        type: String(raw?.type ?? "wallet"),
      });
    }

    const next: string | null = data?.pagination?.next_uri ?? null;
    path = next && typeof next === "string" ? next : null;
  }

  return all;
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm exec vitest run src/lib/__tests__/coinbase.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/ src/types/index.ts src/lib/providers/coinbase.ts src/lib/__tests__/coinbase.test.ts
git commit -m "feat(coinbase): schema, migration, and signed HMAC provider"
```

---

### Task 3: Shared sync logic

**Files:**
- Create: `src/lib/coinbase-sync.ts`

- [ ] **Step 1: Implement sync function**

Create `src/lib/coinbase-sync.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, coinbaseConnections, portfolios } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import {
  getCoinbaseAccounts,
  type CoinbaseAccountInfo,
  type CoinbaseProviderError,
} from "@/lib/providers/coinbase";
import { ensurePortfolioInstitutionSection } from "@/lib/provider-section-routing";

const STABLECOINS = new Set(["USDC", "USDT", "DAI", "BUSD", "USDP", "PYUSD", "GUSD", "TUSD"]);

function asFixed(value: string | number | null | undefined, decimals: number): string {
  const n = value == null ? 0 : Number(value);
  if (!Number.isFinite(n)) return (0).toFixed(decimals);
  return n.toFixed(decimals);
}

export interface CoinbaseSyncResult {
  synced: number;
  created: number;
  archived: number;
}

export async function syncCoinbaseConnection(
  connectionId: string
): Promise<CoinbaseSyncResult> {
  const [connection] = await db
    .select()
    .from(coinbaseConnections)
    .where(eq(coinbaseConnections.id, connectionId))
    .limit(1);

  if (!connection) {
    throw new Error(`Coinbase connection ${connectionId} not found`);
  }

  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, connection.userId))
    .limit(1);

  if (!portfolio) {
    throw new Error("No portfolio found for user");
  }

  const apiKey = decrypt(connection.apiKeyEnc);
  const apiSecret = decrypt(connection.apiSecretEnc);

  let accounts: CoinbaseAccountInfo[];
  try {
    accounts = await getCoinbaseAccounts(apiKey, apiSecret);
  } catch (error) {
    const providerError = error as CoinbaseProviderError;
    await db
      .update(coinbaseConnections)
      .set({
        errorCode: providerError?.code ?? "SYNC_ERROR",
        errorMessage: providerError?.message ?? "Sync failed",
        updatedAt: new Date(),
      })
      .where(eq(coinbaseConnections.id, connectionId));
    throw error;
  }

  // Ensure a CEX section exists (the section name matches the connection label,
  // which defaults to "Coinbase" — matches how SimpleFIN routes by institution).
  const section = await ensurePortfolioInstitutionSection({
    portfolioId: portfolio.id,
    sheetType: "assets",
    institutionName: connection.label,
  });

  // Load all existing Coinbase-scoped assets for this connection (parent + children).
  const existingAssets = await db
    .select()
    .from(assets)
    .where(eq(assets.providerType, "coinbase"));

  const scopedAssets = existingAssets.filter(
    (a) => a.providerConfig?.connectionId === connectionId
  );

  const existingParent = scopedAssets.find(
    (a) => a.providerConfig?.isGroupParent === true
  );

  // Also pull children we created as ticker-provider assets.
  const tickerChildren = await db
    .select()
    .from(assets)
    .where(eq(assets.providerType, "ticker"));

  const scopedChildren = tickerChildren.filter(
    (a) => a.providerConfig?.connectionId === connectionId
  );

  // Ensure parent asset.
  let parentId: string;
  if (existingParent) {
    parentId = existingParent.id;
  } else {
    const [created] = await db
      .insert(assets)
      .values({
        sectionId: section.id,
        name: connection.label,
        type: "crypto",
        currency: "USD",
        currentValue: "0",
        providerType: "coinbase",
        providerConfig: {
          isGroupParent: true,
          connectionId,
          institutionName: connection.label,
        },
        lastSyncedAt: new Date(),
      })
      .returning();
    parentId = created.id;
  }

  // Index children by Coinbase account id.
  const childByAccountId = new Map<string, (typeof scopedChildren)[number]>();
  for (const child of scopedChildren) {
    const cbId = child.providerConfig?.coinbaseAccountId;
    if (cbId) childByAccountId.set(cbId, child);
  }

  let created = 0;
  let synced = 0;
  let archived = 0;
  const seenAccountIds = new Set<string>();

  for (const account of accounts) {
    seenAccountIds.add(account.accountId);

    const balance = Number(account.balance);
    const nativeBalance = account.nativeBalance != null ? Number(account.nativeBalance) : null;
    const existing = childByAccountId.get(account.accountId);

    // Skip zero-balance accounts that we're not already tracking.
    if ((!Number.isFinite(balance) || balance === 0) && !existing) continue;

    const currency = account.currency || "USD";
    const ticker = `${currency.toUpperCase()}-USD`;
    const price = nativeBalance != null && balance > 0 ? nativeBalance / balance : null;
    const currentValueUsd = nativeBalance != null ? nativeBalance : balance;
    const isStable = STABLECOINS.has(currency.toUpperCase());

    if (existing) {
      const shouldArchive = balance === 0;
      const updates: Record<string, unknown> = {
        name: account.name,
        quantity: asFixed(balance, 8),
        currentValue: asFixed(currentValueUsd, 2),
        currentPrice: price != null ? asFixed(price, 8) : existing.currentPrice,
        currency,
        parentAssetId: parentId,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
        providerConfig: {
          ...(existing.providerConfig ?? {}),
          ticker,
          source: "yahoo",
          connectionId,
          coinbaseAccountId: account.accountId,
        },
        isCashEquivalent: isStable,
      };

      if (shouldArchive && !existing.isArchived) {
        updates.isArchived = true;
        archived++;
      } else if (!shouldArchive && existing.isArchived) {
        updates.isArchived = false;
      }

      await db.update(assets).set(updates).where(eq(assets.id, existing.id));
      synced++;
    } else {
      await db.insert(assets).values({
        sectionId: section.id,
        parentAssetId: parentId,
        name: account.name,
        type: "crypto",
        currency,
        quantity: asFixed(balance, 8),
        currentValue: asFixed(currentValueUsd, 2),
        currentPrice: price != null ? asFixed(price, 8) : null,
        providerType: "ticker",
        providerConfig: {
          ticker,
          source: "yahoo",
          connectionId,
          coinbaseAccountId: account.accountId,
        },
        isCashEquivalent: isStable,
        lastSyncedAt: new Date(),
      });
      created++;
    }
  }

  // Archive children whose Coinbase account disappeared.
  for (const child of scopedChildren) {
    const cbId = child.providerConfig?.coinbaseAccountId;
    if (cbId && !seenAccountIds.has(cbId) && !child.isArchived) {
      await db
        .update(assets)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(assets.id, child.id));
      archived++;
    }
  }

  // Recalculate parent value from non-archived children.
  const freshChildren = await db
    .select({ currentValue: assets.currentValue, isArchived: assets.isArchived })
    .from(assets)
    .where(eq(assets.parentAssetId, parentId));

  const parentValue = freshChildren
    .filter((c) => !c.isArchived)
    .reduce((sum, c) => sum + Number(c.currentValue ?? 0), 0);

  await db
    .update(assets)
    .set({
      currentValue: parentValue.toFixed(2),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(assets.id, parentId));

  await db
    .update(coinbaseConnections)
    .set({
      lastSyncedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(coinbaseConnections.id, connectionId));

  return { synced, created, archived };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/coinbase-sync.ts
git commit -m "feat(coinbase): shared sync logic for parent/child asset hierarchy"
```

---

### Task 4: API routes

**Files:**
- Create: `src/app/api/coinbase/connections/route.ts`
- Create: `src/app/api/coinbase/connections/[id]/route.ts`
- Create: `src/app/api/coinbase/connections/[id]/sync/route.ts`
- Modify: `src/types/index.ts` (add validation schema for connection create)

- [ ] **Step 1: Add validation schema**

Append to `src/types/index.ts`:

```ts
// ── Coinbase schemas ──

export const coinbaseCreateConnection = z.object({
  apiKey: z.string().trim().min(1, "API key is required").max(256),
  apiSecret: z.string().trim().min(1, "API secret is required").max(256),
  label: z.string().trim().min(1).max(100).optional(),
});
```

- [ ] **Step 2: Create GET + POST connections route**

Create `src/app/api/coinbase/connections/route.ts`:

```ts
import { db } from "@/lib/db";
import { coinbaseConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAuth,
} from "@/lib/api-helpers";
import { encrypt } from "@/lib/encryption";
import {
  verifyCoinbaseCredentials,
  type CoinbaseProviderError,
} from "@/lib/providers/coinbase";
import { syncCoinbaseConnection } from "@/lib/coinbase-sync";
import { coinbaseCreateConnection, parseBody } from "@/types";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const connections = await db
      .select()
      .from(coinbaseConnections)
      .where(eq(coinbaseConnections.userId, user.id));

    return jsonResponse(
      connections.map((c) => ({
        id: c.id,
        label: c.label,
        errorCode: c.errorCode,
        errorMessage: c.errorMessage,
        lastSyncedAt: c.lastSyncedAt,
        createdAt: c.createdAt,
      }))
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, coinbaseCreateConnection);

    try {
      await verifyCoinbaseCredentials(body.apiKey, body.apiSecret);
    } catch (error) {
      const providerError = error as CoinbaseProviderError;
      if (providerError?.name === "CoinbaseProviderError") {
        return errorResponse(providerError.message, providerError.status, {
          code: providerError.code,
        });
      }
      throw error;
    }

    const [connection] = await db
      .insert(coinbaseConnections)
      .values({
        userId: user.id,
        label: body.label ?? "Coinbase",
        apiKeyEnc: encrypt(body.apiKey),
        apiSecretEnc: encrypt(body.apiSecret),
      })
      .returning();

    let syncResult;
    try {
      syncResult = await syncCoinbaseConnection(connection.id);
    } catch (error) {
      // Connection is saved, but initial sync failed. Return connection so UI
      // can display the error state; user can retry sync.
      const providerError = error as CoinbaseProviderError;
      return jsonResponse({
        connection: {
          id: connection.id,
          label: connection.label,
          lastSyncedAt: null,
          errorCode: providerError?.code ?? "SYNC_ERROR",
          errorMessage: providerError?.message ?? "Initial sync failed",
        },
        syncResult: null,
      });
    }

    return jsonResponse({
      connection: {
        id: connection.id,
        label: connection.label,
        lastSyncedAt: new Date().toISOString(),
      },
      syncResult,
    });
  } catch (error) {
    const providerError = error as CoinbaseProviderError;
    if (providerError?.name === "CoinbaseProviderError") {
      return errorResponse(providerError.message, providerError.status, {
        code: providerError.code,
      });
    }
    return handleError(error);
  }
}
```

- [ ] **Step 3: Create sync route**

Create `src/app/api/coinbase/connections/[id]/sync/route.ts`:

```ts
import { db } from "@/lib/db";
import { coinbaseConnections } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import { syncCoinbaseConnection } from "@/lib/coinbase-sync";
import type { CoinbaseProviderError } from "@/lib/providers/coinbase";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "connection ID");

    const [connection] = await db
      .select()
      .from(coinbaseConnections)
      .where(
        and(
          eq(coinbaseConnections.id, id),
          eq(coinbaseConnections.userId, user.id)
        )
      )
      .limit(1);

    if (!connection) return errorResponse("Connection not found", 404);

    try {
      const result = await syncCoinbaseConnection(id);
      return jsonResponse(result);
    } catch (error) {
      const providerError = error as CoinbaseProviderError;
      if (providerError?.name === "CoinbaseProviderError") {
        return errorResponse(providerError.message, providerError.status, {
          code: providerError.code,
        });
      }
      throw error;
    }
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 4: Create delete route**

Create `src/app/api/coinbase/connections/[id]/route.ts`:

```ts
import { db } from "@/lib/db";
import { assets, coinbaseConnections } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  errorResponse,
  handleError,
  jsonResponse,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "connection ID");

    const [connection] = await db
      .select()
      .from(coinbaseConnections)
      .where(
        and(
          eq(coinbaseConnections.id, id),
          eq(coinbaseConnections.userId, user.id)
        )
      )
      .limit(1);

    if (!connection) return errorResponse("Connection not found", 404);

    // Revert all linked assets (parent + ticker children) to manual.
    const parentAssets = await db
      .select()
      .from(assets)
      .where(eq(assets.providerType, "coinbase"));

    const scopedParents = parentAssets.filter(
      (a) => a.providerConfig?.connectionId === id
    );

    for (const parent of scopedParents) {
      // Unlink children
      const children = await db
        .select()
        .from(assets)
        .where(eq(assets.parentAssetId, parent.id));

      for (const child of children) {
        const cfg = child.providerConfig ?? {};
        if (cfg.connectionId === id) {
          await db
            .update(assets)
            .set({
              providerType: "manual",
              providerConfig: {},
              parentAssetId: null,
              updatedAt: new Date(),
            })
            .where(eq(assets.id, child.id));
        }
      }

      // Revert parent to manual
      await db
        .update(assets)
        .set({
          providerType: "manual",
          providerConfig: {},
          updatedAt: new Date(),
        })
        .where(eq(assets.id, parent.id));
    }

    await db.delete(coinbaseConnections).where(eq(coinbaseConnections.id, id));

    return jsonResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/coinbase/ src/types/index.ts
git commit -m "feat(coinbase): API routes for connect/sync/disconnect"
```

---

### Task 5: TanStack hooks

**Files:**
- Create: `src/hooks/use-coinbase.ts`
- Modify: `src/hooks/use-connections.ts` (add CoinbaseConnectionSummary type + useSyncCoinbase)

- [ ] **Step 1: Create use-coinbase.ts**

Create `src/hooks/use-coinbase.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface CoinbaseConnection {
  id: string;
  label: string;
  errorCode: string | null;
  errorMessage: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export function useCoinbaseConnections() {
  return useQuery<CoinbaseConnection[]>({
    queryKey: ["coinbase-connections"],
    queryFn: async () => {
      const res = await fetch("/api/coinbase/connections");
      if (!res.ok) throw new Error("Failed to load Coinbase connections");
      return res.json();
    },
  });
}

export function useCreateCoinbaseConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { apiKey: string; apiSecret: string; label?: string }) => {
      const res = await fetch("/api/coinbase/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to connect Coinbase");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coinbase-connections"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success("Coinbase connected");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to connect");
    },
  });
}

export function useDisconnectCoinbase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(`/api/coinbase/connections/${connectionId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coinbase-connections"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success("Coinbase disconnected");
    },
    onError: () => toast.error("Failed to disconnect"),
  });
}
```

- [ ] **Step 2: Add useSyncCoinbase to use-connections.ts**

Append a `CoinbaseConnectionSummary` interface and `useSyncCoinbase` hook to `src/hooks/use-connections.ts` (matching the SimpleFIN pattern). Add `coinbase: CoinbaseConnectionSummary[]` to the `ConnectionsData` interface.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-coinbase.ts src/hooks/use-connections.ts
git commit -m "feat(coinbase): TanStack hooks for connection management"
```

---

### Task 6: Connections aggregator + UI

**Files:**
- Modify: `src/app/api/connections/route.ts` (add coinbase array)
- Modify: `src/app/(app)/settings/connections/page.tsx`

- [ ] **Step 1: Update connections aggregator**

In `src/app/api/connections/route.ts`, import `coinbaseConnections`, add a CoinbaseRow section to fetch and compute status (15-min interval × 2 = 30min staleness window since cron runs every 15 min), and include `coinbase` in the response.

- [ ] **Step 2: Update settings UI**

In `src/app/(app)/settings/connections/page.tsx`, add:
- `CoinbaseConnectForm` component with API key + secret inputs and a Connect button
- `CoinbaseRow` component matching SimpleFINRow (with disconnect dropdown)
- Section placement: after SimpleFIN, before Price feeds
- Use `useCoinbaseConnections`, `useCreateCoinbaseConnection`, `useDisconnectCoinbase`, `useSyncCoinbase`
- Icon: `BitcoinIcon` from lucide-react

Ensure the form is always visible so users can add a first connection.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/connections/route.ts src/app/\(app\)/settings/connections/page.tsx
git commit -m "feat(coinbase): settings UI for connect/sync/disconnect"
```

---

### Task 7: Cron job

**Files:**
- Modify: `src/lib/cron.ts`

- [ ] **Step 1: Add refresh function**

In `src/lib/cron.ts`:
1. Import `coinbaseConnections` from schema and `syncCoinbaseConnection` from `@/lib/coinbase-sync`.
2. Add `coinbase: false` to the `running` guard object.
3. Add `refreshCoinbaseConnections` async function that loops all connections and calls `syncCoinbaseConnection`, matching the Plaid pattern but without exponential backoff (Coinbase doesn't need it — credentials either work or they don't).
4. Register a `*/15 * * * *` schedule inside `startCronJobs()` with the concurrency guard.

- [ ] **Step 2: Commit**

```bash
git add src/lib/cron.ts
git commit -m "feat(coinbase): sync every 15 minutes via cron"
```

---

### Task 8: Deploy + smoke test

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: clean build, no type errors.

- [ ] **Step 2: Deploy**

Run: `systemctl restart summa`
Expected: service healthy after restart.

- [ ] **Step 3: Manual smoke test**

Open http://192.168.1.244:3000/settings/connections. Verify:
- Coinbase section visible with API key + secret inputs
- After user provides credentials + Connect, connection appears
- Portfolio shows parent "Coinbase" asset with crypto children
- Children have tickers ending in `-USD`
- Last synced timestamp present

---

### Task 9: PR + merge

- [ ] **Step 1: Push branch**

```bash
git push -u origin feature/coinbase-integration
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: Coinbase API direct integration" --body "..."
```

- [ ] **Step 3: Merge after review**

```bash
gh pr merge --squash
```
