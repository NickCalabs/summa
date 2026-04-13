# Native Currency Editing & Dual-Display Asset Rows

## Goal

Make asset rows currency-aware like Kubera: show both the display-currency value and the native holding amount, and let users edit in the asset's native unit (BTC quantity for a BTC asset, USD for a USD asset) rather than forcing everything through USD.

## Display Rule

The value column in asset rows shows **one or two lines** depending on whether the asset's native currency matches the current display currency:

1. **Native === display currency** (e.g., BTC asset viewed in BTC, or USD asset viewed in USD): Show the native amount only. No subtext.

2. **Native !== display currency** (e.g., BTC asset viewed in USD, or USD asset viewed in BTC): Main line shows the converted value in the display currency. Subtext below in smaller/muted text shows the native amount.

### Examples

| Asset | Display Currency | Main Line | Subtext |
|-------|-----------------|-----------|---------|
| BTC asset (0.075 BTC) | USD | $4,875.00 | 0.075 BTC |
| BTC asset (0.075 BTC) | BTC | 0.075 BTC | — |
| BTC asset (0.075 BTC) | sats | 7,500,000 sats | — |
| USD checking ($12,500) | USD | $12,500.00 | — |
| USD checking ($12,500) | BTC | 0.1923 BTC | $12,500.00 |
| EUR savings (5,000 EUR) | USD | $5,435.00 | 5,000.00 EUR |
| EUR savings (5,000 EUR) | BTC | 0.0836 BTC | 5,000.00 EUR |

Note: sats is treated as BTC for the "native === display" check. A BTC asset viewed in sats shows the sats amount with no subtext.

### Formatting the native subtext

- For crypto assets with `quantity` and `currentPrice`: show `{quantity} {currency}` (e.g., `0.075 BTC`)
- For fiat assets or assets without quantity: show the value formatted with the currency symbol (e.g., `$12,500.00`, `5,000.00 EUR`)
- Use `text-xs text-muted-foreground` styling (same as the existing foreign-currency subtext pattern in asset-table.tsx)

## Editing Rule

When the user clicks to inline-edit the value column, the edit should always be in the **asset's native unit**:

### Ticker/wallet assets (have `quantity` + `currentPrice`)

- The input pre-fills with the current `quantity` (e.g., `0.075` for a BTC asset)
- On commit, save the new `quantity` and recalculate `currentValue = quantity * currentPrice`
- The API call sends both `quantity` and `currentValue` in the update

### Manual assets (no `currentPrice`)

- The input pre-fills with `currentValue` (which is already in the asset's native currency)
- On commit, save the new `currentValue` directly
- This is the same as the current behavior

### What the input looks like

- Show the currency label after the input or as a suffix so the user knows what unit they're editing (e.g., the input shows `0.075` with `BTC` label)
- `inputMode="decimal"` for all value edits (same as now)

## Affected Components

### `src/components/portfolio/asset-table.tsx`

The value column cell renderer (lines ~280-355) needs the most changes:

1. **Display**: Replace the current `isForeign` branch with the new native-vs-display logic. The current code checks if `asset.currency !== baseCurrency` — the new code checks if the asset's native currency matches the *display* currency (from `useDisplayCurrency`).

2. **Editing**: The `commitEdit` function for `currentValue` needs to branch:
   - If asset has `quantity` and `currentPrice`: parse input as new quantity, compute `currentValue = quantity * currentPrice`, send both
   - If no `currentPrice`: parse as `currentValue` directly (current behavior)

3. **InlineInput initial value**: For ticker/wallet assets, pre-fill with `quantity` instead of `currentValue`.

### `src/components/portfolio/detail-panel.tsx`

The ValueTab already shows the value with a foreign-currency subtext. Apply the same native-vs-display logic and native-unit editing.

### API: `src/app/api/assets/[id]/route.ts`

Already accepts `quantity` and `currentValue` in PATCH. No API changes needed — the client just needs to send both fields when editing a ticker asset's quantity.

## Out of scope

- Changing how SimpleFIN-imported assets display (they're always USD, no native crypto unit available)
- Changing how the add-asset flow works (currency tagging is already correct for ticker adds)
- Per-unit price editing in the inline edit (use the detail panel for that)
- Currency conversion for the edit input itself (you edit in native, period)
