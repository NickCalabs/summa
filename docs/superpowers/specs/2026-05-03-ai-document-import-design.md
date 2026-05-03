# AI Document Import — Design Spec

> Drop a PDF/CSV from any financial institution. Ollama extracts balances via text analysis. Map to Summa assets. One click to update. Nothing leaves the LAN.

## Problem

Some financial accounts can't connect via Plaid or SimpleFIN (e.g., River.com, smaller crypto exchanges, foreign banks, private equity portals). Users export statements manually and type values into Summa by hand. This feature automates extraction.

## Core Principle

**Balance extraction, not transaction import.** The AI answers: "What are the current balances in this document?" One document -> N balance updates -> done.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AI provider | Ollama only | Sovereign stack, data stays on LAN |
| Ollama endpoint | `http://192.168.1.250:11434` | Dedicated server on local network |
| PDF handling | Text extraction via `pdfjs-dist` | No vision model needed; financial exports are digital PDFs with extractable text |
| Default model | Auto-detect largest available (currently qwen3.5:122b) | Best accuracy for structured extraction |
| UI entry point | "Import Document" in toolbar More menu | Matches existing import patterns (CSV, Kubera) |
| AI settings storage | Minimal DB table (endpoint + model) | Allows model switching from UI without restart |
| Snapshot source enum | Already has "import" | No migration needed for this |

## User Flow

### First-Time Import (new source)

1. User opens More menu -> clicks "Import Document"
2. Drag-drop zone appears -> user drops River.com PDF
3. Loading: "Extracting balances..." (text extracted from PDF, sent to Ollama)
4. AI returns extracted accounts with suggested asset mappings:
   - Each extracted account shows: label, balance, currency
   - Dropdown to map to existing Summa asset (fuzzy-matched, best first)
   - Options: existing assets, "Create new asset...", "Skip this account"
   - Editable source name field (auto-filled from filename)
   - Checkbox: "Save this mapping for future imports"
5. User confirms mappings -> clicks "Review Changes"
6. Confirmation table: asset name, current value, new value, change (absolute + percentage)
7. Apply -> PATCH each asset -> create snapshot -> toast "Updated N assets"

### Repeat Import (saved source)

1. User drops another River PDF
2. System matches against saved source mappings via source name + extracted keys
3. Skips mapping step -> straight to confirmation table
4. Apply -> done in 2 clicks

## Schema Changes

### New table: `import_sources`

Stores saved mappings for repeat imports.

```
import_sources
  id            uuid PK default random
  user_id       uuid FK -> users.id ON DELETE CASCADE
  name          text NOT NULL                          -- "River.com"
  file_type     text                                   -- "pdf", "csv" (informational)
  extraction_hints  text                               -- custom instructions appended to AI prompt
  field_mappings    jsonb NOT NULL default '[]'         -- Array<FieldMapping>
  last_used_at  timestamp
  created_at    timestamp NOT NULL default now()
  updated_at    timestamp NOT NULL default now()
```

`FieldMapping` shape:
```typescript
{
  extractedKey: string       // "Bitcoin" — label AI extracted
  assetId: string            // UUID of Summa asset to update
  field: "currentValue" | "quantity"
  currency: string           // "BTC", "USD"
}
```

### New table: `import_logs`

Audit trail for every import attempt.

```
import_logs
  id              uuid PK default random
  source_id       uuid FK -> import_sources.id ON DELETE SET NULL
  user_id         uuid FK -> users.id ON DELETE CASCADE
  filename        text NOT NULL
  status          text NOT NULL                        -- "success" | "partial" | "failed"
  extracted_data  jsonb                                -- raw AI output for debugging
  applied_changes jsonb                                -- Array<AppliedChange>
  error_message   text
  created_at      timestamp NOT NULL default now()
```

`AppliedChange` shape:
```typescript
{
  assetId: string
  assetName: string
  previousValue: string
  newValue: string
  field: string
}
```

### New table: `ai_settings`

Minimal Ollama configuration. One row per user.

```
ai_settings
  id          uuid PK default random
  user_id     uuid UNIQUE FK -> users.id ON DELETE CASCADE
  endpoint    text NOT NULL default 'http://192.168.1.250:11434'
  model       text                                     -- null = auto-detect best available
  created_at  timestamp NOT NULL default now()
  updated_at  timestamp NOT NULL default now()
```

## AI Extraction Layer

### Architecture

```
src/lib/ai/
  types.ts          -- AIProvider interface, ExtractedBalance type
  ollama.ts         -- Ollama provider implementation
  prompts.ts        -- extraction system prompt builder
  pdf-text.ts       -- PDF -> text extraction using pdfjs-dist
  fuzzy-match.ts    -- suggest asset matches by name/currency similarity
  index.ts          -- getAIProvider(settings) factory
```

### Types

```typescript
interface AIProvider {
  extractBalances(text: string, hints?: string): Promise<ExtractedBalance[]>
  listModels(): Promise<ModelInfo[]>
  healthCheck(): Promise<{ ok: boolean; model: string; error?: string }>
}

interface ExtractedBalance {
  account: string        // "Bitcoin", "USD Cash", "Savings Account"
  balance: number        // 0.65, 1234.56
  currency: string       // "BTC", "USD"
  asOfDate?: string      // statement date if extractable
  confidence: number     // 0-1
  rawText?: string       // source text context
}

interface ModelInfo {
  id: string             // "qwen3.5:122b"
  name: string           // "qwen3.5:122b"
  size?: string          // "125.1B"
}
```

### Document Processing Pipeline

1. **PDF**: `pdfjs-dist` extracts text from all pages -> concatenated string
2. **CSV**: Read as UTF-8 text directly
3. **Text + system prompt** -> `POST {endpoint}/api/chat` with chosen model
4. **Parse JSON** from model response -> `ExtractedBalance[]`
5. **Fuzzy match** each extracted account against existing assets

### Ollama Provider

Calls Ollama HTTP API:
- `GET /api/tags` — list models
- `POST /api/chat` — send extraction prompt + document text, parse JSON response

Model auto-selection: pick the model with the largest parameter count from installed models (excluding embedding models like nomic-embed-text).

### Extraction Prompt

```
You are a financial document parser. Extract all account balances from this document.

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
- If the document contains no financial data, return an empty array []

{optional extraction hints appended here}
```

### Fuzzy Matching

Match extracted account names to existing Summa assets:

1. Exact name match (case-insensitive) -> confidence 1.0
2. Currency match + name substring -> confidence 0.8 (e.g., extracted "Bitcoin" matches "River Bitcoin")
3. Levenshtein distance < 3 -> confidence 0.6
4. No match -> null (user picks manually)

No external dependency needed — simple string distance implementation.

## API Routes

All routes follow existing patterns: `requireAuth(request)`, Zod validation, `jsonResponse`/`errorResponse`.

### AI Settings

```
GET    /api/settings/ai           -> current config + health check
PATCH  /api/settings/ai           -> update endpoint/model
GET    /api/settings/ai/models    -> list installed Ollama models
POST   /api/settings/ai/test      -> health check + optional test extraction
```

### Import Execution

```
POST   /api/import/extract
  Body: multipart/form-data { file, sourceId? }
  Response: {
    extracted: ExtractedBalance[],
    matchedSource: ImportSource | null,
    suggestedMappings: Array<{
      extractedKey: string,
      suggestedAssetId: string | null,
      suggestedAssetName: string | null,
      confidence: number
    }>
  }

POST   /api/import/apply
  Body: {
    sourceId?: string,
    saveSource?: { name: string, extractionHints?: string },
    updates: Array<{
      assetId: string,
      field: "currentValue" | "quantity",
      value: string,
      currency?: string
    }>
  }
  Response: {
    updated: Array<{ assetId: string, previousValue: string, newValue: string }>,
    logId: string
  }
```

### Import Sources

```
GET    /api/import/sources              -> list saved sources
POST   /api/import/sources              -> create source
PATCH  /api/import/sources/[id]         -> update source
DELETE /api/import/sources/[id]         -> delete source
```

### Import Logs

```
GET    /api/import/logs                 -> list past imports
GET    /api/import/logs/[id]            -> import detail
```

## Apply Logic

When user clicks "Apply Now":

1. For each update:
   a. Read current asset value
   b. If `field === "quantity"`: update quantity, recalculate currentValue from currentPrice if available
   c. If `field === "currentValue"`: update currentValue directly
   d. Set `lastSyncedAt` to now
   e. Upsert asset snapshot for today with `source: "import"`
   f. Convert to base currency using cached exchange rates for `valueInBase`
2. Log the import to `import_logs` with status and all applied changes
3. If `saveSource` provided, create/update `import_sources` record
4. Client-side: invalidate portfolio queries so dashboard refreshes

## Frontend Components

### New Files

```
src/components/import/import-dialog.tsx       -- multi-step wizard (Zustand-managed)
src/components/import/upload-step.tsx         -- drag-drop + recent sources
src/components/import/extraction-step.tsx     -- loading/progress state
src/components/import/mapping-step.tsx        -- first-time account mapping
src/components/import/confirmation-step.tsx   -- review changes table
src/components/import/success-step.tsx        -- done state

src/components/settings/ai-settings.tsx       -- Ollama config UI on settings page

src/app/(app)/settings/imports/page.tsx       -- import history page

src/hooks/use-ai-settings.ts                 -- TanStack Query for Ollama config
src/hooks/use-import.ts                      -- TanStack mutations for extract/apply
src/hooks/use-import-sources.ts              -- TanStack Query for saved sources
```

### Modified Files

```
src/lib/db/schema.ts                         -- add 3 new tables
src/components/toolbar-actions.tsx            -- add "Import Document" to More menu
src/app/(app)/settings/page.tsx              -- add AI Provider section + Import History link
src/stores/ui-store.ts                       -- add importDialogOpen state
```

### Dialog Pattern

Follows existing Zustand-managed dialog pattern (like AddFlowDialog):
- `useUIStore` gets `importDialogOpen` / `openImportDialog` / `closeImportDialog`
- Dialog manages internal step state: "upload" | "extracting" | "mapping" | "confirmation" | "success"
- Back button support between steps
- Close resets all state

### Settings Section

Minimal card on settings page:
- Endpoint text field (default: `http://192.168.1.250:11434`)
- Model dropdown (populated from `GET /api/settings/ai/models`)
- Connection status indicator
- Test button

## New Dependencies

- `pdfjs-dist` — PDF text extraction (no native deps, pure JS)

No other new dependencies. Ollama HTTP calls use native `fetch`.

## Implementation Phasing

### Part 1 — Backend

Schema migrations, AI extraction layer, all API routes. Testable with curl.

Branch: `feat/ai-import`

Files:
- `src/lib/db/schema.ts` (modify)
- `src/lib/ai/*` (new: types, ollama, prompts, pdf-text, fuzzy-match, index)
- `src/app/api/settings/ai/*` (new)
- `src/app/api/import/extract/route.ts` (new)
- `src/app/api/import/apply/route.ts` (new)
- `src/app/api/import/sources/*` (new)
- `src/app/api/import/logs/*` (new)
- Drizzle migration

### Part 2 — Frontend

Import dialog wizard, AI settings UI, import history, hooks, toolbar integration.

Branch: continues on `feat/ai-import`

Files:
- `src/components/import/*` (new)
- `src/components/settings/ai-settings.tsx` (new)
- `src/app/(app)/settings/imports/page.tsx` (new)
- `src/hooks/use-ai-settings.ts` (new)
- `src/hooks/use-import.ts` (new)
- `src/hooks/use-import-sources.ts` (new)
- `src/stores/ui-store.ts` (modify)
- `src/components/toolbar-actions.tsx` (modify)
- `src/app/(app)/settings/page.tsx` (modify)

## Out of Scope

- Transaction import (balance extraction only)
- Scheduled/automated imports
- In-app AI chat agent
- Custom per-institution parsers
- Screenshot/image optimization (could add vision model later)
- OpenAI/Anthropic providers (interface supports adding later)
