# Display Currency Switcher (USD / BTC / sats) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user view the entire Summa portfolio in USD, BTC, or sats — re-denominating all charts, stats, totals, and asset rows — with historical BTC/USD rates stored per snapshot.

**Architecture:** New `btcUsdRate` column on `portfolio_snapshots` populated by the daily cron via CryptoCompare. A `DisplayCurrencyContext` provides conversion + formatting to all components. The existing `convertCurrency` function gets BTC added to its rates map server-side (fixing the 0.1 BTC = $0.10 bug). Sats is a display formatter on BTC, not a separate currency.

**Tech Stack:** Next.js 15, Drizzle ORM, PostgreSQL, React context, Recharts, Vitest

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/db/schema.ts` | Add `btcUsdRate` column to `portfolioSnapshots` |
| Modify | `src/hooks/use-snapshots.ts` | Add `btcUsdRate` to `PortfolioSnapshot` type |
| Create | `src/lib/providers/cryptocompare.ts` | CryptoCompare BTC/USD fetcher (cron + API) |
| Modify | `src/lib/snapshots.ts` | Write `btcUsdRate` into snapshot rows |
| Modify | `src/app/api/portfolios/[id]/route.ts` | Merge BTC rate into the rates map response |
| Modify | `src/lib/__tests__/currency.test.ts` | Add BTC conversion unit tests |
| Create | `src/contexts/display-currency-context.tsx` | DisplayCurrency context + provider + hook |
| Modify | `src/components/portfolio/portfolio-view.tsx` | Wrap with `DisplayCurrencyProvider` |
| Modify | `src/components/dashboard/dashboard-view.tsx` | Wrap with `DisplayCurrencyProvider`, wire btcUsdRate |
| Create | `src/components/portfolio/display-currency-dropdown.tsx` | Top-bar USD/BTC/sats selector |
| Modify | `src/components/portfolio/top-bar.tsx` | Add dropdown to top bar |
| Modify | `src/components/portfolio/money-display.tsx` | Add display-currency-aware formatting |
| Modify | `src/components/charts/net-worth-chart.tsx` | Convert snapshot values via display currency |
| Modify | `src/components/charts/assets-debts-chart.tsx` | Convert snapshot values via display currency |
| Modify | `src/components/dashboard/recap-sankey-chart.tsx` | Convert live values via display currency |
| Modify | `src/components/dashboard/allocation-chart.tsx` | Convert live values via display currency |
| Modify | `src/components/dashboard/stats-cards.tsx` | Display-currency-aware amounts |
| Modify | `src/components/dashboard/change-indicator.tsx` | Display-currency-aware amounts |
| Modify | `src/components/portfolio/net-worth-header.tsx` | Display-currency-aware amounts |
| Modify | `src/components/portfolio/sheet-total-header.tsx` | Display-currency-aware amounts |
| Modify | `src/components/portfolio/sheet-summary-row.tsx` | Display-currency-aware totals |
| Modify | `src/components/portfolio/section-header.tsx` | Display-currency-aware totals |
| Modify | `src/components/portfolio/asset-table.tsx` | Display-currency-aware values |
| Modify | `src/components/portfolio/detail-panel.tsx` | Display-currency-aware values |
| Modify | `src/lib/chart-utils.ts` | Add BTC/sats-aware compact formatter |

---

### Task 1: Schema Migration — Add `btcUsdRate` to Portfolio Snapshots

**Files:**
- Modify: `src/lib/db/schema.ts:216-234`

- [ ] **Step 1: Add `btcUsdRate` column to the schema definition**

In `src/lib/db/schema.ts`, add one line to the `portfolioSnapshots` table:

```ts
btcUsdRate: numeric("btc_usd_rate", { precision: 20, scale: 2 }),
```

Add it after the `investableTotal` line (line 228), before `createdAt`.

- [ ] **Step 2: Generate the migration**

Run: `cd /opt/summa && pnpm db:generate`
Expected: A new migration file in `drizzle/` with `ALTER TABLE portfolio_snapshots ADD COLUMN btc_usd_rate numeric(20,2)`

- [ ] **Step 3: Apply the migration**

Run: `cd /opt/summa && pnpm db:migrate`
Expected: Migration applied successfully

- [ ] **Step 4: Add `btcUsdRate` to the `PortfolioSnapshot` TypeScript type**

In `src/hooks/use-snapshots.ts`, add to the `PortfolioSnapshot` interface:

```ts
btcUsdRate: string | null;
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/hooks/use-snapshots.ts drizzle/
git commit -m "schema: add btc_usd_rate column to portfolio_snapshots"
```

---

### Task 2: CryptoCompare BTC/USD Fetcher

**Files:**
- Create: `src/lib/providers/cryptocompare.ts`

- [ ] **Step 1: Create the CryptoCompare provider**

Create `src/lib/providers/cryptocompare.ts`:

```ts
import { TtlCache } from "@/lib/providers/rate-limit-cache";

const cache = new TtlCache<number>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getCurrentBtcUsd(): Promise<number | null> {
  const cached = cache.get("btc-usd");
  if (cached != null) return cached;

  try {
    const res = await fetch(
      "https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD"
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data.USD;
    if (typeof rate !== "number" || rate <= 0) return null;
    cache.set("btc-usd", rate, TTL_MS);
    return rate;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/providers/cryptocompare.ts
git commit -m "feat: add CryptoCompare BTC/USD rate fetcher"
```

---

### Task 3: Snapshot Cron Writes `btcUsdRate`

**Files:**
- Modify: `src/lib/snapshots.ts:1-169`

- [ ] **Step 1: Import the fetcher and write btcUsdRate into snapshot rows**

In `src/lib/snapshots.ts`:

1. Add import at the top:
```ts
import { getCurrentBtcUsd } from "@/lib/providers/cryptocompare";
```

2. Inside `takePortfolioSnapshot`, after computing `netWorth` (around line 139) and before the upsert, fetch the rate:
```ts
const btcUsdRate = await getCurrentBtcUsd();
```

3. In the `.values()` call (line 144), add:
```ts
btcUsdRate: btcUsdRate != null ? btcUsdRate.toFixed(2) : null,
```

4. In the `.onConflictDoUpdate` `set:` (line 155), add:
```ts
btcUsdRate: btcUsdRate != null ? btcUsdRate.toFixed(2) : undefined,
```

Use `undefined` (not the SQL fallback) in the conflict update — if CryptoCompare is down during a re-snapshot, we don't want to overwrite a good rate with null. Drizzle omits `undefined` fields from the SET clause.

- [ ] **Step 2: Commit**

```bash
git add src/lib/snapshots.ts
git commit -m "feat: snapshot cron writes btc_usd_rate from CryptoCompare"
```

---

### Task 4: BTC Conversion Tests + Bug Fix

**Files:**
- Modify: `src/lib/__tests__/currency.test.ts`
- Modify: `src/app/api/portfolios/[id]/route.ts`

- [ ] **Step 1: Write failing BTC conversion tests**

Add to `src/lib/__tests__/currency.test.ts`:

```ts
describe("BTC conversion", () => {
  // BTC rate: 1 USD = 1/65000 BTC ≈ 0.00001538 BTC
  const btcRates: Record<string, number> = { EUR: 0.92, GBP: 0.79, BTC: 1 / 65000 };

  it("converts 0.1 BTC to USD (the pre-existing bug)", () => {
    // 0.1 BTC → USD: 0.1 / (1/65000) = 6500
    expect(convertCurrency(0.1, "BTC", "USD", btcRates, "USD")).toBeCloseTo(6500, 0);
  });

  it("converts 6500 USD to BTC", () => {
    // 6500 USD → BTC: 6500 * (1/65000) = 0.1
    expect(convertCurrency(6500, "USD", "BTC", btcRates, "USD")).toBeCloseTo(0.1, 6);
  });

  it("converts BTC to EUR cross-rate", () => {
    // 0.1 BTC → USD → EUR = (0.1 / (1/65000)) * 0.92 = 5980
    expect(convertCurrency(0.1, "BTC", "EUR", btcRates, "USD")).toBeCloseTo(5980, 0);
  });

  it("convertToBase handles BTC → USD", () => {
    // 0.1 BTC → USD = 0.1 / (1/65000) = 6500
    expect(convertToBase(0.1, "BTC", "USD", btcRates)).toBeCloseTo(6500, 0);
  });
});
```

- [ ] **Step 2: Run tests — they should PASS already**

The math in `convertCurrency` already works correctly — the bug was that BTC was missing from the rates map, not that the conversion logic was wrong.

Run: `cd /opt/summa && pnpm exec vitest run src/lib/__tests__/currency.test.ts`
Expected: All tests pass (the conversion logic is correct; the bug is that BTC was never in the rates map)

- [ ] **Step 3: Merge BTC into the rates map in the portfolio API**

In `src/app/api/portfolios/[id]/route.ts`:

1. Add import:
```ts
import { getCurrentBtcUsd } from "@/lib/providers/cryptocompare";
```

2. After the rates are fetched (around line 143-145), always merge BTC:
```ts
// Always merge BTC rate so convertCurrency works for crypto assets
const btcUsdRate = await getCurrentBtcUsd();
if (btcUsdRate) {
  rates.BTC = 1 / btcUsdRate;
}
```

Note: change `const rates` to `let rates` and always initialize it (not just when hasMixedCurrencies), since we always want BTC in the map. Replace lines 140-145:

```ts
const rates: Record<string, number> = hasMixedCurrencies
  ? await getExchangeRates(portfolio.currency)
  : {};

// Always include BTC so crypto assets convert correctly
const btcUsdRate = await getCurrentBtcUsd();
if (btcUsdRate) {
  rates.BTC = 1 / btcUsdRate;
}
```

3. Also add `btcUsdRate` to the response so the frontend has today's rate for live conversions:
```ts
return jsonResponse({
  ...portfolio,
  sheets: tree,
  rates,
  ratesBase: portfolio.currency,
  btcUsdRate: btcUsdRate ?? null,
  aggregates: { ... },
});
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/__tests__/currency.test.ts src/app/api/portfolios/[id]/route.ts
git commit -m "fix: include BTC in rates map — fixes 0.1 BTC = \$0.10 bug"
```

---

### Task 5: DisplayCurrencyContext

**Files:**
- Create: `src/contexts/display-currency-context.tsx`

- [ ] **Step 1: Create the context**

Create `src/contexts/display-currency-context.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type DisplayCurrency = "USD" | "BTC" | "sats";

interface DisplayCurrencyContextValue {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (c: DisplayCurrency) => void;
  /** Convert a USD amount to display currency using a given BTC/USD rate */
  convert: (usdAmount: number, btcUsdRate: number | null) => number;
  /** Format a value already in display currency for display */
  format: (displayValue: number) => string;
  /** Format a compact value (for chart axes) */
  formatCompact: (displayValue: number) => string;
}

const STORAGE_KEY = "summa-display-currency";
const Ctx = createContext<DisplayCurrencyContextValue | null>(null);

export function DisplayCurrencyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [displayCurrency, setState] = useState<DisplayCurrency>("USD");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as DisplayCurrency | null;
      if (stored === "USD" || stored === "BTC" || stored === "sats") {
        setState(stored);
      }
    } catch {}
  }, []);

  const setDisplayCurrency = (c: DisplayCurrency) => {
    setState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {}
  };

  const convert = (usd: number, btcUsdRate: number | null) => {
    if (displayCurrency === "USD" || !btcUsdRate) return usd;
    const btc = usd / btcUsdRate;
    return displayCurrency === "sats" ? btc * 1e8 : btc;
  };

  const format = (val: number) => {
    if (displayCurrency === "USD") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(val);
    }
    if (displayCurrency === "BTC") {
      return `\u20bf${val >= 1 ? val.toFixed(4) : val.toFixed(6)}`;
    }
    // sats
    return `${Math.round(val).toLocaleString("en-US")} sats`;
  };

  const formatCompact = (val: number) => {
    if (displayCurrency === "USD") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(val);
    }
    if (displayCurrency === "BTC") {
      if (Math.abs(val) >= 1) return `\u20bf${val.toFixed(2)}`;
      return `\u20bf${val.toFixed(4)}`;
    }
    // sats
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Math.round(val)) + " sats";
  };

  return (
    <Ctx value={{
      displayCurrency,
      setDisplayCurrency,
      convert,
      format,
      formatCompact,
    }}>
      {children}
    </Ctx>
  );
}

export function useDisplayCurrency() {
  const v = useContext(Ctx);
  if (!v)
    throw new Error(
      "useDisplayCurrency must be used inside DisplayCurrencyProvider"
    );
  return v;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/contexts/display-currency-context.tsx
git commit -m "feat: add DisplayCurrencyContext for USD/BTC/sats switching"
```

---

### Task 6: Wire DisplayCurrencyProvider into App + Add btcUsdRate to Portfolio Type

**Files:**
- Modify: `src/components/portfolio/portfolio-view.tsx`
- Modify: `src/components/dashboard/dashboard-view.tsx`
- Modify: `src/hooks/use-portfolio.ts` (add `btcUsdRate` to the Portfolio type)

- [ ] **Step 1: Add `btcUsdRate` to the Portfolio type**

Find the `Portfolio` type/interface in `src/hooks/use-portfolio.ts`. Add:
```ts
btcUsdRate: number | null;
```

- [ ] **Step 2: Wrap portfolio-view.tsx with DisplayCurrencyProvider**

In `src/components/portfolio/portfolio-view.tsx`:

1. Add import:
```tsx
import { DisplayCurrencyProvider } from "@/contexts/display-currency-context";
```

2. Wrap the return JSX — put `DisplayCurrencyProvider` just inside the `CurrencyProvider`:
```tsx
<CurrencyProvider baseCurrency={portfolio.currency} rates={portfolio.rates ?? {}}>
  <DisplayCurrencyProvider>
    {/* ...existing content... */}
  </DisplayCurrencyProvider>
</CurrencyProvider>
```

- [ ] **Step 3: Wrap dashboard-view.tsx with DisplayCurrencyProvider**

In `src/components/dashboard/dashboard-view.tsx`:

1. Add import:
```tsx
import { DisplayCurrencyProvider } from "@/contexts/display-currency-context";
```

2. Wrap the returned JSX at the top level (around line 104's `<div className="relative">`):
```tsx
<DisplayCurrencyProvider>
  <div className="relative">
    {/* ...existing content... */}
  </div>
</DisplayCurrencyProvider>
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-portfolio.ts src/components/portfolio/portfolio-view.tsx src/components/dashboard/dashboard-view.tsx
git commit -m "feat: wire DisplayCurrencyProvider into portfolio and dashboard views"
```

---

### Task 7: Display Currency Dropdown in Top Bar

**Files:**
- Create: `src/components/portfolio/display-currency-dropdown.tsx`
- Modify: `src/components/portfolio/top-bar.tsx`

- [ ] **Step 1: Create the dropdown component**

Create `src/components/portfolio/display-currency-dropdown.tsx`:

```tsx
"use client";

import {
  useDisplayCurrency,
  type DisplayCurrency,
} from "@/contexts/display-currency-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon } from "lucide-react";

const OPTIONS: { value: DisplayCurrency; label: string }[] = [
  { value: "USD", label: "USD" },
  { value: "BTC", label: "BTC" },
  { value: "sats", label: "sats" },
];

export function DisplayCurrencyDropdown() {
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1 font-mono text-xs">
            {displayCurrency}
            <ChevronDownIcon className="size-3" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => setDisplayCurrency(opt.value)}
            className={opt.value === displayCurrency ? "font-semibold" : ""}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Add dropdown to top-bar.tsx**

In `src/components/portfolio/top-bar.tsx`:

1. Add import:
```tsx
import { DisplayCurrencyDropdown } from "./display-currency-dropdown";
```

2. Place the dropdown in the toolbar area, right before the eye/mask toggle button (before line 161):
```tsx
<DisplayCurrencyDropdown />
```

- [ ] **Step 3: Also add to dashboard-view.tsx header**

In `src/components/dashboard/dashboard-view.tsx`, add the dropdown near the "Base currency USD" text (around line 141-143). Replace:
```tsx
<span className="text-muted-foreground">
  Base currency {portfolio.currency}
</span>
```
with:
```tsx
<DisplayCurrencyDropdown />
```

Import it:
```tsx
import { DisplayCurrencyDropdown } from "@/components/portfolio/display-currency-dropdown";
```

- [ ] **Step 4: Commit**

```bash
git add src/components/portfolio/display-currency-dropdown.tsx src/components/portfolio/top-bar.tsx src/components/dashboard/dashboard-view.tsx
git commit -m "feat: add USD/BTC/sats display currency dropdown to top bar"
```

---

### Task 8: MoneyDisplay + Chart Utils — Display Currency Awareness

**Files:**
- Modify: `src/components/portfolio/money-display.tsx`
- Modify: `src/lib/chart-utils.ts`

The `MoneyDisplay` component is used everywhere. Instead of modifying every call site to pass converted values, we make `MoneyDisplay` optionally display-currency-aware. It gains an optional `btcUsdRate` prop — when provided AND display currency is non-USD, it converts and reformats.

- [ ] **Step 1: Update MoneyDisplay**

In `src/components/portfolio/money-display.tsx`:

1. Add import:
```tsx
import { useDisplayCurrency } from "@/contexts/display-currency-context";
```

2. Add optional `btcUsdRate` prop to `MoneyDisplayProps`:
```ts
btcUsdRate?: number | null;
```

3. Inside the component, before the return, add:
```tsx
const dc = useDisplayCurrency();
```

4. Replace the `masked` and render logic. The key change: when `btcUsdRate` is provided and display currency is non-USD, convert and use the display currency format. Replace the bottom of the function (from the `masked` line to the return):

```tsx
const masked = useUIStore((s) => s.valuesMasked);
const rawValue = animate ? displayAmount : amount;

// If btcUsdRate provided and display currency is non-USD, convert
let finalValue = rawValue;
let finalCurrency = currency;
if (btcUsdRate && dc.displayCurrency !== "USD") {
  finalValue = dc.convert(rawValue, btcUsdRate);
  finalCurrency = dc.displayCurrency;
}

const formatted = finalCurrency === "USD"
  ? formatCurrency(finalValue, "USD")
  : dc.format(finalValue);

return (
  <span className={cn("tabular-nums", className)}>
    {masked ? "$\u2022\u2022\u2022\u2022\u2022" : formatted}
  </span>
);
```

- [ ] **Step 2: Update formatCompactCurrency in chart-utils.ts**

In `src/lib/chart-utils.ts`, the `formatCompactCurrency` function is used by chart Y-axes and the Sankey labels. It needs to handle BTC/sats. Add a new overload that accepts display currency context info:

```ts
export function formatCompactDisplayCurrency(
  value: number,
  displayCurrency: string,
  formatCompact: (val: number) => string,
): string {
  if (displayCurrency === "USD") {
    return formatCompactCurrency(value, "USD");
  }
  return formatCompact(value);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portfolio/money-display.tsx src/lib/chart-utils.ts
git commit -m "feat: make MoneyDisplay + chart utils display-currency-aware"
```

---

### Task 9: Dashboard Hero, Stats Cards, Change Indicator, CAGR Card

**Files:**
- Modify: `src/components/dashboard/dashboard-view.tsx`
- Modify: `src/components/dashboard/stats-cards.tsx`
- Modify: `src/components/dashboard/change-indicator.tsx`

- [ ] **Step 1: Pass `btcUsdRate` through dashboard MoneyDisplay calls**

In `src/components/dashboard/dashboard-view.tsx`, everywhere `MoneyDisplay` is used and `portfolio` is available, add `btcUsdRate={portfolio.btcUsdRate}`:

- Line 125 hero net worth: `<MoneyDisplay ... btcUsdRate={portfolio.btcUsdRate} />`
- Line 182 chart legend net worth: `<MoneyDisplay ... btcUsdRate={portfolio.btcUsdRate} />`
- Line 199 investable: `<MoneyDisplay ... btcUsdRate={portfolio.btcUsdRate} />`
- Lines 262, 270, 281, 290, 300 balance sheet rows: add `btcUsdRate={portfolio.btcUsdRate}` to each `<MoneyDisplay />`

For `ChangeIndicator`, pass `btcUsdRate`:
- Lines 131-139: add `btcUsdRate={portfolio.btcUsdRate}` to both ChangeIndicators
- Line 189: add `btcUsdRate={portfolio.btcUsdRate}`

For `StatsCards`, pass `btcUsdRate`:
- Line 164: `<StatsCards portfolio={portfolio} snapshots={recapSnapshots} />`  — no change needed, `portfolio` already has `btcUsdRate`

- [ ] **Step 2: Update StatsCards to pass btcUsdRate**

In `src/components/dashboard/stats-cards.tsx`, the `SummaryCell` uses `MoneyDisplay`. Extract `btcUsdRate` from portfolio and pass it:

Add `btcUsdRate={portfolio.btcUsdRate}` to each `<MoneyDisplay />` and `<ChangeIndicator />` in the file.

- [ ] **Step 3: Update ChangeIndicator to accept btcUsdRate**

In `src/components/dashboard/change-indicator.tsx`:

1. Add `btcUsdRate?: number | null` to `ChangeIndicatorProps`
2. Pass it to the `<MoneyDisplay />` inside the component:
```tsx
<MoneyDisplay amount={Math.abs(absoluteChange)} currency={currency} btcUsdRate={btcUsdRate} />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/dashboard-view.tsx src/components/dashboard/stats-cards.tsx src/components/dashboard/change-indicator.tsx
git commit -m "feat: dashboard hero, stats, and change indicator use display currency"
```

---

### Task 10: Charts — NetWorthChart and AssetsDebtsChart

**Files:**
- Modify: `src/components/charts/net-worth-chart.tsx`
- Modify: `src/components/charts/assets-debts-chart.tsx`

Charts use historical snapshot data. Each snapshot now has `btcUsdRate`. When display currency is BTC/sats, convert each data point using its own snapshot's rate. Skip rows where `btcUsdRate` is null.

- [ ] **Step 1: Update NetWorthChart**

In `src/components/charts/net-worth-chart.tsx`:

1. Add imports:
```tsx
import { useDisplayCurrency } from "@/contexts/display-currency-context";
```

2. Inside the component, get display currency:
```tsx
const { displayCurrency, convert, format: dcFormat, formatCompact } = useDisplayCurrency();
```

3. Update `chartData` memo to convert and filter:
```tsx
const chartData = useMemo(() => {
  if (!snapshots) return [];
  return [...snapshots]
    .reverse()
    .filter((s) => {
      if (displayCurrency === "USD") return true;
      return s.btcUsdRate != null;
    })
    .map((s) => {
      const rate = s.btcUsdRate ? Number(s.btcUsdRate) : null;
      return {
        date: s.date,
        netWorth: convert(Number(s.netWorth), rate),
        investable: s.investableTotal != null ? convert(Number(s.investableTotal), rate) : null,
      };
    });
}, [snapshots, displayCurrency, convert]);
```

4. Update the tooltip formatter to use display currency format:
Replace the `fmt` function in `NetWorthTooltip` — pass `displayCurrency` and `dcFormat` from the parent as props, or use `useDisplayCurrency` inside the tooltip:

```tsx
function NetWorthTooltip({ active, payload, label, hasInvestable }: { ... }) {
  const { format: dcFormat } = useDisplayCurrency();
  if (!active || !payload?.length) return null;

  // ...same structure, but use dcFormat instead of Intl:
  const fmt = (v: number) => dcFormat(v);
  // ...rest unchanged
}
```

Remove the `currency` prop from the tooltip — it's no longer needed.

- [ ] **Step 2: Update AssetsDebtsChart**

Same pattern as NetWorthChart:

1. Import and use `useDisplayCurrency`
2. Filter out snapshots where `btcUsdRate` is null when in BTC/sats mode
3. Convert values in the `chartData` memo
4. Update Y-axis `tickFormatter` and tooltip to use display currency format

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/net-worth-chart.tsx src/components/charts/assets-debts-chart.tsx
git commit -m "feat: NetWorth + AssetsDebts charts use display currency with historical rates"
```

---

### Task 11: RecapSankeyChart + AllocationChart

**Files:**
- Modify: `src/components/dashboard/recap-sankey-chart.tsx`
- Modify: `src/components/dashboard/allocation-chart.tsx`

These use live portfolio data (not snapshots), so they convert via `convert(usdValue, portfolio.btcUsdRate)`.

- [ ] **Step 1: Update RecapSankeyChart**

In `src/components/dashboard/recap-sankey-chart.tsx`:

1. Import `useDisplayCurrency`
2. In the `NodeLabel` component, convert the amount:
```tsx
const { convert, formatCompact: dcFormatCompact } = useDisplayCurrency();
```
Replace `formatCompactCurrency(node.value ?? 0, currency)` with:
```tsx
dcFormatCompact(convert(node.value ?? 0, btcUsdRate))
```
Thread `btcUsdRate` from the parent `RecapSankeyChart` component via the `portfolio.btcUsdRate` prop.

- [ ] **Step 2: Update AllocationChart**

In `src/components/dashboard/allocation-chart.tsx`:

1. Import `useDisplayCurrency`
2. For the ring center MoneyDisplay and the ReportBlock MoneyDisplay calls, add `btcUsdRate={portfolio.btcUsdRate}`
3. For `formatCompactCurrency` calls in RingMetric, convert first:
```tsx
const { convert, formatCompact } = useDisplayCurrency();
// Replace: formatCompactCurrency(investableTotal, portfolio.currency)
// With: formatCompact(convert(investableTotal, portfolio.btcUsdRate))
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/recap-sankey-chart.tsx src/components/dashboard/allocation-chart.tsx
git commit -m "feat: Sankey and allocation charts use display currency"
```

---

### Task 12: Portfolio View — Headers, Sheet Totals, Section Totals

**Files:**
- Modify: `src/components/portfolio/net-worth-header.tsx`
- Modify: `src/components/portfolio/sheet-total-header.tsx`
- Modify: `src/components/portfolio/sheet-summary-row.tsx`
- Modify: `src/components/portfolio/section-header.tsx`
- Modify: `src/components/portfolio/portfolio-view.tsx`

- [ ] **Step 1: Pass btcUsdRate down from portfolio-view.tsx**

In `src/components/portfolio/portfolio-view.tsx`:

Everywhere `currency={portfolio.currency}` appears, also pass `btcUsdRate={portfolio.btcUsdRate}` to the child component (if it uses MoneyDisplay/ChangeIndicator). The affected components:

- `SheetTotalHeader`: add `btcUsdRate` prop
- `SheetSummaryRow`: add `btcUsdRate` prop
- `SheetView` → `SectionHeader` → `AssetTable`: thread through

- [ ] **Step 2: Update NetWorthHeader**

In `src/components/portfolio/net-worth-header.tsx`:

1. Add `btcUsdRate?: number | null` to `NetWorthHeaderProps`
2. Pass it to all `MoneyDisplay` and `ChangeChip` instances
3. In `ChangeChip`, pass `btcUsdRate` to `MoneyDisplay`

- [ ] **Step 3: Update SheetTotalHeader**

In `src/components/portfolio/sheet-total-header.tsx`:

1. Add `btcUsdRate?: number | null` to props
2. Pass to `MoneyDisplay` and `ChangeIndicator` instances

- [ ] **Step 4: Update SheetSummaryRow**

In `src/components/portfolio/sheet-summary-row.tsx`:

1. Add `btcUsdRate?: number | null` to props
2. Pass to `MoneyDisplay` for sheet totals

- [ ] **Step 5: Update SectionHeader**

In `src/components/portfolio/section-header.tsx`:

1. Add `btcUsdRate?: number | null` to `SectionHeaderProps`
2. Pass to the `MoneyDisplay` that shows section total

- [ ] **Step 6: Commit**

```bash
git add src/components/portfolio/net-worth-header.tsx src/components/portfolio/sheet-total-header.tsx src/components/portfolio/sheet-summary-row.tsx src/components/portfolio/section-header.tsx src/components/portfolio/portfolio-view.tsx
git commit -m "feat: portfolio view headers and totals use display currency"
```

---

### Task 13: Asset Table + Detail Panel

**Files:**
- Modify: `src/components/portfolio/asset-table.tsx`
- Modify: `src/components/portfolio/detail-panel.tsx`

- [ ] **Step 1: Update AssetTable**

In `src/components/portfolio/asset-table.tsx`:

1. Add `btcUsdRate?: number | null` to the component's props
2. Pass to all `MoneyDisplay` instances in the value column
3. The foreign currency subtext display already exists — when display currency is non-USD, the "main" value should be in display currency, and subtext shows the native amount

- [ ] **Step 2: Update DetailPanel**

In `src/components/portfolio/detail-panel.tsx`:

1. The panel receives the `portfolio` prop which includes `btcUsdRate`
2. Pass `btcUsdRate={portfolio.btcUsdRate}` to all `MoneyDisplay` instances

- [ ] **Step 3: Commit**

```bash
git add src/components/portfolio/asset-table.tsx src/components/portfolio/detail-panel.tsx
git commit -m "feat: asset table and detail panel use display currency"
```

---

### Task 14: Build, Deploy, and Smoke Test

- [ ] **Step 1: Run the full test suite**

Run: `cd /opt/summa && pnpm exec vitest run`
Expected: All tests pass

- [ ] **Step 2: Build the app**

Run: `cd /opt/summa && pnpm build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Restart the service**

Run: `systemctl restart summa`
Expected: Service starts cleanly

- [ ] **Step 4: Smoke test at http://192.168.1.244:3000**

Verify:
- Dropdown appears in top bar with USD/BTC/sats options
- Switching to BTC re-denominates all visible values
- Switching to sats shows same chart shape with sats labels
- Net worth chart may be sparse (old snapshots have null btcUsdRate)
- Switching back to USD restores original view
- Refresh page — display currency persists via localStorage
- If a BTC asset exists via ticker flow, confirm it shows correct value (not $0.10)

- [ ] **Step 5: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: smoke test fixups for display currency"
```

---

### Task 15: Push Branch and Create PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/display-currency
```

- [ ] **Step 2: Create the PR**

```bash
gh pr create --title "Display currency switcher (USD / BTC / sats)" --body "$(cat <<'EOF'
## Summary
- Add USD / BTC / sats display currency switcher to the top bar
- Persist preference to localStorage
- Re-denominate all surfaces: hero net worth, stats cards, CAGR, charts (net worth, assets/debts, Sankey, allocation), sheet/section totals, asset rows, detail panel
- New `btc_usd_rate` column on `portfolio_snapshots`, populated by daily cron via CryptoCompare
- Charts in BTC/sats mode use historical rates per snapshot and skip rows with null rates (honest gaps)
- Fix pre-existing bug: 0.1 BTC asset was contributing $0.10 to net worth (BTC was missing from rates map)

## Test plan
- [ ] Verify dropdown appears and cycles through USD → BTC → sats
- [ ] Verify persistence across page reload
- [ ] Verify hero, stats, charts, totals all re-denominate
- [ ] Verify net worth chart skips old snapshots with null btcUsdRate
- [ ] If BTC ticker asset exists, verify correct USD value (not $0.10)
- [ ] Run `pnpm exec vitest run` — all tests pass
- [ ] Test on http://192.168.1.244:3000 (not localhost)
EOF
)"
```

- [ ] **Step 3: Merge the PR**

```bash
gh pr merge --squash --delete-branch
```
