# Getting Started with Summa

Welcome to Summa — a self-hosted net worth tracker that keeps your financial data on your own hardware. This guide walks you through your first 5 minutes.

---

## 1. Create your account

Navigate to `http://localhost:3000` (or your instance URL) and click **Create account**.

- Enter your name, email address, and a password (8 characters minimum).
- Summa is single-user — only one account can be registered per instance.
- After registering, you'll land on the **Dashboard**.

> Already have an account? Sign in at `/login`.

---

## 2. Your portfolio is ready

On first login, Summa automatically creates a portfolio called **My Net Worth** with:

- One **Assets** sheet
- A default **Getting Started** section

No extra setup required — start adding assets right away.

---

## 3. Add your first asset

1. Click **Portfolio** in the top navigation.
2. Click **Add** (top-right corner) or the **+** icon next to any section.
3. Choose an asset type:

| Type | Auto-prices | Notes |
|---|---|---|
| **Stock / ETF** | Yes | Search by ticker — prices sync via Yahoo Finance |
| **Crypto** | Yes | Search by ticker (e.g. BTC) — prices sync via CoinGecko |
| **Cash** | No | Enter the balance manually |
| **Real Estate** | No | Enter a property value manually |
| **Vehicle** | No | Enter a vehicle value manually |
| **Other** | No | Anything that doesn't fit another category |

4. Set the **name** (or search for a ticker), enter the **quantity** and **value**, then save.

> **Tip:** For stocks and crypto, search by ticker symbol — Summa fills in the current price automatically and keeps it updated.

---

## 4. Understand sheets and sections

Summa organizes your finances in three levels:

```
Portfolio  ("My Net Worth")
├── Sheet: Assets           ← things you own
│   ├── Section: Cash
│   │   ├── Checking account    $5,000
│   │   └── Savings account    $20,000
│   └── Section: Investments
│       ├── AAPL               $15,000
│       └── BTC                 $8,000
└── Sheet: Debts            ← money you owe
    └── Section: Loans
        └── Student loan       $30,000
```

- **Sheets** are the top-level tabs. Use separate sheets for assets and debts.
- **Sections** are named groups within a sheet (e.g., "Cash", "Investments", "Real Estate").
- **Assets** are the individual items tracked within each section.

**To add a section:** scroll to the bottom of any sheet and click **Add section**.
**To add a sheet:** click the **+** button next to the sheet tabs and choose a name and type (Assets or Debts).

Net worth is calculated automatically: **Assets − Debts**.

---

## 5. Set your currency

Your portfolio defaults to **USD**. To change it, patch the portfolio via the API:

```bash
# Get your portfolioId from the URL: /portfolio/{portfolioId}
curl -X PATCH http://localhost:3000/api/portfolios/{portfolioId} \
  -H "Content-Type: application/json" \
  -H "Cookie: <paste your session cookie here>" \
  -d '{"currency": "EUR"}'
```

Supported values: any 3-letter ISO 4217 code (e.g. `USD`, `EUR`, `GBP`, `JPY`).

Once set, all asset values are automatically converted to your portfolio currency using live exchange rates. Assets held in a different currency (e.g., a EUR stock in a USD portfolio) are converted at the current rate.

> A currency settings UI is on the roadmap. For now, the API call above is the way to change it.

---

## 6. (Optional) Connect a bank via Plaid

If your instance was configured with Plaid credentials (`PLAID_CLIENT_ID`, `PLAID_SECRET`, `ENCRYPTION_KEY` in `.env`), a **Connect Bank** button will appear in the top bar.

1. Click **Connect Bank**.
2. Complete the Plaid authentication flow for your institution.
3. Select which accounts to import and which section to place them in.
4. Account balances will stay in sync automatically.

See the main [README](../README.md#environment-variables) for the required environment variables.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Tab` | Move to the next cell |
| `Enter` | Save and advance to the next row |
| `Escape` | Cancel editing / close panel |

---

## What's next?

- **Dashboard** — view your allocation breakdown, net worth trend chart, and key stats.
- **Import CSV** — bulk-import assets from a spreadsheet using the **Import** button.
- **Export CSV** — download your portfolio data at any time from the **Export** button.
- **Charts** — explore the 90-day net worth history and asset/debt breakdown charts.
