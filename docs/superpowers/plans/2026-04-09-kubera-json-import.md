# Kubera JSON Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-time migration tool to import a Kubera JSON export into Summa, recreating the portfolio structure (sheets, sections, accounts) and populating asset data.

**Architecture:** Client-side JSON parsing with FileReader (no server upload). Single POST endpoint handles all DB writes in one transaction: sheets -> sections -> assets -> snapshots. Tree-view UI for review with match/create/skip per account.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Zod, TanStack Query, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-09-kubera-json-import-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/kubera-parser.ts` | Create | Parse Kubera JSON, map fields, build tree structure, auto-match accounts |
| `src/types/index.ts` | Modify | Add Zod schema for import request + KuberaAccount type |
| `src/app/api/import/kubera/route.ts` | Create | POST endpoint — transactional insert of sheets/sections/assets/snapshots |
| `src/hooks/use-kubera-import.ts` | Create | TanStack Query mutation hook |
| `src/components/import/kubera-import.tsx` | Create | Main stateful component (upload -> review -> confirm -> result) |
| `src/components/import/kubera-tree.tsx` | Create | Tree view grouped by sheet/section |
| `src/components/import/kubera-account-row.tsx` | Create | Single account row with action dropdown |
| `src/app/(app)/import/kubera/page.tsx` | Create | Page shell |
| `src/app/(app)/layout.tsx` | Modify | Add sidebar nav link to import page |

---

### Task 1: Kubera Parser — Types & Field Mapping

**Files:**
- Create: `src/lib/kubera-parser.ts`

This is the core pure logic: parse the raw JSON, map Kubera fields to Summa fields, build a tree structure grouped by sheet/section, and auto-match against existing assets.

- [ ] **Step 1: Create the parser file with types and parse function**

```typescript
// src/lib/kubera-parser.ts

// ── Kubera JSON shape ──

export interface KuberaAccount {
  id: string;
  name: string;
  sectionId: string;
  sectionName: string;
  sheetId: string;
  sheetName: string;
  category: "asset" | "debt";
  value: { amount: number; currency: string };
  ticker?: string;
  quantity?: number;
  investable?: string;
  ownership?: number;
  subType?: string;
  rate?: { price: number; currency: string };
  assetClass?: string;
  type?: string;
  purchaseDate?: string;
  isManual?: boolean;
  connection?: { aggregator?: string; providerName?: string };
  cost?: { amount: number; currency: string };
  description?: string;
  notes?: string;
}

interface KuberaExport {
  asset?: KuberaAccount[];
  debt?: KuberaAccount[];
}

// ── Parsed output ──

export type ImportAction = "create" | "match" | "skip";

export interface ParsedAccount {
  kuberaId: string;
  name: string;
  category: "asset" | "debt";
  sheetName: string;
  sectionName: string;
  value: number;
  currency: string;
  ticker: string | null;
  quantity: number | null;
  price: number | null;
  ownership: number; // 0-100 (Summa scale)
  costBasis: number | null;
  isInvestable: boolean;
  isCashEquivalent: boolean;
  assetType: string;
  providerType: "manual" | "ticker";
  purchaseDate: string | null;
  notes: string | null;
  action: ImportAction;
  matchedAssetId: string | null;
}

export interface ParsedSheet {
  name: string;
  type: "assets" | "debts";
  sections: ParsedSection[];
}

export interface ParsedSection {
  name: string;
  sheetName: string;
  accounts: ParsedAccount[];
}

export interface ParsedImport {
  sheets: ParsedSheet[];
  totalAccounts: number;
}

// ── Map a single Kubera account to Summa fields ──

function mapAccount(k: KuberaAccount): ParsedAccount {
  const ticker = k.ticker && k.ticker !== "USD" ? k.ticker : null;
  return {
    kuberaId: k.id,
    name: k.name,
    category: k.category,
    sheetName: k.sheetName,
    sectionName: k.sectionName,
    value: k.value?.amount ?? 0,
    currency: k.value?.currency ?? "USD",
    ticker,
    quantity: k.quantity ?? null,
    price: k.rate?.price ?? null,
    ownership: (k.ownership ?? 1) * 100,
    costBasis: k.cost?.amount ?? null,
    isInvestable: k.investable === "investable_cash" || k.investable === "investable_easy_convert",
    isCashEquivalent: k.investable === "investable_cash",
    assetType: k.assetClass ?? k.type ?? "other",
    providerType: ticker ? "ticker" : "manual",
    purchaseDate: k.purchaseDate ?? null,
    notes: k.purchaseDate ? `Purchased: ${k.purchaseDate}` : null,
    action: "create",
    matchedAssetId: null,
  };
}

// ── Parse full export into tree ──

export function parseKuberaJson(raw: string): ParsedImport {
  let data: KuberaExport;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON file. Please upload a Kubera JSON export.");
  }

  const allAccounts = [
    ...(data.asset ?? []),
    ...(data.debt ?? []),
  ];

  if (allAccounts.length === 0) {
    throw new Error("No accounts found in the Kubera export. Expected 'asset' or 'debt' arrays.");
  }

  // Group into tree: sheet -> section -> accounts
  const sheetMap = new Map<string, ParsedSheet>();

  for (const k of allAccounts) {
    const mapped = mapAccount(k);
    const sheetKey = k.sheetName;

    if (!sheetMap.has(sheetKey)) {
      sheetMap.set(sheetKey, {
        name: k.sheetName,
        type: k.category === "debt" ? "debts" : "assets",
        sections: [],
      });
    }

    const sheet = sheetMap.get(sheetKey)!;
    let section = sheet.sections.find((s) => s.name === k.sectionName);
    if (!section) {
      section = { name: k.sectionName, sheetName: k.sheetName, accounts: [] };
      sheet.sections.push(section);
    }

    section.accounts.push(mapped);
  }

  return {
    sheets: Array.from(sheetMap.values()),
    totalAccounts: allAccounts.length,
  };
}

// ── Auto-match against existing Summa assets ──

interface ExistingAsset {
  id: string;
  name: string;
  providerType: string;
}

export function autoMatch(
  parsed: ParsedImport,
  existingAssets: ExistingAsset[]
): ParsedImport {
  const result = structuredClone(parsed);

  for (const sheet of result.sheets) {
    for (const section of sheet.sections) {
      for (const account of section.accounts) {
        // Exact match
        const exact = existingAssets.find(
          (a) => a.name === account.name
        );
        if (exact) {
          account.action = "match";
          account.matchedAssetId = exact.id;
          continue;
        }

        // Case-insensitive substring match
        const partial = existingAssets.find(
          (a) =>
            a.name.toLowerCase().includes(account.name.toLowerCase()) ||
            account.name.toLowerCase().includes(a.name.toLowerCase())
        );
        if (partial) {
          account.action = "match";
          account.matchedAssetId = partial.id;
          continue;
        }

        // No match — default to create
        account.action = "create";
        account.matchedAssetId = null;
      }
    }
  }

  return result;
}
```

- [ ] **Step 2: Verify the parser compiles**

Run: `npx tsc --noEmit src/lib/kubera-parser.ts 2>&1 || echo 'checking with full build'`
Then: `pnpm build 2>&1 | tail -5`

If type errors, fix them.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kubera-parser.ts
git commit -m "feat: Kubera JSON parser with field mapping and auto-matching"
```

---

### Task 2: Zod Schema for Import Request

**Files:**
- Modify: `src/types/index.ts` (add schema after existing `csvImportConfirm` schema, around line 197)

- [ ] **Step 1: Add the Kubera import Zod schema**

Add at the end of `src/types/index.ts`:

```typescript
// ── Kubera import ──

export const kuberaImportAction = z.object({
  kuberaId: z.string(),
  action: z.enum(["create", "match", "skip"]),
  summaAssetId: z.string().uuid().optional(),
  name: z.string(),
  category: z.enum(["asset", "debt"]),
  sheetName: z.string(),
  sectionName: z.string(),
  value: z.number(),
  currency: z.string().default("USD"),
  ticker: z.string().nullable(),
  quantity: z.number().nullable(),
  price: z.number().nullable(),
  ownership: z.number().min(0).max(100).default(100),
  costBasis: z.number().nullable(),
  isInvestable: z.boolean().default(true),
  isCashEquivalent: z.boolean().default(false),
  assetType: z.string().default("other"),
  providerType: z.enum(["manual", "ticker"]).default("manual"),
  purchaseDate: z.string().nullable(),
  notes: z.string().nullable(),
});

export const kuberaImportRequest = z.object({
  exportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  portfolioId: z.string().uuid(),
  actions: z.array(kuberaImportAction).min(1, "At least one account required"),
});
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add Zod schema for Kubera import request"
```

---

### Task 3: API Route — Transactional Import

**Files:**
- Create: `src/app/api/import/kubera/route.ts`

This endpoint receives the finalized import payload and does all DB writes in a single Drizzle transaction: sheets -> sections -> assets -> snapshots.

- [ ] **Step 1: Create the API route**

```typescript
// src/app/api/import/kubera/route.ts

import { db } from "@/lib/db";
import { assets, assetSnapshots, sheets, sections } from "@/lib/db/schema";
import {
  jsonResponse,
  errorResponse,
  requireAuth,
  requirePortfolioOwnership,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, kuberaImportRequest } from "@/types";
import { eq, and } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, kuberaImportRequest);
    await requirePortfolioOwnership(body.portfolioId, user.id);

    // Fetch existing sheets and sections for name matching
    const existingSheets = await db
      .select()
      .from(sheets)
      .where(eq(sheets.portfolioId, body.portfolioId));

    const existingSections = await db
      .select()
      .from(sections)
      .where(
        existingSheets.length > 0
          ? eq(sections.sheetId, existingSheets[0].id) // will be refined below
          : eq(sections.sheetId, "00000000-0000-0000-0000-000000000000") // no sheets = no sections
      );

    // Actually fetch all sections for all existing sheets
    const allSectionRows =
      existingSheets.length > 0
        ? await db.select().from(sections)
        : [];
    const existingSectionsBySheet = new Map<string, typeof allSectionRows>();
    for (const sec of allSectionRows) {
      const list = existingSectionsBySheet.get(sec.sheetId) ?? [];
      list.push(sec);
      existingSectionsBySheet.set(sec.sheetId, list);
    }

    let assetsCreated = 0;
    let assetsMatched = 0;
    let assetsSkipped = 0;
    let snapshotsInserted = 0;
    let sheetsCreated = 0;
    let sectionsCreated = 0;
    const errors: string[] = [];

    // Track created sheets/sections by name for reuse within this import
    const sheetIdByName = new Map<string, string>();
    for (const s of existingSheets) {
      sheetIdByName.set(s.name, s.id);
    }

    const sectionIdByKey = new Map<string, string>();
    for (const sec of allSectionRows) {
      const sheet = existingSheets.find((s) => s.id === sec.sheetId);
      if (sheet) {
        sectionIdByKey.set(`${sheet.name}::${sec.name}`, sec.id);
      }
    }

    await db.transaction(async (tx) => {
      for (const item of body.actions) {
        try {
          if (item.action === "skip") {
            assetsSkipped++;
            continue;
          }

          if (item.action === "match") {
            assetsMatched++;
            continue;
          }

          // action === "create"

          // 1. Ensure sheet exists
          let sheetId = sheetIdByName.get(item.sheetName);
          if (!sheetId) {
            const sheetType = item.category === "debt" ? "debts" : "assets";
            const [newSheet] = await tx
              .insert(sheets)
              .values({
                portfolioId: body.portfolioId,
                name: item.sheetName,
                type: sheetType,
                sortOrder: existingSheets.length + sheetsCreated,
              })
              .returning();
            sheetId = newSheet.id;
            sheetIdByName.set(item.sheetName, sheetId);
            sheetsCreated++;
          }

          // 2. Ensure section exists
          const sectionKey = `${item.sheetName}::${item.sectionName}`;
          let sectionId = sectionIdByKey.get(sectionKey);
          if (!sectionId) {
            const existingSectionsForSheet =
              existingSectionsBySheet.get(sheetId) ?? [];
            const [newSection] = await tx
              .insert(sections)
              .values({
                sheetId,
                name: item.sectionName,
                sortOrder: existingSectionsForSheet.length + sectionsCreated,
              })
              .returning();
            sectionId = newSection.id;
            sectionIdByKey.set(sectionKey, sectionId);
            sectionsCreated++;
          }

          // 3. Create asset
          const [newAsset] = await tx
            .insert(assets)
            .values({
              sectionId,
              name: item.name,
              type: item.assetType,
              currency: item.currency,
              currentValue: item.value.toFixed(2),
              currentPrice: item.price != null ? item.price.toFixed(8) : null,
              quantity: item.quantity != null ? item.quantity.toFixed(8) : null,
              costBasis: item.costBasis != null ? item.costBasis.toFixed(2) : null,
              ownershipPct: item.ownership.toFixed(2),
              isInvestable: item.isInvestable,
              isCashEquivalent: item.isCashEquivalent,
              providerType: item.providerType,
              providerConfig: item.ticker ? { ticker: item.ticker } : {},
              notes: item.notes,
              sortOrder: assetsCreated,
            })
            .returning();
          assetsCreated++;

          // 4. Create snapshot
          await tx
            .insert(assetSnapshots)
            .values({
              assetId: newAsset.id,
              date: body.exportDate,
              value: item.value.toFixed(2),
              valueInBase: item.value.toFixed(2), // USD-only assumption
              price: item.price != null ? item.price.toFixed(8) : null,
              quantity: item.quantity != null ? item.quantity.toFixed(8) : null,
              source: "import",
            })
            .onConflictDoUpdate({
              target: [assetSnapshots.assetId, assetSnapshots.date],
              set: {
                value: item.value.toFixed(2),
                valueInBase: item.value.toFixed(2),
                price: item.price != null ? item.price.toFixed(8) : null,
                quantity: item.quantity != null ? item.quantity.toFixed(8) : null,
              },
            });
          snapshotsInserted++;
        } catch (err) {
          errors.push(
            `${item.name}: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }

      // If there were errors, the transaction still commits the successful ones.
      // To make it all-or-nothing, uncomment:
      // if (errors.length > 0) throw new Error("Import had errors");
    });

    return jsonResponse({
      assetsCreated,
      assetsMatched,
      assetsSkipped,
      snapshotsInserted,
      sheetsCreated,
      sectionsCreated,
      errors,
    });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | tail -10`

Fix any import or type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/import/kubera/route.ts
git commit -m "feat: Kubera import API route with transactional inserts"
```

---

### Task 4: Mutation Hook

**Files:**
- Create: `src/hooks/use-kubera-import.ts`

- [ ] **Step 1: Create the mutation hook**

```typescript
// src/hooks/use-kubera-import.ts

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface ImportAction {
  kuberaId: string;
  action: "create" | "match" | "skip";
  summaAssetId?: string;
  name: string;
  category: "asset" | "debt";
  sheetName: string;
  sectionName: string;
  value: number;
  currency: string;
  ticker: string | null;
  quantity: number | null;
  price: number | null;
  ownership: number;
  costBasis: number | null;
  isInvestable: boolean;
  isCashEquivalent: boolean;
  assetType: string;
  providerType: "manual" | "ticker";
  purchaseDate: string | null;
  notes: string | null;
}

interface ImportRequest {
  exportDate: string;
  portfolioId: string;
  actions: ImportAction[];
}

interface ImportResponse {
  assetsCreated: number;
  assetsMatched: number;
  assetsSkipped: number;
  snapshotsInserted: number;
  sheetsCreated: number;
  sectionsCreated: number;
  errors: string[];
}

export function useKuberaImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ImportRequest): Promise<ImportResponse> => {
      const res = await fetch("/api/import/kubera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Import failed" }));
        throw new Error(err.error ?? "Import failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      toast.success(
        `Imported ${data.assetsCreated} assets, matched ${data.assetsMatched}, skipped ${data.assetsSkipped}`
      );
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-kubera-import.ts
git commit -m "feat: TanStack Query mutation hook for Kubera import"
```

---

### Task 5: UI Components — Tree, Row, Match Dropdown

**Files:**
- Create: `src/components/import/kubera-tree.tsx`
- Create: `src/components/import/kubera-account-row.tsx`

These are the display components. The tree renders sheets/sections/accounts. Each account row shows value info and an action dropdown (create/match/skip).

- [ ] **Step 1: Create the account row component**

```typescript
// src/components/import/kubera-account-row.tsx

"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ParsedAccount, ImportAction } from "@/lib/kubera-parser";

interface ExistingAsset {
  id: string;
  name: string;
  providerType: string;
}

interface KuberaAccountRowProps {
  account: ParsedAccount;
  existingAssets: ExistingAsset[];
  onActionChange: (kuberaId: string, action: ImportAction, matchedAssetId?: string) => void;
}

function formatValue(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function KuberaAccountRow({
  account,
  existingAssets,
  onActionChange,
}: KuberaAccountRowProps) {
  const matchedAsset = existingAssets.find((a) => a.id === account.matchedAssetId);

  return (
    <div className="flex items-center justify-between gap-4 py-2 px-3 rounded-md hover:bg-muted/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{account.name}</span>
          {account.ticker && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {account.ticker}
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {formatValue(account.value, account.currency)}
          {account.quantity != null && account.ticker && (
            <span className="ml-2">
              {account.quantity} {account.ticker}
            </span>
          )}
        </div>
        {account.action === "match" && matchedAsset && (
          <div className="text-xs text-green-600 mt-0.5">
            Matched: &quot;{matchedAsset.name}&quot;
            {matchedAsset.providerType !== "manual" && (
              <span className="ml-1">({matchedAsset.providerType})</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={account.action === "match" ? `match::${account.matchedAssetId}` : account.action}
          onValueChange={(val) => {
            if (val === "create") {
              onActionChange(account.kuberaId, "create");
            } else if (val === "skip") {
              onActionChange(account.kuberaId, "skip");
            } else if (val.startsWith("match::")) {
              const assetId = val.replace("match::", "");
              onActionChange(account.kuberaId, "match", assetId);
            }
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="create">Create new</SelectItem>
            <SelectItem value="skip">Skip</SelectItem>
            {existingAssets.map((a) => (
              <SelectItem key={a.id} value={`match::${a.id}`}>
                Match: {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the tree component**

```typescript
// src/components/import/kubera-tree.tsx

"use client";

import { ChevronDownIcon } from "lucide-react";
import { KuberaAccountRow } from "./kubera-account-row";
import type { ParsedImport, ImportAction } from "@/lib/kubera-parser";

interface ExistingAsset {
  id: string;
  name: string;
  providerType: string;
}

interface KuberaTreeProps {
  data: ParsedImport;
  existingAssets: ExistingAsset[];
  onActionChange: (kuberaId: string, action: ImportAction, matchedAssetId?: string) => void;
}

export function KuberaTree({ data, existingAssets, onActionChange }: KuberaTreeProps) {
  return (
    <div className="space-y-4">
      {data.sheets.map((sheet) => (
        <div key={sheet.name} className="border rounded-lg">
          <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b">
            <ChevronDownIcon className="size-4 text-muted-foreground" />
            <h3 className="font-semibold">{sheet.name}</h3>
            <span className="text-xs text-muted-foreground">
              ({sheet.type === "debts" ? "debt" : "asset"} sheet)
            </span>
          </div>

          <div className="divide-y">
            {sheet.sections.map((section) => (
              <div key={`${sheet.name}::${section.name}`}>
                <div className="flex items-center gap-2 px-6 py-2 bg-muted/10">
                  <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {section.name}
                  </h4>
                </div>

                <div className="px-4 py-1">
                  {section.accounts.map((account) => (
                    <KuberaAccountRow
                      key={account.kuberaId}
                      account={account}
                      existingAssets={existingAssets}
                      onActionChange={onActionChange}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build 2>&1 | tail -10`

Check for missing UI component imports (`Select`, etc.). If `@/components/ui/select` doesn't exist, substitute with a native `<select>` element.

- [ ] **Step 4: Commit**

```bash
git add src/components/import/kubera-account-row.tsx src/components/import/kubera-tree.tsx
git commit -m "feat: Kubera import tree view and account row components"
```

---

### Task 6: Main Import Component

**Files:**
- Create: `src/components/import/kubera-import.tsx`

This is the stateful orchestrator: upload -> parse -> review tree -> confirm -> show result. It manages the parsed data state, handles file upload, runs auto-matching, and calls the import mutation.

- [ ] **Step 1: Create the main import component**

```typescript
// src/components/import/kubera-import.tsx

"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UploadIcon, Loader2Icon, CheckCircleIcon } from "lucide-react";
import { KuberaTree } from "./kubera-tree";
import {
  parseKuberaJson,
  autoMatch,
  type ParsedImport,
  type ImportAction,
} from "@/lib/kubera-parser";
import { useKuberaImport } from "@/hooks/use-kubera-import";

interface ExistingAsset {
  id: string;
  name: string;
  providerType: string;
}

interface KuberaImportProps {
  portfolioId: string;
  existingAssets: ExistingAsset[];
}

type Step = "upload" | "review" | "confirm" | "result";

export function KuberaImport({ portfolioId, existingAssets }: KuberaImportProps) {
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [exportDate, setExportDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const importMutation = useKuberaImport();

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const raw = e.target?.result as string;
          const result = parseKuberaJson(raw);
          const matched = autoMatch(result, existingAssets);
          setParsed(matched);
          setStep("review");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to parse file");
        }
      };
      reader.readAsText(file);
    },
    [existingAssets]
  );

  const handleActionChange = useCallback(
    (kuberaId: string, action: ImportAction, matchedAssetId?: string) => {
      if (!parsed) return;
      setParsed((prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        for (const sheet of next.sheets) {
          for (const section of sheet.sections) {
            for (const account of section.accounts) {
              if (account.kuberaId === kuberaId) {
                account.action = action;
                account.matchedAssetId = matchedAssetId ?? null;
                return next;
              }
            }
          }
        }
        return next;
      });
    },
    [parsed]
  );

  const summary = parsed
    ? (() => {
        let create = 0,
          match = 0,
          skip = 0;
        const newSheets = new Set<string>();
        const newSections = new Set<string>();
        for (const sheet of parsed.sheets) {
          for (const section of sheet.sections) {
            for (const account of section.accounts) {
              if (account.action === "create") {
                create++;
                newSheets.add(sheet.name);
                newSections.add(`${sheet.name}::${section.name}`);
              } else if (account.action === "match") match++;
              else skip++;
            }
          }
        }
        return { create, match, skip, newSheets: newSheets.size, newSections: newSections.size };
      })()
    : null;

  const handleImport = () => {
    if (!parsed) return;
    const actions = parsed.sheets.flatMap((sheet) =>
      sheet.sections.flatMap((section) =>
        section.accounts.map((a) => ({
          kuberaId: a.kuberaId,
          action: a.action,
          summaAssetId: a.matchedAssetId ?? undefined,
          name: a.name,
          category: a.category,
          sheetName: a.sheetName,
          sectionName: a.sectionName,
          value: a.value,
          currency: a.currency,
          ticker: a.ticker,
          quantity: a.quantity,
          price: a.price,
          ownership: a.ownership,
          costBasis: a.costBasis,
          isInvestable: a.isInvestable,
          isCashEquivalent: a.isCashEquivalent,
          assetType: a.assetType,
          providerType: a.providerType,
          purchaseDate: a.purchaseDate,
          notes: a.notes,
        }))
      )
    );

    importMutation.mutate(
      { exportDate, portfolioId, actions },
      {
        onSuccess: () => setStep("result"),
      }
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import from Kubera</h1>
        <p className="text-muted-foreground">
          Upload your Kubera JSON export to migrate accounts into Summa.
        </p>
      </div>

      {/* Upload step */}
      {step === "upload" && (
        <div className="border-2 border-dashed rounded-lg p-12 text-center space-y-4">
          <UploadIcon className="size-10 mx-auto text-muted-foreground" />
          <div>
            <p className="font-medium">Drop your Kubera JSON file here</p>
            <p className="text-sm text-muted-foreground">
              Export from Kubera, then upload the .json file
            </p>
          </div>
          <Input
            type="file"
            accept=".json"
            className="max-w-xs mx-auto"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      )}

      {/* Review step */}
      {step === "review" && parsed && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Export date:</label>
              <Input
                type="date"
                value={exportDate}
                onChange={(e) => setExportDate(e.target.value)}
                className="w-[180px]"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {parsed.totalAccounts} accounts found
            </p>
          </div>

          <KuberaTree
            data={parsed}
            existingAssets={existingAssets}
            onActionChange={handleActionChange}
          />

          {summary && (
            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-muted-foreground">
                {summary.create} create &middot; {summary.match} match &middot;{" "}
                {summary.skip} skip
                {summary.newSheets > 0 && (
                  <span>
                    {" "}
                    &middot; {summary.newSheets} new sheet{summary.newSheets > 1 ? "s" : ""}
                  </span>
                )}
                {summary.newSections > 0 && (
                  <span>
                    {" "}
                    &middot; {summary.newSections} new section{summary.newSections > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <Button
                onClick={() => setStep("confirm")}
                disabled={summary.create === 0 && summary.match === 0}
              >
                Review import
              </Button>
            </div>
          )}
        </>
      )}

      {/* Confirm step */}
      {step === "confirm" && summary && (
        <div className="border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">Confirm import</h2>
          <ul className="space-y-1 text-sm">
            <li>Creating <strong>{summary.create}</strong> new assets</li>
            <li>Matching <strong>{summary.match}</strong> to existing assets</li>
            <li>Skipping <strong>{summary.skip}</strong> accounts</li>
            {summary.newSheets > 0 && (
              <li>Creating <strong>{summary.newSheets}</strong> new sheets</li>
            )}
            {summary.newSections > 0 && (
              <li>Creating <strong>{summary.newSections}</strong> new sections</li>
            )}
          </ul>
          <p className="text-sm text-muted-foreground">
            Snapshots dated {exportDate} will be recorded for all new assets.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("review")}>
              Back
            </Button>
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending && (
                <Loader2Icon className="size-4 mr-2 animate-spin" />
              )}
              Import
            </Button>
          </div>
          {importMutation.error && (
            <p className="text-sm text-destructive">
              {importMutation.error.message}
            </p>
          )}
        </div>
      )}

      {/* Result step */}
      {step === "result" && importMutation.data && (
        <div className="border rounded-lg p-6 space-y-4 text-center">
          <CheckCircleIcon className="size-12 mx-auto text-green-600" />
          <h2 className="text-lg font-semibold">Import complete</h2>
          <ul className="text-sm space-y-1">
            <li>{importMutation.data.assetsCreated} assets created</li>
            <li>{importMutation.data.assetsMatched} assets matched</li>
            <li>{importMutation.data.snapshotsInserted} snapshots recorded</li>
            {importMutation.data.sheetsCreated > 0 && (
              <li>{importMutation.data.sheetsCreated} sheets created</li>
            )}
            {importMutation.data.sectionsCreated > 0 && (
              <li>{importMutation.data.sectionsCreated} sections created</li>
            )}
          </ul>
          {importMutation.data.errors.length > 0 && (
            <div className="text-left">
              <p className="text-sm font-medium text-destructive">Errors:</p>
              <ul className="text-sm text-destructive list-disc pl-5">
                {importMutation.data.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <Button asChild>
            <a href="/dashboard">Go to dashboard</a>
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | tail -10`

If `@/components/ui/select` is missing, replace the `Select` usage in `kubera-account-row.tsx` with a native `<select>` element. If `@/components/ui/input` or `@/components/ui/button` are missing, check `src/components/ui/` for actual component names.

- [ ] **Step 3: Commit**

```bash
git add src/components/import/kubera-import.tsx
git commit -m "feat: main Kubera import component with upload/review/confirm/result flow"
```

---

### Task 7: Page Shell & Sidebar Link

**Files:**
- Create: `src/app/(app)/import/kubera/page.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create the page**

The page needs to fetch the current portfolio and its assets to pass to the import component for matching. Follow the existing pattern for authenticated pages.

```typescript
// src/app/(app)/import/kubera/page.tsx

"use client";

import { useEffect, useState } from "react";
import { KuberaImport } from "@/components/import/kubera-import";

interface Asset {
  id: string;
  name: string;
  providerType: string;
}

interface Sheet {
  sections: Array<{
    assets: Asset[];
  }>;
}

interface Portfolio {
  id: string;
  sheets: Sheet[];
}

export default function KuberaImportPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolios")
      .then((r) => r.json())
      .then((data) => {
        // Use first portfolio (single-user mode)
        const p = data[0] ?? data;
        setPortfolio(p);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading...</div>
    );
  }

  if (!portfolio) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No portfolio found. Create one first.
      </div>
    );
  }

  // Flatten all assets from all sheets/sections for matching
  const existingAssets: Asset[] = (portfolio.sheets ?? []).flatMap(
    (sheet: Sheet) =>
      sheet.sections.flatMap((section) =>
        section.assets.map((a) => ({
          id: a.id,
          name: a.name,
          providerType: a.providerType,
        }))
      )
  );

  return (
    <div className="p-8">
      <KuberaImport
        portfolioId={portfolio.id}
        existingAssets={existingAssets}
      />
    </div>
  );
}
```

**Important:** Check how the existing app fetches portfolio data. If there's a `usePortfolio` hook or the layout already provides portfolio context, use that instead of a raw `fetch`. Look at how other `(app)` pages get portfolio data and follow the same pattern.

- [ ] **Step 2: Add sidebar nav link**

In `src/app/(app)/layout.tsx`, add an import link in the settings nav section (after the Connections link, around line 229):

```tsx
<Link
  href="/import/kubera"
  className={cn(
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
    pathname === "/import/kubera" && "bg-accent text-accent-foreground"
  )}
>
  <UploadIcon className="size-4" />
  Import
</Link>
```

Add `UploadIcon` to the lucide-react imports at the top of the file.

- [ ] **Step 3: Verify build**

Run: `pnpm build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/import/kubera/page.tsx src/app/(app)/layout.tsx
git commit -m "feat: Kubera import page and sidebar nav link"
```

---

### Task 8: Integration Verification

- [ ] **Step 1: Start dev server and verify page loads**

Run: `pnpm dev` (if not already running)

Open `http://192.168.1.244:3000/import/kubera` in a browser.

Verify:
- Page loads without errors
- Upload input is visible
- No console errors

- [ ] **Step 2: Test with actual Kubera JSON**

1. Upload the Kubera JSON export
2. Verify tree view shows correct sheet/section/account structure
3. Verify auto-matching works for any existing accounts
4. Change some actions (create/match/skip)
5. Set the export date
6. Click "Review import" then "Import"
7. Verify success screen shows correct counts
8. Navigate to dashboard and confirm new assets appear in the correct sheets/sections

- [ ] **Step 3: Test idempotency**

1. Run the import again with the same file
2. Verify it doesn't create duplicate assets (new assets will be created with new IDs, but snapshots will upsert)
3. Note: running twice WILL create duplicate assets since we don't check for name uniqueness. This is by design — the user chose "Create." Document this.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: Kubera import adjustments from integration testing"
```
