# AI Document Import — Part 1: Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete backend for AI-powered balance extraction from PDF/CSV documents via Ollama, including schema, AI layer, and all API routes.

**Architecture:** Three new database tables (ai_settings, import_sources, import_logs), a modular AI extraction layer that talks to Ollama over HTTP, and REST API routes following the existing pattern (requireAuth, Zod validation, jsonResponse/errorResponse). PDF text is extracted server-side via pdfjs-dist, sent to Ollama for structured balance extraction, then fuzzy-matched against existing assets.

**Tech Stack:** Drizzle ORM (Postgres), Next.js API routes, pdfjs-dist, Ollama HTTP API, Vitest, Zod

**Design spec:** `docs/superpowers/specs/2026-05-03-ai-document-import-design.md`

**IMPORTANT — userId type:** The user table uses `text("id")` as its primary key (Better Auth convention). All new tables referencing users MUST use `text("user_id")`, NOT `uuid("user_id")`.

---

## File Structure

### New files

```
src/lib/ai/types.ts              -- AIProvider interface, ExtractedBalance, ModelInfo types
src/lib/ai/prompts.ts            -- Extraction system prompt builder
src/lib/ai/pdf-text.ts           -- PDF -> text extraction via pdfjs-dist
src/lib/ai/fuzzy-match.ts        -- Asset name matching + Levenshtein distance
src/lib/ai/ollama.ts             -- Ollama provider (HTTP client + response parser)
src/lib/ai/index.ts              -- Factory: getAIProvider(settings)

src/app/api/settings/ai/route.ts          -- GET/PATCH Ollama config
src/app/api/settings/ai/models/route.ts   -- GET available models
src/app/api/settings/ai/test/route.ts     -- POST health check + test extraction
src/app/api/import/extract/route.ts       -- POST file upload -> AI extraction
src/app/api/import/apply/route.ts         -- POST apply balance changes to assets
src/app/api/import/sources/route.ts       -- GET/POST import sources
src/app/api/import/sources/[id]/route.ts  -- PATCH/DELETE import source
src/app/api/import/logs/route.ts          -- GET import history
src/app/api/import/logs/[id]/route.ts     -- GET import detail

src/lib/__tests__/fuzzy-match.test.ts     -- Fuzzy matching unit tests
src/lib/__tests__/ollama-parser.test.ts   -- Ollama response parser tests
src/lib/__tests__/prompts.test.ts         -- Prompt builder tests
```

### Modified files

```
src/lib/db/schema.ts   -- Add importSources, importLogs, aiSettings tables
src/types/index.ts     -- Add Zod schemas for new API routes
```

---

### Task 1: Create feature branch

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feat/ai-import
```

- [ ] **Step 2: Verify branch**

```bash
git branch --show-current
```

Expected: `feat/ai-import`

---

### Task 2: Install pdfjs-dist

- [ ] **Step 1: Install the dependency**

```bash
pnpm add pdfjs-dist
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add pdfjs-dist for PDF text extraction"
```

---

### Task 3: Schema changes + migration

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add the three new tables to schema.ts**

Append after the `exchangeRates` table (end of file). Note: `userId` is `text` to match the Better Auth user table.

```typescript
// ── AI Settings ──

export const aiSettings = pgTable("ai_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().default("http://192.168.1.250:11434"),
  model: text("model"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Import Sources (saved mappings for repeat imports) ──

export const importSources = pgTable("import_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fileType: text("file_type"),
  extractionHints: text("extraction_hints"),
  fieldMappings: jsonb("field_mappings")
    .$type<
      Array<{
        extractedKey: string;
        assetId: string;
        field: "currentValue" | "quantity";
        currency: string;
      }>
    >()
    .notNull()
    .default([]),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Import Logs (audit trail) ──

export const importLogs = pgTable("import_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").references(() => importSources.id, {
    onDelete: "set null",
  }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  status: text("status").notNull(),
  extractedData: jsonb("extracted_data"),
  appliedChanges: jsonb("applied_changes").$type<
    Array<{
      assetId: string;
      assetName: string;
      previousValue: string;
      newValue: string;
      field: string;
    }>
  >(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
```

Expected: creates a new migration file in `src/lib/db/migrations/` (e.g., `0018_*.sql`)

- [ ] **Step 3: Run migration**

```bash
pnpm db:migrate
```

Expected: migration applies without errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat(schema): add ai_settings, import_sources, import_logs tables"
```

---

### Task 4: AI types + extraction prompt

**Files:**
- Create: `src/lib/ai/types.ts`
- Create: `src/lib/ai/prompts.ts`
- Create: `src/lib/__tests__/prompts.test.ts`

- [ ] **Step 1: Write the prompt builder test**

```typescript
// src/lib/__tests__/prompts.test.ts
import { describe, it, expect } from "vitest";
import { buildExtractionPrompt } from "@/lib/ai/prompts";

describe("buildExtractionPrompt", () => {
  it("returns base prompt without hints", () => {
    const prompt = buildExtractionPrompt();
    expect(prompt).toContain("financial document parser");
    expect(prompt).toContain("JSON array");
    expect(prompt).toContain("confidence");
    expect(prompt).not.toContain("Additional context");
  });

  it("appends hints when provided", () => {
    const prompt = buildExtractionPrompt("This is a River.com statement");
    expect(prompt).toContain("Additional context about this document:");
    expect(prompt).toContain("This is a River.com statement");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/__tests__/prompts.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create AI types**

```typescript
// src/lib/ai/types.ts
export interface ExtractedBalance {
  account: string;
  balance: number;
  currency: string;
  asOfDate?: string;
  confidence: number;
  rawText?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  size?: string;
}

export interface AIProvider {
  extractBalances(text: string, hints?: string): Promise<ExtractedBalance[]>;
  listModels(): Promise<ModelInfo[]>;
  healthCheck(): Promise<{ ok: boolean; model: string; error?: string }>;
}
```

- [ ] **Step 4: Create prompt builder**

```typescript
// src/lib/ai/prompts.ts
export function buildExtractionPrompt(hints?: string): string {
  return `You are a financial document parser. Extract all account balances from this document.

Return ONLY a JSON array, no other text:
[
  {
    "account": "Human-readable account name",
    "balance": 1234.56,
    "currency": "USD",
    "asOfDate": "2026-05-01",
    "confidence": 0.95
  }
]

Rules:
- Extract EVERY account/balance pair visible in the document
- Use standard ISO currency codes (USD, BTC, ETH, EUR, etc.)
- For crypto quantities, use the raw amount (e.g., 0.65 for 0.65 BTC)
- balance must be a number, not a string
- If you can determine the statement date, include asOfDate
- confidence: 1.0 = clearly stated, 0.7 = inferred, 0.5 = uncertain
- If the document contains no financial data, return an empty array []${hints ? `\n\nAdditional context about this document:\n${hints}` : ""}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run src/lib/__tests__/prompts.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/types.ts src/lib/ai/prompts.ts src/lib/__tests__/prompts.test.ts
git commit -m "feat(ai): add types and extraction prompt builder"
```

---

### Task 5: PDF text extraction

**Files:**
- Create: `src/lib/ai/pdf-text.ts`

- [ ] **Step 1: Create PDF text extractor**

```typescript
// src/lib/ai/pdf-text.ts
import { getDocument, type TextItem } from "pdfjs-dist";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data, useSystemFonts: true }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => item.str)
      .join(" ");
    pages.push(pageText);
  }

  doc.destroy();
  return pages.join("\n\n");
}
```

Note: `pdfjs-dist` works server-side in Next.js API routes without a web worker. The `useSystemFonts: true` option avoids network requests for standard fonts. If the import path `pdfjs-dist` fails at runtime, try `pdfjs-dist/legacy/build/pdf.mjs` instead. The `TextItem` type import may need adjustment depending on the installed version — if it doesn't resolve, use a type assertion: `.filter((item: any) => typeof item.str === "string")`.

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai/pdf-text.ts
git commit -m "feat(ai): add PDF text extraction via pdfjs-dist"
```

---

### Task 6: Fuzzy matching + tests

**Files:**
- Create: `src/lib/ai/fuzzy-match.ts`
- Create: `src/lib/__tests__/fuzzy-match.test.ts`

- [ ] **Step 1: Write the fuzzy match tests**

```typescript
// src/lib/__tests__/fuzzy-match.test.ts
import { describe, it, expect } from "vitest";
import { suggestAssetMatch, levenshtein } from "@/lib/ai/fuzzy-match";

const candidates = [
  { id: "a1", name: "River Bitcoin", currency: "BTC", type: "crypto" },
  { id: "a2", name: "River Cash", currency: "USD", type: "cash" },
  { id: "a3", name: "Fidelity 401k", currency: "USD", type: "investment" },
  { id: "a4", name: "Chase Checking", currency: "USD", type: "cash" },
];

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("returns string length for empty comparison", () => {
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("returns correct distance for single edits", () => {
    expect(levenshtein("cat", "car")).toBe(1);
    expect(levenshtein("cat", "cats")).toBe(1);
    expect(levenshtein("cat", "at")).toBe(1);
  });

  it("returns correct distance for multiple edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("suggestAssetMatch", () => {
  it("returns confidence 1.0 for exact name match (case-insensitive)", () => {
    const result = suggestAssetMatch("River Bitcoin", "BTC", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a1");
    expect(result!.confidence).toBe(1.0);
  });

  it("matches case-insensitively", () => {
    const result = suggestAssetMatch("river bitcoin", "BTC", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a1");
    expect(result!.confidence).toBe(1.0);
  });

  it("returns confidence 0.8 for currency match + substring", () => {
    const result = suggestAssetMatch("Bitcoin", "BTC", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a1");
    expect(result!.confidence).toBe(0.8);
  });

  it("returns confidence 0.8 when extracted name contains asset name", () => {
    const result = suggestAssetMatch("My River Cash Account", "USD", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a2");
    expect(result!.confidence).toBe(0.8);
  });

  it("returns confidence 0.6 for close Levenshtein match", () => {
    const result = suggestAssetMatch("Chase Checkin", "USD", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a4");
    expect(result!.confidence).toBe(0.6);
  });

  it("returns null when no match is close enough", () => {
    const result = suggestAssetMatch("Totally Unknown Account", "JPY", candidates);
    expect(result).toBeNull();
  });

  it("prefers higher confidence matches", () => {
    const result = suggestAssetMatch("River Cash", "USD", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a2");
    expect(result!.confidence).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/__tests__/fuzzy-match.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement fuzzy matching**

```typescript
// src/lib/ai/fuzzy-match.ts
interface AssetCandidate {
  id: string;
  name: string;
  currency: string;
  type: string;
}

interface MatchResult {
  assetId: string;
  assetName: string;
  confidence: number;
}

export function suggestAssetMatch(
  extractedAccount: string,
  extractedCurrency: string,
  candidates: AssetCandidate[]
): MatchResult | null {
  const normalizedExtracted = extractedAccount.toLowerCase().trim();

  let bestMatch: MatchResult | null = null;
  let bestConfidence = 0;

  for (const candidate of candidates) {
    const normalizedName = candidate.name.toLowerCase().trim();
    let confidence = 0;

    if (normalizedName === normalizedExtracted) {
      confidence = 1.0;
    } else if (
      candidate.currency.toUpperCase() === extractedCurrency.toUpperCase() &&
      (normalizedName.includes(normalizedExtracted) ||
        normalizedExtracted.includes(normalizedName))
    ) {
      confidence = 0.8;
    } else {
      const dist = levenshtein(normalizedName, normalizedExtracted);
      if (dist <= 3) {
        confidence = 0.6;
      }
    }

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestMatch = {
        assetId: candidate.id,
        assetName: candidate.name,
        confidence,
      };
    }
  }

  return bestMatch;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/__tests__/fuzzy-match.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/fuzzy-match.ts src/lib/__tests__/fuzzy-match.test.ts
git commit -m "feat(ai): add fuzzy asset matching with Levenshtein distance"
```

---

### Task 7: Ollama response parser + tests

**Files:**
- Create: `src/lib/__tests__/ollama-parser.test.ts`
- (Parser will live in `src/lib/ai/ollama.ts`, created in Task 8)

The Ollama response parser handles edge cases: thinking tags from Qwen models, JSON wrapped in objects instead of arrays, missing fields. We test it in isolation before building the full provider.

- [ ] **Step 1: Write parser tests**

```typescript
// src/lib/__tests__/ollama-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseExtractedBalances } from "@/lib/ai/ollama";

describe("parseExtractedBalances", () => {
  it("parses a clean JSON array", () => {
    const input = JSON.stringify([
      { account: "Bitcoin", balance: 0.65, currency: "BTC", confidence: 0.95 },
      { account: "Cash", balance: 1234.56, currency: "USD", confidence: 1.0 },
    ]);
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(2);
    expect(result[0].account).toBe("Bitcoin");
    expect(result[0].balance).toBe(0.65);
    expect(result[0].currency).toBe("BTC");
    expect(result[1].account).toBe("Cash");
    expect(result[1].balance).toBe(1234.56);
  });

  it("handles JSON wrapped in an object with 'balances' key", () => {
    const input = JSON.stringify({
      balances: [
        { account: "Savings", balance: 5000, currency: "USD", confidence: 0.9 },
      ],
    });
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe("Savings");
  });

  it("handles object with 'accounts' key", () => {
    const input = JSON.stringify({
      accounts: [
        { account: "BTC Wallet", balance: 1.5, currency: "BTC", confidence: 1 },
      ],
    });
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe("BTC Wallet");
  });

  it("handles object with 'data' key", () => {
    const input = JSON.stringify({
      data: [
        { account: "Checking", balance: 500, currency: "USD", confidence: 0.8 },
      ],
    });
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
  });

  it("strips Qwen thinking tags before parsing", () => {
    const input = `<think>Let me analyze this document...</think>${JSON.stringify([
      { account: "Test", balance: 100, currency: "USD", confidence: 1 },
    ])}`;
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe("Test");
  });

  it("defaults missing fields gracefully", () => {
    const input = JSON.stringify([{ name: "Account", amount: 42 }]);
    const result = parseExtractedBalances(input);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe("Account");
    expect(result[0].balance).toBe(42);
    expect(result[0].currency).toBe("USD");
    expect(result[0].confidence).toBe(0.5);
  });

  it("returns empty array for empty JSON array", () => {
    const result = parseExtractedBalances("[]");
    expect(result).toEqual([]);
  });

  it("throws on unparseable content", () => {
    expect(() => parseExtractedBalances("not json at all")).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/__tests__/ollama-parser.test.ts
```

Expected: FAIL — module not found

(Tests will pass after Task 8.)

---

### Task 8: Ollama provider

**Files:**
- Create: `src/lib/ai/ollama.ts`

- [ ] **Step 1: Implement the Ollama provider**

```typescript
// src/lib/ai/ollama.ts
import type { AIProvider, ExtractedBalance, ModelInfo } from "./types";
import { buildExtractionPrompt } from "./prompts";

export class OllamaProvider implements AIProvider {
  constructor(
    private endpoint: string,
    private model?: string | null
  ) {}

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.endpoint}/api/tags`);
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    const data = await res.json();
    return (data.models || [])
      .filter((m: any) => !m.details?.family?.includes("bert"))
      .map((m: any) => ({
        id: m.name as string,
        name: m.name as string,
        size: (m.details?.parameter_size as string) || undefined,
      }));
  }

  async healthCheck(): Promise<{ ok: boolean; model: string; error?: string }> {
    try {
      const models = await this.listModels();
      const model = this.model || selectBestModel(models);
      return { ok: true, model };
    } catch (e: any) {
      return { ok: false, model: "", error: e.message };
    }
  }

  async extractBalances(
    text: string,
    hints?: string
  ): Promise<ExtractedBalance[]> {
    const models = await this.listModels();
    const model = this.model || selectBestModel(models);
    const systemPrompt = buildExtractionPrompt(hints);

    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        format: "json",
        stream: false,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama extraction failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    const rawContent: string = data.message?.content || "";
    return parseExtractedBalances(rawContent);
  }
}

export function selectBestModel(models: ModelInfo[]): string {
  if (models.length === 0) throw new Error("No models installed on Ollama");

  const sorted = [...models].sort((a, b) => {
    return parseModelSize(b.size) - parseModelSize(a.size);
  });

  return sorted[0].id;
}

export function parseModelSize(size?: string): number {
  if (!size) return 0;
  const match = size.match(/([\d.]+)\s*(B|M|K)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === "B") return num * 1e9;
  if (unit === "M") return num * 1e6;
  if (unit === "K") return num * 1e3;
  return num;
}

export function parseExtractedBalances(content: string): ExtractedBalance[] {
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  const parsed = JSON.parse(cleaned);

  const arr: any[] = Array.isArray(parsed)
    ? parsed
    : parsed.balances || parsed.accounts || parsed.data || [];

  return arr.map((item: any) => ({
    account: String(item.account || item.name || "Unknown"),
    balance: Number(item.balance ?? item.amount ?? 0),
    currency: String(item.currency || "USD"),
    asOfDate: item.asOfDate || item.as_of_date || item.date || undefined,
    confidence: Number(item.confidence ?? 0.5),
    rawText: item.rawText || item.raw_text || undefined,
  }));
}
```

- [ ] **Step 2: Run the parser tests from Task 7**

```bash
pnpm vitest run src/lib/__tests__/ollama-parser.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/ollama.ts src/lib/__tests__/ollama-parser.test.ts
git commit -m "feat(ai): add Ollama provider with response parser"
```

---

### Task 9: AI provider factory

**Files:**
- Create: `src/lib/ai/index.ts`

- [ ] **Step 1: Create the factory**

```typescript
// src/lib/ai/index.ts
import { OllamaProvider } from "./ollama";
import type { AIProvider } from "./types";

const DEFAULT_ENDPOINT = "http://192.168.1.250:11434";

export function getAIProvider(settings?: {
  endpoint?: string;
  model?: string | null;
}): AIProvider {
  return new OllamaProvider(
    settings?.endpoint || DEFAULT_ENDPOINT,
    settings?.model
  );
}

export type { AIProvider, ExtractedBalance, ModelInfo } from "./types";
```

- [ ] **Step 2: Run all AI tests to make sure nothing broke**

```bash
pnpm vitest run src/lib/__tests__/prompts.test.ts src/lib/__tests__/fuzzy-match.test.ts src/lib/__tests__/ollama-parser.test.ts
```

Expected: PASS (all tests across all 3 files)

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/index.ts
git commit -m "feat(ai): add provider factory"
```

---

### Task 10: Zod validation schemas

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add Zod schemas for all new API routes**

Append at the end of the file, before the `parseBody` function:

```typescript
// ── AI Settings schemas ──

export const updateAiSettings = z.object({
  endpoint: z.string().url().optional(),
  model: z.string().nullable().optional(),
});

// ── AI Import schemas ──

export const importApplyRequest = z.object({
  sourceId: z.string().uuid().optional(),
  filename: z.string().min(1).max(500),
  saveSource: z
    .object({
      name: z.string().min(1).max(200),
      extractionHints: z.string().max(2000).optional(),
      fieldMappings: z.array(
        z.object({
          extractedKey: z.string(),
          assetId: z.string().uuid(),
          field: z.enum(["currentValue", "quantity"]),
          currency: z.string(),
        })
      ),
    })
    .optional(),
  updates: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        field: z.enum(["currentValue", "quantity"]),
        value: z.string(),
        currency: z.string().max(10).optional(),
      })
    )
    .min(1),
});

export const createImportSource = z.object({
  name: z.string().min(1).max(200),
  fileType: z.string().max(10).optional(),
  extractionHints: z.string().max(2000).optional(),
  fieldMappings: z.array(
    z.object({
      extractedKey: z.string(),
      assetId: z.string().uuid(),
      field: z.enum(["currentValue", "quantity"]),
      currency: z.string(),
    })
  ),
});

export const updateImportSource = z.object({
  name: z.string().min(1).max(200).optional(),
  extractionHints: z.string().max(2000).nullable().optional(),
  fieldMappings: z
    .array(
      z.object({
        extractedKey: z.string(),
        assetId: z.string().uuid(),
        field: z.enum(["currentValue", "quantity"]),
        currency: z.string(),
      })
    )
    .optional(),
});
```

- [ ] **Step 2: Verify the types file still compiles**

```bash
pnpm tsc --noEmit --pretty 2>&1 | head -20
```

Expected: no errors (or only pre-existing ones unrelated to our changes)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add Zod schemas for AI settings and import routes"
```

---

### Task 11: AI settings API routes

**Files:**
- Create: `src/app/api/settings/ai/route.ts`
- Create: `src/app/api/settings/ai/models/route.ts`
- Create: `src/app/api/settings/ai/test/route.ts`

- [ ] **Step 1: Create GET/PATCH settings route**

```typescript
// src/app/api/settings/ai/route.ts
import { db } from "@/lib/db";
import { aiSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  requireAuth,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, updateAiSettings } from "@/types";
import { getAIProvider } from "@/lib/ai";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const [settings] = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, user.id))
      .limit(1);

    const provider = getAIProvider(settings || undefined);
    const health = await provider.healthCheck();

    return jsonResponse({
      endpoint: settings?.endpoint || "http://192.168.1.250:11434",
      model: settings?.model || null,
      health,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, updateAiSettings);

    const [existing] = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, user.id))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(aiSettings)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(aiSettings.id, existing.id))
        .returning();
      return jsonResponse(updated);
    }

    const [created] = await db
      .insert(aiSettings)
      .values({ userId: user.id, ...body })
      .returning();
    return jsonResponse(created, 201);
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 2: Create models route**

```typescript
// src/app/api/settings/ai/models/route.ts
import { db } from "@/lib/db";
import { aiSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";
import { getAIProvider } from "@/lib/ai";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const [settings] = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, user.id))
      .limit(1);

    const provider = getAIProvider(settings || undefined);
    const models = await provider.listModels();

    return jsonResponse({ models });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 3: Create test route**

```typescript
// src/app/api/settings/ai/test/route.ts
import { db } from "@/lib/db";
import { aiSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";
import { getAIProvider } from "@/lib/ai";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const [settings] = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, user.id))
      .limit(1);

    const provider = getAIProvider(settings || undefined);
    const health = await provider.healthCheck();

    if (!health.ok) {
      return jsonResponse({ ok: false, error: health.error }, 503);
    }

    const testResult = await provider.extractBalances(
      "Account: Test Savings\nBalance: $1,234.56\nAs of: 2026-01-01"
    );

    return jsonResponse({ ok: true, model: health.model, testResult });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/settings/ai/
git commit -m "feat(api): add AI settings routes (GET/PATCH, models, test)"
```

---

### Task 12: Import extract route

**Files:**
- Create: `src/app/api/import/extract/route.ts`

- [ ] **Step 1: Create the extract route**

This route accepts multipart/form-data with a file, extracts text, sends to Ollama, and returns extracted balances with suggested asset mappings.

```typescript
// src/app/api/import/extract/route.ts
import { db } from "@/lib/db";
import {
  aiSettings,
  importSources,
  assets,
  sections,
  sheets,
  portfolios,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  jsonResponse,
  errorResponse,
  handleError,
} from "@/lib/api-helpers";
import { getAIProvider } from "@/lib/ai";
import { extractTextFromPdf } from "@/lib/ai/pdf-text";
import { suggestAssetMatch } from "@/lib/ai/fuzzy-match";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const formData = await request.formData();
    const file = formData.get("file");
    const sourceId = formData.get("sourceId") as string | null;
    const portfolioId = formData.get("portfolioId") as string | null;

    if (!file || !(file instanceof File)) {
      return errorResponse("No file provided", 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse("File too large. Maximum size is 10MB.", 413);
    }

    // Extract text
    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;

    const fileName = file.name.toLowerCase();
    if (file.type === "application/pdf" || fileName.endsWith(".pdf")) {
      text = await extractTextFromPdf(buffer);
    } else if (
      file.type === "text/csv" ||
      fileName.endsWith(".csv") ||
      file.type.startsWith("text/")
    ) {
      text = buffer.toString("utf-8");
    } else {
      return errorResponse(
        "Unsupported file type. Use PDF or CSV.",
        400
      );
    }

    if (!text.trim()) {
      return errorResponse(
        "Could not extract text from file. The document may be image-only.",
        422
      );
    }

    // Load AI settings
    const [settings] = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, user.id))
      .limit(1);

    // Check for saved source
    let matchedSource = null;
    if (sourceId) {
      const [source] = await db
        .select()
        .from(importSources)
        .where(
          and(
            eq(importSources.id, sourceId),
            eq(importSources.userId, user.id)
          )
        )
        .limit(1);
      matchedSource = source || null;
    }

    // Extract balances via AI
    const provider = getAIProvider(settings || undefined);
    const extracted = await provider.extractBalances(
      text,
      matchedSource?.extractionHints || undefined
    );

    // Load user's assets for fuzzy matching
    const userAssets = await db
      .select({
        id: assets.id,
        name: assets.name,
        currency: assets.currency,
        type: assets.type,
      })
      .from(assets)
      .innerJoin(sections, eq(assets.sectionId, sections.id))
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .innerJoin(portfolios, eq(sheets.portfolioId, portfolios.id))
      .where(
        and(
          eq(portfolios.userId, user.id),
          eq(assets.isArchived, false),
          portfolioId ? eq(portfolios.id, portfolioId) : undefined
        )
      );

    // Build suggested mappings
    const suggestedMappings = extracted.map((item) => {
      if (matchedSource) {
        const saved = matchedSource.fieldMappings.find(
          (m) =>
            m.extractedKey.toLowerCase() === item.account.toLowerCase()
        );
        if (saved) {
          const asset = userAssets.find((a) => a.id === saved.assetId);
          return {
            extractedKey: item.account,
            suggestedAssetId: saved.assetId,
            suggestedAssetName: asset?.name || null,
            confidence: 1.0,
            field: saved.field,
          };
        }
      }

      const match = suggestAssetMatch(
        item.account,
        item.currency,
        userAssets
      );
      return {
        extractedKey: item.account,
        suggestedAssetId: match?.assetId || null,
        suggestedAssetName: match?.assetName || null,
        confidence: match?.confidence || 0,
        field: null as "currentValue" | "quantity" | null,
      };
    });

    return jsonResponse({ extracted, matchedSource, suggestedMappings });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/import/extract/route.ts
git commit -m "feat(api): add import extract route (file upload -> AI extraction)"
```

---

### Task 13: Import apply route

**Files:**
- Create: `src/app/api/import/apply/route.ts`

- [ ] **Step 1: Create the apply route**

This route applies extracted balances to assets, creates snapshots, optionally saves the source mapping, and logs the import.

```typescript
// src/app/api/import/apply/route.ts
import { db } from "@/lib/db";
import {
  assets,
  assetSnapshots,
  importLogs,
  importSources,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  requireAssetOwnership,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, importApplyRequest } from "@/types";

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, importApplyRequest);

    // Verify ownership of all assets before transaction
    const assetMap = new Map<
      string,
      { asset: typeof assets.$inferSelect; portfolioId: string }
    >();
    for (const update of body.updates) {
      const data = await requireAssetOwnership(update.assetId, user.id);
      assetMap.set(update.assetId, data);
    }

    const today = new Date().toISOString().split("T")[0];
    const results: Array<{
      assetId: string;
      assetName: string;
      previousValue: string;
      newValue: string;
      field: string;
    }> = [];

    await db.transaction(async (tx) => {
      for (const update of body.updates) {
        const { asset } = assetMap.get(update.assetId)!;

        const previousValue =
          update.field === "quantity"
            ? asset.quantity || "0"
            : asset.currentValue;

        const setFields: Record<string, any> = {
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        };

        if (update.field === "quantity") {
          setFields.quantity = update.value;
          if (asset.currentPrice) {
            setFields.currentValue = String(
              Number(update.value) * Number(asset.currentPrice)
            );
          }
        } else {
          setFields.currentValue = update.value;
        }

        if (update.currency) {
          setFields.currency = update.currency;
        }

        await tx
          .update(assets)
          .set(setFields)
          .where(eq(assets.id, update.assetId));

        const snapshotValue = setFields.currentValue || asset.currentValue;

        await tx
          .insert(assetSnapshots)
          .values({
            assetId: update.assetId,
            date: today,
            value: snapshotValue,
            valueInBase: snapshotValue,
            price: asset.currentPrice,
            quantity: setFields.quantity || asset.quantity,
            source: "import",
          })
          .onConflictDoUpdate({
            target: [assetSnapshots.assetId, assetSnapshots.date],
            set: {
              value: snapshotValue,
              valueInBase: snapshotValue,
              price: asset.currentPrice,
              quantity: setFields.quantity || asset.quantity,
              source: "import",
            },
          });

        results.push({
          assetId: update.assetId,
          assetName: asset.name,
          previousValue,
          newValue:
            update.field === "quantity"
              ? update.value
              : setFields.currentValue || asset.currentValue,
          field: update.field,
        });
      }

      // Save source mapping if requested
      if (body.saveSource) {
        await tx.insert(importSources).values({
          userId: user.id,
          name: body.saveSource.name,
          extractionHints: body.saveSource.extractionHints,
          fieldMappings: body.saveSource.fieldMappings,
        });
      }

      // Update source lastUsedAt if sourceId provided
      if (body.sourceId) {
        await tx
          .update(importSources)
          .set({ lastUsedAt: new Date() })
          .where(
            and(
              eq(importSources.id, body.sourceId),
              eq(importSources.userId, user.id)
            )
          );
      }
    });

    // Log the import (outside transaction — non-critical)
    const [log] = await db
      .insert(importLogs)
      .values({
        sourceId: body.sourceId || null,
        userId: user.id,
        filename: body.filename,
        status: "success",
        appliedChanges: results,
      })
      .returning();

    return jsonResponse({ updated: results, logId: log.id });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/import/apply/route.ts
git commit -m "feat(api): add import apply route (update assets + create snapshots)"
```

---

### Task 14: Import sources CRUD routes

**Files:**
- Create: `src/app/api/import/sources/route.ts`
- Create: `src/app/api/import/sources/[id]/route.ts`

- [ ] **Step 1: Create list/create route**

```typescript
// src/app/api/import/sources/route.ts
import { db } from "@/lib/db";
import { importSources } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  requireAuth,
  jsonResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, createImportSource } from "@/types";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const sources = await db
      .select()
      .from(importSources)
      .where(eq(importSources.userId, user.id))
      .orderBy(desc(importSources.lastUsedAt));

    return jsonResponse(sources);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);
    const body = await parseBody(request, createImportSource);

    const [source] = await db
      .insert(importSources)
      .values({ userId: user.id, ...body })
      .returning();

    return jsonResponse(source, 201);
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 2: Create update/delete route**

```typescript
// src/app/api/import/sources/[id]/route.ts
import { db } from "@/lib/db";
import { importSources } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  validateUuid,
  jsonResponse,
  errorResponse,
  handleError,
} from "@/lib/api-helpers";
import { parseBody, updateImportSource } from "@/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "source ID");
    const body = await parseBody(request, updateImportSource);

    const [updated] = await db
      .update(importSources)
      .set({ ...body, updatedAt: new Date() })
      .where(
        and(eq(importSources.id, id), eq(importSources.userId, user.id))
      )
      .returning();

    if (!updated) return errorResponse("Source not found", 404);
    return jsonResponse(updated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "source ID");

    const [deleted] = await db
      .delete(importSources)
      .where(
        and(eq(importSources.id, id), eq(importSources.userId, user.id))
      )
      .returning();

    if (!deleted) return errorResponse("Source not found", 404);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/import/sources/
git commit -m "feat(api): add import sources CRUD routes"
```

---

### Task 15: Import logs routes

**Files:**
- Create: `src/app/api/import/logs/route.ts`
- Create: `src/app/api/import/logs/[id]/route.ts`

- [ ] **Step 1: Create list route**

```typescript
// src/app/api/import/logs/route.ts
import { db } from "@/lib/db";
import { importLogs, importSources } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";

export async function GET(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const logs = await db
      .select({
        id: importLogs.id,
        sourceId: importLogs.sourceId,
        sourceName: importSources.name,
        filename: importLogs.filename,
        status: importLogs.status,
        errorMessage: importLogs.errorMessage,
        appliedChanges: importLogs.appliedChanges,
        createdAt: importLogs.createdAt,
      })
      .from(importLogs)
      .leftJoin(importSources, eq(importLogs.sourceId, importSources.id))
      .where(eq(importLogs.userId, user.id))
      .orderBy(desc(importLogs.createdAt))
      .limit(50);

    return jsonResponse(logs);
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 2: Create detail route**

```typescript
// src/app/api/import/logs/[id]/route.ts
import { db } from "@/lib/db";
import { importLogs, importSources } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  validateUuid,
  jsonResponse,
  errorResponse,
  handleError,
} from "@/lib/api-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "log ID");

    const [log] = await db
      .select({
        id: importLogs.id,
        sourceId: importLogs.sourceId,
        sourceName: importSources.name,
        filename: importLogs.filename,
        status: importLogs.status,
        extractedData: importLogs.extractedData,
        appliedChanges: importLogs.appliedChanges,
        errorMessage: importLogs.errorMessage,
        createdAt: importLogs.createdAt,
      })
      .from(importLogs)
      .leftJoin(importSources, eq(importLogs.sourceId, importSources.id))
      .where(
        and(eq(importLogs.id, id), eq(importLogs.userId, user.id))
      )
      .limit(1);

    if (!log) return errorResponse("Import log not found", 404);
    return jsonResponse(log);
  } catch (error) {
    return handleError(error);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/import/logs/
git commit -m "feat(api): add import logs routes (list + detail)"
```

---

### Task 16: End-to-end verification

Verify the entire backend works by running the dev server and testing with curl. You need a valid session cookie — get one by logging in via the browser first, then copy it.

- [ ] **Step 1: Run all unit tests**

```bash
pnpm vitest run
```

Expected: all tests pass (existing + new)

- [ ] **Step 2: Start dev server (if not running)**

```bash
pnpm dev
```

- [ ] **Step 3: Test AI settings GET**

```bash
curl -s -b 'COOKIE' http://localhost:3000/api/settings/ai | python3 -m json.tool
```

Expected: returns `{ endpoint, model, health: { ok: true, model: "qwen3.5:122b" } }`

- [ ] **Step 4: Test models list**

```bash
curl -s -b 'COOKIE' http://localhost:3000/api/settings/ai/models | python3 -m json.tool
```

Expected: returns `{ models: [ { id: "qwen3.5:122b", ... }, ... ] }`

- [ ] **Step 5: Test AI health check with extraction**

```bash
curl -s -X POST -b 'COOKIE' http://localhost:3000/api/settings/ai/test | python3 -m json.tool
```

Expected: returns `{ ok: true, model: "qwen3.5:122b", testResult: [...] }` with at least one extracted balance from the test text.

- [ ] **Step 6: Test extract with a CSV**

Create a test CSV file, then upload:

```bash
echo 'Account,Balance,Currency
Bitcoin,0.65,BTC
USD Cash,1234.56,USD' > /tmp/test-statement.csv

curl -s -X POST -b 'COOKIE' \
  -F "file=@/tmp/test-statement.csv" \
  http://localhost:3000/api/import/extract | python3 -m json.tool
```

Expected: returns extracted balances and suggested mappings against your real assets.

- [ ] **Step 7: Test import sources CRUD**

```bash
# Create
curl -s -X POST -b 'COOKIE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Source","fieldMappings":[]}' \
  http://localhost:3000/api/import/sources | python3 -m json.tool

# List
curl -s -b 'COOKIE' http://localhost:3000/api/import/sources | python3 -m json.tool

# Delete (use the id from create response)
curl -s -X DELETE -b 'COOKIE' http://localhost:3000/api/import/sources/REPLACE_ID | python3 -m json.tool
```

- [ ] **Step 8: Test import logs**

```bash
curl -s -b 'COOKIE' http://localhost:3000/api/import/logs | python3 -m json.tool
```

Expected: returns empty array or previous import logs.

- [ ] **Step 9: Final commit if any adjustments were made**

```bash
git add -p  # review changes carefully
git commit -m "fix: adjustments from end-to-end verification"
```

---

## Part 2 Handoff

After Part 1 is complete and verified, start a new session for Part 2 (Frontend). Hand the agent the following prompt:

---

**Prompt for Part 2 agent:**

> I'm building the frontend for the AI Document Import feature in Summa. The backend is complete on the `feat/ai-import` branch — schema, AI extraction layer (Ollama), and all API routes are working.
>
> Read the design spec at `docs/superpowers/specs/2026-05-03-ai-document-import-design.md` and the Part 1 plan at `docs/superpowers/plans/2026-05-04-ai-import-part1-backend.md` for full context.
>
> **What needs building (all on the `feat/ai-import` branch):**
>
> 1. **Zustand store** — add `importDialogOpen` / `openImportDialog` / `closeImportDialog` to `src/stores/ui-store.ts`
> 2. **TanStack Query hooks** — `src/hooks/use-ai-settings.ts`, `src/hooks/use-import.ts`, `src/hooks/use-import-sources.ts` (follow existing hook patterns in `src/hooks/use-brokerage-import.ts` and `src/hooks/use-assets.ts`)
> 3. **Import dialog wizard** — multi-step dialog in `src/components/import/`:
>    - `import-dialog.tsx` (wrapper, manages step state)
>    - `upload-step.tsx` (drag-drop zone + recent sources list)
>    - `extraction-step.tsx` (loading/progress indicator)
>    - `mapping-step.tsx` (map extracted accounts to Summa assets with dropdowns)
>    - `confirmation-step.tsx` (review table: asset, current value, new value, change)
>    - `success-step.tsx` (done state with summary)
> 4. **AI settings component** — `src/components/settings/ai-settings.tsx` (endpoint field, model dropdown, test button, status indicator)
> 5. **Settings page** — add AI Provider card and Import History link to `src/app/(app)/settings/page.tsx`
> 6. **Import history page** — `src/app/(app)/settings/imports/page.tsx` (table of past imports)
> 7. **Toolbar integration** — add "Import Document" to the More menu in `src/components/toolbar-actions.tsx`
>
> **API endpoints available:**
> - `GET/PATCH /api/settings/ai` — Ollama config + health
> - `GET /api/settings/ai/models` — available models
> - `POST /api/settings/ai/test` — health check + test extraction
> - `POST /api/import/extract` — multipart form: `file` + optional `sourceId`, `portfolioId`
> - `POST /api/import/apply` — JSON: `{ filename, updates[], sourceId?, saveSource? }`
> - `GET/POST /api/import/sources` + `PATCH/DELETE /api/import/sources/[id]`
> - `GET /api/import/logs` + `GET /api/import/logs/[id]`
>
> **Patterns to follow:**
> - UI: shadcn/ui components (`Dialog`, `Button`, `Input`, `Card`, `DropdownMenu`, etc.) + Lucide icons
> - State: Zustand `useUIStore` for dialog open/close (see `src/stores/ui-store.ts`)
> - Mutations: dedicated hook files with TanStack Query (see `src/hooks/use-brokerage-import.ts`)
> - Toasts: `sonner` (`toast.success()`, `toast.error()`)
> - After applying import: `queryClient.invalidateQueries({ queryKey: ["portfolio"] })`
>
> Please write an implementation plan, then execute it. Make sure to start the dev server and test the UI in a browser before reporting done.
