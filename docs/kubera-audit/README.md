# Kubera UI/UX Audit

Authenticated Playwright crawl of kubera.com (build `6.4.3.12866`, captured 2026-04-15) used as the reference material for Summa's visual + feature parity work.

## Files

- **[KUBERA-AUDIT-REPORT.md](./KUBERA-AUDIT-REPORT.md)** — the report. Start here.
- `screenshots/` — 27 numbered PNGs (dashboard, assets, debts, recap, etc.)
- `raw/` — computed styles, DOM hierarchies, full HTML, and network logs per page
- `audit.js` / `deep.js` / `deep2.js` — the Playwright scripts used to produce the captures (kept for reproducibility)

## Re-running

The scripts expect a Kubera access token in `KUBERA_TOKEN`. Token lifetime is ~1 hour.

```bash
cd docs/kubera-audit
npm install playwright
npx playwright install chromium
KUBERA_TOKEN='<jwt>' node audit.js
```

Output lands in `screenshots/` and `raw/`. `node_modules/` is gitignored.
