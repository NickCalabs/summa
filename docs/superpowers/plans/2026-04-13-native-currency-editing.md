# Native Currency Editing & Dual-Display Asset Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make asset rows show dual-display (converted value + native amount) and let users edit in the asset's native unit (quantity for ticker assets, value for manual assets).

**Architecture:** The asset-table value column replaces its current `isForeign` display branch with display-currency-aware logic using `useDisplayCurrency()`. The `commitEdit` function branches on whether the asset has `quantity`+`currentPrice` to decide whether to update quantity (recalculating value) or value directly. The detail panel's ValueTab gets the same treatment.

**Tech Stack:** React, TypeScript, useDisplayCurrency context (already wired in from previous PR)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/components/portfolio/asset-table.tsx:175-358` | Dual-display value column + native-unit inline editing |
| Modify | `src/components/portfolio/detail-panel.tsx:287-366` | Dual-display value header + native-unit form editing |

---

### Task 1: Asset Table — Dual-Display Value Column + Native-Unit Editing

**Files:**
- Modify: `src/components/portfolio/asset-table.tsx`

- [ ] **Step 1: Import useOptionalDisplayCurrency**

At the top of `src/components/portfolio/asset-table.tsx`, add the import:

```ts
import { useOptionalDisplayCurrency } from "@/contexts/display-currency-context";
```

- [ ] **Step 2: Get display currency in the component body**

Inside `AssetTable`, after `const { baseCurrency, toBase } = useCurrency();` (line 115), add:

```ts
const dc = useOptionalDisplayCurrency();
const displayCurrency = dc?.displayCurrency ?? "USD";
```

- [ ] **Step 3: Update commitEdit to handle native-unit quantity editing**

Replace the `currentValue` branch in `commitEdit` (lines 189-193):

```ts
      } else if (field === "currentValue") {
        const num = parseFloat(rawValue);
        if (isNaN(num) || rawValue === "") return;

        const hasQtyPrice = asset.quantity != null && asset.currentPrice != null;
        if (hasQtyPrice) {
          // Editing quantity in native units — recalculate value
          const newQty = num;
          const price = Number(asset.currentPrice);
          const newValue = (newQty * price).toFixed(2);
          if (newQty !== Number(asset.quantity)) {
            updateAsset.mutate({
              id: assetId,
              quantity: String(newQty),
              currentValue: newValue,
            });
          }
        } else {
          // Manual asset — edit currentValue directly in native currency
          if (num !== Number(asset.currentValue)) {
            updateAsset.mutate({ id: assetId, currentValue: String(num) });
          }
        }
      }
```

- [ ] **Step 4: Update the editing input to pre-fill with quantity for ticker assets**

Replace the editing block in the value cell renderer (lines 292-301):

```tsx
          if (isEditing) {
            const hasQtyPrice = asset.quantity != null && asset.currentPrice != null;
            const editValue = hasQtyPrice
              ? String(Number(asset.quantity))
              : String(Number(asset.currentValue));

            return (
              <div className="flex items-center gap-1 justify-end">
                <InlineInput
                  initialValue={editValue}
                  onCommit={(v) => commitEdit(asset.id, "currentValue", v)}
                  onCancel={cancelEdit}
                  align="right"
                  inputMode="decimal"
                />
                <span className="text-xs text-muted-foreground shrink-0">
                  {asset.currency}
                </span>
              </div>
            );
          }
```

- [ ] **Step 5: Replace the display logic with dual-display**

Replace the entire display block (lines 310-356, from the `<div className="text-right...` to the closing `</div>` before the `},`) with:

```tsx
          // Determine if native currency matches display currency
          // Treat sats as BTC for this check
          const effectiveDisplay = displayCurrency === "sats" ? "BTC" : displayCurrency;
          const nativeMatchesDisplay = asset.currency === effectiveDisplay;

          // Compute the base-currency (USD) value for display-currency conversion
          const baseValue = toBase(Number(asset.currentValue), asset.currency);

          return (
            <div
              className="text-right tabular-nums cursor-text hover:bg-muted/50 rounded -mx-1 px-1 py-0.5 -my-0.5"
              onClick={() => startEdit(asset.id, "currentValue")}
            >
              <div className="flex items-center justify-end gap-1">
                {isValueSaving && (
                  <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
                )}
                {nativeMatchesDisplay ? (
                  // Native === display: just show the native amount
                  <span className="font-medium">
                    {asset.quantity != null
                      ? `${Number(asset.quantity).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${asset.currency}`
                      : <MoneyDisplay amount={Number(asset.currentValue)} currency={asset.currency} />
                    }
                  </span>
                ) : (
                  // Native !== display: main line is converted, subtext is native
                  <div>
                    <MoneyDisplay
                      amount={baseValue}
                      currency={baseCurrency}
                      btcUsdRate={btcUsdRate}
                      className="font-medium"
                    />
                    <div className="text-xs text-muted-foreground">
                      {asset.quantity != null
                        ? `${Number(asset.quantity).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${asset.currency}`
                        : <MoneyDisplay amount={Number(asset.currentValue)} currency={asset.currency} />
                      }
                    </div>
                  </div>
                )}
              </div>
              {isPartialOwnership && (
                <div className="text-xs text-muted-foreground">
                  Owned {asset.ownershipPct}%{" · "}
                  <MoneyDisplay
                    amount={baseValue * (ownershipPct / 100)}
                    currency={baseCurrency}
                    btcUsdRate={btcUsdRate}
                  />
                </div>
              )}
            </div>
          );
```

- [ ] **Step 6: Commit**

```bash
git add src/components/portfolio/asset-table.tsx
git commit -m "feat: dual-display asset rows + native-unit inline editing"
```

---

### Task 2: Detail Panel — Dual-Display + Native-Unit Form

**Files:**
- Modify: `src/components/portfolio/detail-panel.tsx`

- [ ] **Step 1: Import useOptionalDisplayCurrency**

Add to the imports in `src/components/portfolio/detail-panel.tsx`:

```ts
import { useOptionalDisplayCurrency } from "@/contexts/display-currency-context";
```

- [ ] **Step 2: Update the ValueTab display logic**

In the `ValueTab` function, after `const isForeign = ...` (line 300), add:

```ts
  const dc = useOptionalDisplayCurrency();
  const displayCurrency = dc?.displayCurrency ?? "USD";
  const effectiveDisplay = displayCurrency === "sats" ? "BTC" : displayCurrency;
  const nativeMatchesDisplay = asset.currency === effectiveDisplay;
  const baseValue = toBase(Number(asset.currentValue), asset.currency);
```

Replace the display block (the `{isForeign ? ...}` JSX, lines 316-338) with:

```tsx
      {nativeMatchesDisplay ? (
        // Native matches display — just show native value
        asset.quantity != null ? (
          <p className="text-3xl font-bold tabular-nums">
            {Number(asset.quantity).toLocaleString("en-US", { maximumFractionDigits: 8 })} {asset.currency}
          </p>
        ) : (
          <MoneyDisplay
            amount={Number(asset.currentValue)}
            currency={asset.currency}
            className="text-3xl font-bold"
          />
        )
      ) : (
        // Native differs from display — show converted + native subtext
        <>
          <MoneyDisplay
            amount={baseValue}
            currency={baseCurrency}
            btcUsdRate={btcUsdRate}
            className="text-3xl font-bold"
          />
          <p className="text-sm text-muted-foreground tabular-nums">
            {asset.quantity != null
              ? `${Number(asset.quantity).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${asset.currency}`
              : <MoneyDisplay amount={Number(asset.currentValue)} currency={asset.currency} />
            }
          </p>
        </>
      )}
```

- [ ] **Step 3: Update the value form to edit in native units**

Replace the form and its handler (lines 305-364, `handleValueUpdate` through the closing `</form>`) with:

```tsx
  const hasQtyPrice = asset.quantity != null && asset.currentPrice != null;

  function handleValueUpdate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = manualValue.trim();
    if (!trimmed) return;
    const num = parseFloat(trimmed);
    if (isNaN(num)) return;

    if (hasQtyPrice) {
      // Editing quantity — recalculate value
      const price = Number(asset.currentPrice);
      updateAsset.mutate({
        id: asset.id,
        quantity: String(num),
        currentValue: (num * price).toFixed(2),
      });
    } else {
      // Manual asset — edit value directly
      updateAsset.mutate({ id: asset.id, currentValue: String(num) });
    }
    setManualValue("");
  }
```

And update the form input to show the currency label:

```tsx
      <form onSubmit={handleValueUpdate} className="flex gap-2">
        <div className="flex-1 flex items-center gap-1.5">
          <Input
            placeholder={hasQtyPrice ? `Quantity in ${asset.currency}...` : "Update value..."}
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            type="text"
            inputMode="decimal"
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground shrink-0">{asset.currency}</span>
        </div>
        <Button type="submit" size="sm">
          Update
        </Button>
      </form>
```

Note: keep the `hasQtyPrice` definition (line 302-303) AND the `AssetSparkline` between the display and the form — only replace the form handler and JSX.

- [ ] **Step 4: Commit**

```bash
git add src/components/portfolio/detail-panel.tsx
git commit -m "feat: detail panel dual-display + native-unit value editing"
```

---

### Task 3: Build, Deploy, Smoke Test

- [ ] **Step 1: Run tests**

Run: `cd /opt/summa && pnpm exec vitest run`
Expected: All tests pass

- [ ] **Step 2: Build**

Run: `cd /opt/summa && pnpm build`
Expected: Clean build, no type errors

- [ ] **Step 3: Restart service**

Run: `systemctl restart summa`

- [ ] **Step 4: Smoke test at http://192.168.1.244:3000**

Verify:
- View in USD: BTC asset row shows `$X,XXX` with `0.075 BTC` subtext
- View in BTC: BTC asset row shows just `0.075 BTC`, no subtext
- View in BTC: USD checking row shows `₿0.XXXX` with `$12,500.00` subtext
- Click to edit a BTC ticker asset: input pre-fills with the quantity (e.g., `0.075`), with `BTC` label
- Change quantity → value recalculates on save
- Click to edit a manual USD asset: input pre-fills with value, same as before
- Detail panel shows same dual-display and native-unit editing

- [ ] **Step 5: Commit any fixups**

```bash
git add -A && git commit -m "fix: smoke test fixups for native currency editing"
```

---

### Task 4: Push Branch and PR

- [ ] **Step 1: Push**

```bash
git push -u origin feature/native-currency-editing
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "Native currency editing + dual-display asset rows" --body "..."
```

- [ ] **Step 3: Merge**

```bash
gh pr merge --squash --delete-branch
```
