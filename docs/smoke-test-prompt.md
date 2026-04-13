You are testing a web app called Summa at http://192.168.1.244:3000. Open it in a browser and click through every flow below. Take a screenshot after each step. Report PASS/FAIL for each test.

Login: email is nick@summa.app, password is nick1234. If those don't work, try the register page — if registration is blocked, an account exists. Ask me for credentials.

## Tests

1. **Login** — Go to http://192.168.1.244:3000. You should land on /login. Enter credentials, submit. Should redirect to dashboard or portfolio. Screenshot.

2. **Dashboard** — Navigate to /dashboard. Should show net worth, charts, stat cards. Screenshot.

3. **Portfolio view** — Click into the portfolio. Should show sheets (Assets/Debts) with sections and asset rows in tables. Screenshot the full view.

4. **Expandable parent rows** — Look for rows with a "▸" chevron and "N holdings" badge. If found, click to expand. Child rows should appear indented with ticker badges. Screenshot expanded state.

5. **Add asset — ticker search** — Click the "+" or "Add" button. Select "Stock & Fund Tickers". Type "AAPL" in the search box. A dropdown should appear with Apple Inc results. Screenshot the dropdown. If nothing appears: open browser dev tools (F12), check Console for errors, check Network tab for a request to `/api/prices/search?q=AAPL` and report what it returns. This is the most important test.

6. **Add asset — crypto search** — Clear the box, type "Bitcoin". Should show BTC-USD or Bitcoin results. Screenshot. Don't submit.

7. **Add asset — manual** — Go back to category picker, select "Manual Asset". Should show a form with Name and Value. Screenshot.

8. **Settings/Connections** — Navigate to /settings/connections. Should show SimpleFIN section with any connections. If there are tracked accounts, click the "Tracked ▾" badge — should show a dropdown with Relink and Unlink options. Screenshot.

9. **Price feeds** — On the same connections page, find the Price Feeds section. Report the sync status of Yahoo Finance, CoinGecko, and Frankfurter. Screenshot.

10. **Brokerage CSV import** — Navigate to /import/brokerage. Should show an upload page. Screenshot.

11. **Kubera import** — Navigate to /import/kubera. Should load without errors. Screenshot.

12. **Settings** — Navigate to /settings. Should show user settings. Screenshot.

13. **API smoke tests** — Open browser dev tools Console and run each of these, reporting the output:
    - `fetch('/api/portfolios').then(r=>r.json()).then(console.log)`
    - `fetch('/api/prices/search?q=AAPL').then(r=>r.json()).then(console.log)`
    - `fetch('/api/prices/quote?symbol=AAPL&source=yahoo').then(r=>r.json()).then(console.log)`

## Output

After all tests, give me a summary table:

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | Login | | |
| 2 | Dashboard | | |
| 3 | Portfolio view | | |
| 4 | Expandable rows | | |
| 5 | Ticker search AAPL | | |
| 6 | Crypto search BTC | | |
| 7 | Manual asset form | | |
| 8 | Connections + relink | | |
| 9 | Price feeds status | | |
| 10 | Brokerage import | | |
| 11 | Kubera import | | |
| 12 | Settings | | |
| 13 | API health | | |

For any FAIL, include the screenshot and exact error. Test 5 (ticker search) is the highest priority — if it fails, the console/network details are critical.
