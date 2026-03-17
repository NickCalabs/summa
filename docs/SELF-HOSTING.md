# Self-Hosting Summa

This guide covers running Summa on your own server beyond the quick-start. If you just want the one-liner, see the [README](../README.md).

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Environment Variables](#environment-variables)
4. [Reverse Proxy & HTTPS](#reverse-proxy--https)
5. [Persisting & Backing Up the Database](#persisting--backing-up-the-database)
6. [Updating Summa](#updating-summa)
7. [Plaid Setup](#plaid-setup)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Docker 24+** | Includes Docker Compose v2 (`docker compose`) |
| **Linux server or VPS** | 512 MB RAM minimum; 1 GB+ recommended |
| **A domain name** | Required for HTTPS and Plaid production |
| **Ports 80 & 443 open** | For HTTPS via your reverse proxy |

Install Docker on a fresh Ubuntu/Debian server:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in after this
```

---

## Installation

### One-liner (recommended)

```bash
curl -sSL https://get.summa.sh | sh
```

This creates `~/summa/` with a `docker-compose.yml`, a pre-configured `.env` (with auto-generated secrets), and starts the stack.

Install to a custom directory:

```bash
SUMMA_DIR=/opt/summa curl -sSL https://get.summa.sh | sh
```

### Manual

```bash
mkdir -p ~/summa && cd ~/summa

# Download compose file
curl -sSL https://raw.githubusercontent.com/summa-app/summa/master/docker-compose.yml -o docker-compose.yml

# Create .env
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 16)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
BETTER_AUTH_URL=https://summa.yourdomain.com
EOF

docker compose up -d
```

---

## Environment Variables

Edit `~/summa/.env` to configure Summa. All variables are passed into the container via `docker-compose.yml`.

### Required

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Password for the bundled PostgreSQL database |
| `BETTER_AUTH_SECRET` | Random secret for signing auth sessions — **must be kept private** |
| `BETTER_AUTH_URL` | Full public URL of your Summa instance (e.g. `https://summa.example.com`) |

> **Tip:** Generate a strong secret with `openssl rand -hex 32`.

### Optional — Plaid (bank connections)

| Variable | Description |
|---|---|
| `PLAID_CLIENT_ID` | Your Plaid client ID |
| `PLAID_SECRET` | Your Plaid secret key |
| `PLAID_ENV` | `sandbox`, `development`, or `production` |
| `ENCRYPTION_KEY` | 32-byte hex key used to encrypt stored Plaid access tokens |

Generate an encryption key:

```bash
openssl rand -hex 32
```

### Database URL

`DATABASE_URL` is auto-composed from `POSTGRES_PASSWORD` in the default `docker-compose.yml` and does not need to be set manually when using the bundled database. If you're pointing Summa at an external PostgreSQL instance, override it:

```
DATABASE_URL=postgres://user:pass@host:5432/dbname
```

---

## Reverse Proxy & HTTPS

Summa listens on port `3000` inside Docker. You should put it behind a reverse proxy that handles TLS termination.

### Caddy (recommended — automatic HTTPS)

Install Caddy ([docs](https://caddyserver.com/docs/install)), then create a `Caddyfile`:

```
summa.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Start Caddy:

```bash
caddy start --config /etc/caddy/Caddyfile
```

Caddy automatically provisions and renews TLS certificates via Let's Encrypt.

### nginx + Certbot

Install nginx and Certbot, then create `/etc/nginx/sites-available/summa`:

```nginx
server {
    listen 80;
    server_name summa.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name summa.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/summa.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/summa.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and get a certificate:

```bash
sudo ln -s /etc/nginx/sites-available/summa /etc/nginx/sites-enabled/
sudo certbot --nginx -d summa.yourdomain.com
sudo systemctl reload nginx
```

> **Important:** After setting up your domain, update `BETTER_AUTH_URL` in `.env` to `https://summa.yourdomain.com` and restart: `docker compose up -d`.

---

## Persisting & Backing Up the Database

### How data is stored

The bundled PostgreSQL database stores its data in a named Docker volume (`pgdata`). This volume persists across container restarts and `docker compose down` — your data is safe as long as you don't remove the volume explicitly.

To see volumes:

```bash
docker volume ls | grep summa
```

### Backup

Dump the database to a file:

```bash
cd ~/summa
docker compose exec db pg_dump -U summa summa > backup-$(date +%Y%m%d).sql
```

Automate daily backups with cron:

```bash
crontab -e
# Add:
0 2 * * * cd ~/summa && docker compose exec -T db pg_dump -U summa summa > ~/summa/backups/backup-$(date +\%Y\%m\%d).sql
```

### Restore

```bash
cat backup-20240101.sql | docker compose exec -T db psql -U summa summa
```

### External PostgreSQL

To use your own managed database (e.g. Supabase, RDS), remove the `db` service from `docker-compose.yml` and set `DATABASE_URL` directly in `.env`:

```
DATABASE_URL=postgres://user:pass@your-db-host:5432/summa?sslmode=require
```

---

## Updating Summa

Pull the latest image and recreate the container. Your data volume is untouched.

```bash
cd ~/summa
docker compose pull
docker compose up -d
```

This runs database migrations automatically on container start.

To pin to a specific version instead of `latest`, edit the `image:` line in `docker-compose.yml`:

```yaml
image: ghcr.io/summa-app/summa:0.2.0
```

---

## Plaid Setup

Plaid enables automatic bank and investment account syncing.

### 1. Create a Plaid account

Sign up at [plaid.com](https://plaid.com) and create an application to get your `client_id` and `secret`.

### 2. Sandbox (development/testing)

Use sandbox credentials to test without real accounts:

```bash
# In ~/summa/.env:
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox
ENCRYPTION_KEY=$(openssl rand -hex 32)
```

Restart: `docker compose up -d`

Plaid's sandbox provides test credentials (username `user_good`, password `pass_good`) so you can link fake accounts.

### 3. Production

1. In the Plaid dashboard, complete the production access request.
2. Update your `.env` with production credentials:

```bash
PLAID_SECRET=your_production_secret
PLAID_ENV=production
```

3. Ensure `BETTER_AUTH_URL` is set to your public HTTPS domain — Plaid requires a valid redirect URL.

4. Set the `ENCRYPTION_KEY` to a new 32-byte hex value (or keep the one from sandbox). **Do not change this after you have linked accounts** — existing tokens are encrypted with it.

---

## Troubleshooting

### App container keeps restarting

Check logs:

```bash
docker compose logs app --tail=50
```

Common causes:
- `DATABASE_URL` is wrong or the database isn't ready yet — the app retries, but check that `db` is healthy: `docker compose ps`
- `BETTER_AUTH_SECRET` is missing or empty

### "Database connection refused"

Ensure the `db` container is healthy before the `app` starts:

```bash
docker compose ps
# db service should show "(healthy)"
```

If it's stuck: `docker compose restart db` and wait 10–15 seconds.

### Auth errors / can't sign in

- Verify `BETTER_AUTH_URL` exactly matches the URL you're using to access Summa (including `https://` and no trailing slash).
- If you changed `BETTER_AUTH_SECRET`, existing sessions are invalidated — users need to sign in again.

### Plaid "invalid redirect URI"

Ensure `BETTER_AUTH_URL` is set to the exact public URL Plaid will redirect to, and that this URL is whitelisted in your Plaid dashboard under **API** → **Allowed redirect URIs**.

### Port 3000 already in use

Change the host port in `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"   # expose on 8080 instead
```

Then update your reverse proxy and `BETTER_AUTH_URL` accordingly.

### Out of disk space

Check Docker disk usage:

```bash
docker system df
```

Remove old unused images:

```bash
docker image prune -a
```

---

For questions or issues, open a discussion on [GitHub](https://github.com/summa-app/summa/issues).
