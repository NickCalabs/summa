# Summa

**The balance sheet you actually own.**

A self-hosted net worth tracker that gives you a complete picture of your finances — without handing your data to a third party.

![Screenshot placeholder](https://placehold.co/1200x700/1E1E2E/white?text=Summa)

## Features

- **Self-hosted** — your financial data stays on your hardware
- **Multi-currency** — track assets in any currency with automatic exchange rate conversion
- **Auto-updating prices** — stocks via Yahoo Finance, crypto via CoinGecko
- **Spreadsheet-style UI** — editable cells, Tab/Enter navigation, sections and sheets
- **Charts** — net worth history with 90-day trends
- **Dark mode** — full dark/light theme support
- **Keyboard-first** — Tab between cells, Enter to advance rows, Escape to close panels
- **Docker-ready** — one command to deploy

## Quick Start

**One-liner install** (requires Docker):

```bash
curl -sSL https://get.summa.sh | sh
```

This will create `~/summa/`, generate a secure config, and start Summa at [http://localhost:3000](http://localhost:3000).

To install to a custom directory:

```bash
SUMMA_DIR=/opt/summa curl -sSL https://get.summa.sh | sh
```

<details>
<summary>Manual install (clone + Docker Compose)</summary>

```bash
# 1. Clone
git clone https://github.com/summa-app/summa.git
cd summa

# 2. Configure
cp .env.example .env
# Edit .env — at minimum, change BETTER_AUTH_SECRET to a random string

# 3. Launch
docker compose up -d
```

</details>

Open [http://localhost:3000](http://localhost:3000), create an account, and start tracking.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Random secret for session signing |
| `BETTER_AUTH_URL` | Yes | Public URL of your Summa instance |
| `PLAID_CLIENT_ID` | No | Plaid client ID (bank connections) |
| `PLAID_SECRET` | No | Plaid secret key |
| `PLAID_ENV` | No | `sandbox`, `development`, or `production` |
| `ENCRYPTION_KEY` | No | 32-byte hex key for encrypting Plaid tokens |

## Development

```bash
# Prerequisites: Node.js 22+, pnpm, PostgreSQL

pnpm install

# Start the database (or use your own)
docker compose up db -d

# Run migrations
pnpm db:migrate

# Seed demo data (optional)
pnpm db:seed

# Start dev server
pnpm dev
```

## Tech Stack

Next.js 16 · React 19 · TypeScript · Drizzle ORM · PostgreSQL · Better Auth · TanStack Query · Tailwind CSS 4 · Recharts · Zustand

## Roadmap

- **v0.1** — Core spreadsheet UI, auto-prices, charts, multi-currency, Docker (done)
- **v0.2** — Plaid/bank connections, import/export CSV
- **v0.3** — Goals & milestones, projected net worth
- **v1.0** — Mobile app, shared portfolios, custom dashboards

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

## License

[AGPL-3.0](LICENSE)
