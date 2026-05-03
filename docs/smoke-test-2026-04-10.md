# Summa Smoke Test — 2026-04-10

Open a browser to http://192.168.1.244:3000 and walk through every flow below. Report PASS/FAIL for each test with a screenshot and any error messages. Login credentials: use whatever account exists (check the register page first — if it blocks registration, an account already exists; try common credentials or check the database).

## Pre-requisites

If you need to log in and don't know the password, you can check the database:
```bash
docker exec -i summa-postgres psql -U summa -d summa -c "SELECT email FROM \"user\" LIMIT 1;"
```
The password won't be readable (it's hashed), but the email will tell you which account to use. The user should provide credentials if needed.

---

## 1. Authentication

### 1.1 Login page loads
- Navigate to http://192.168.1.244:3000
- Expect: redirected to /login with email + password fields
- Screenshot the login page

### 1.2 Login succeeds
- Enter credentials and submit
- Expect: redirected to /dashboard or /portfolio
- Screenshot the landing page after login

---

## 2. Dashboard

### 2.1 Dashboard loads
- Navigate to /dashboard
- Expect: net worth header, allocation chart, stat cards
- Screenshot the full dashboard

---

## 3. Portfolio View

### 3.1 Portfolio loads with assets
- Navigate to the portfolio page (click the portfolio link or go to /portfolio/{id})
- Expect: sheets with sections, assets listed in tables
- Screenshot the portfolio view

### 3.2 Expandable parent rows (holdings expansion)
- Look for any parent assets (they'll have a chevron ▸ and a "N holdings" badge)
- If found: click the chevron to expand
- Expect: child rows appear indented underneath with ticker badges
- Screenshot both collapsed and expanded states
- If no parent assets exist, note "No parent-child assets found" as INFO not FAIL

### 3.3 Asset values are reasonable
- Check that no asset shows absurd values (e.g., $2,000,000 for a small crypto holding)
- Check that Bitcoin-related assets show prices in the $80,000+ range (not $32)
- Check that ETH shows prices in the $1,500+ range (not $21)
- Report any suspicious values

---

## 4. Add Asset Flow

### 4.1 Add button opens category picker
- Click the "+" or "Add" button in the portfolio view (usually in the top bar)
- Expect: a dialog/modal with category options (Manual Asset, Stock & Fund Tickers, Crypto Wallets, etc.)
- Screenshot the category picker

### 4.2 Ticker search works
- Click "Stock & Fund Tickers"
- In the search box, type "AAPL"
- Expect: a dropdown appears with search results including "Apple Inc" from Yahoo Finance
- Screenshot the search results dropdown
- **This is a critical test** — if no dropdown appears, check:
  - Browser console (F12 → Console) for any JavaScript errors
  - Network tab for the request to /api/prices/search?q=AAPL — does it return data?
  - Screenshot any errors found

### 4.3 Crypto ticker search works
- Clear the search box, type "Bitcoin" or "BTC"
- Expect: results including "BTC-USD" (Bitcoin USD) from Yahoo and/or CoinGecko
- Screenshot the search results

### 4.4 Ticker selection auto-fills price
- Select "AAPL" (Apple) from the results
- Expect: name auto-fills to "Apple Inc", quantity defaults to 1, price auto-fetches
- The computed value (qty × price) should show a reasonable Apple stock price (~$190-250)
- Do NOT submit — just verify the form state and screenshot it

### 4.5 Manual asset form works
- Go back to category picker, select "Manual Asset"
- Expect: form with Name, Value, and optional fields
- Type a name and value, verify the form is functional
- Screenshot the form

---

## 5. SimpleFIN Connections

### 5.1 Connections page loads
- Navigate to /settings/connections
- Expect: page with SimpleFIN section, any existing connections listed
- Screenshot the connections page

### 5.2 Tracked account dropdown works
- If there are SimpleFIN connections with tracked accounts:
  - Find an account showing "Tracked ▾" badge
  - Click the badge
  - Expect: dropdown menu with "Relink to existing asset" and "Unlink" options
  - Screenshot the dropdown
- If no SimpleFIN connections exist, note as INFO

### 5.3 Price feed status
- On the connections page, check the "Price Feeds" section
- Report the sync status of each feed:
  - Yahoo Finance: last synced when?
  - CoinGecko: last synced when?
  - Frankfurter (FX): last synced when?
- Screenshot the price feeds section

---

## 6. Brokerage CSV Import

### 6.1 Import page loads
- Navigate to /import/brokerage
- Expect: upload page with "Import Brokerage Positions" header, dashed upload zone
- Screenshot the page

### 6.2 CSV parsing works (use test data)
- Create a small test CSV and upload it. Use this content:

```
Symbol,Description,Quantity,Last Price,Current Value
AAPL,Apple Inc,10,195.00,"1,950.00"
MSFT,Microsoft Corp,5,420.00,"2,100.00"
VOO,Vanguard S&P 500 ETF,3,530.00,"1,590.00"
```

- Save as a .csv file and upload/drop it on the upload zone
- Expect: "Fidelity" format detected, 3 positions shown in preview table
- Screenshot the preview step
- Do NOT submit the import — just verify detection works

---

## 7. Kubera Import

### 7.1 Import page loads
- Navigate to /import/kubera
- Expect: page loads without errors
- Screenshot the page

---

## 8. Settings

### 8.1 Settings page loads
- Navigate to /settings
- Expect: user settings page with password change, theme, etc.
- Screenshot the page

---

## 9. API Health Checks

Run these from the browser's address bar or dev tools console:

### 9.1 Portfolio API
- In dev tools console, run: `fetch('/api/portfolios').then(r => r.json()).then(d => console.log(d))`
- Expect: array of portfolio objects (or redirect if not authed)
- Report the response

### 9.2 Price search API
- In dev tools console, run: `fetch('/api/prices/search?q=AAPL').then(r => r.json()).then(d => console.log(d))`
- Expect: array of search results with symbol, name, exchange, type, source
- Report the response (or any error)

### 9.3 Price quote API
- In dev tools console, run: `fetch('/api/prices/quote?symbol=AAPL&source=yahoo').then(r => r.json()).then(d => console.log(d))`
- Expect: `{ price: <number> }` with a reasonable Apple stock price
- Report the response

---

## Summary

After running all tests, provide a summary table:

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1.1 | Login page loads | | |
| 1.2 | Login succeeds | | |
| 2.1 | Dashboard loads | | |
| 3.1 | Portfolio loads | | |
| 3.2 | Expandable parent rows | | |
| 3.3 | Asset values reasonable | | |
| 4.1 | Add button opens categories | | |
| 4.2 | Ticker search (AAPL) | | |
| 4.3 | Crypto ticker search (BTC) | | |
| 4.4 | Ticker auto-fills price | | |
| 4.5 | Manual asset form | | |
| 5.1 | Connections page | | |
| 5.2 | Tracked account dropdown | | |
| 5.3 | Price feed status | | |
| 6.1 | Brokerage import page | | |
| 6.2 | CSV parsing | | |
| 7.1 | Kubera import page | | |
| 8.1 | Settings page | | |
| 9.1 | Portfolio API | | |
| 9.2 | Price search API | | |
| 9.3 | Price quote API | | |

Flag any FAIL items with screenshots and error details. For the ticker search test (4.2), if it fails, the browser console errors and network tab details are critical for debugging.
