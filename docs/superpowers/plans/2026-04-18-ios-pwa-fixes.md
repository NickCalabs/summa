# iOS PWA Stability Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three root causes of iOS PWA instability: session loss, page crashes from eager component loading, and missing service worker/HTTPS.

**Architecture:** Four sequential tasks — session config, code-splitting, HTTPS custom server, and service worker. Each produces a working commit. The HTTPS server replaces `next start` in the systemd unit.

**Tech Stack:** better-auth session config, next/dynamic, Node.js https module, @serwist/next + serwist

---

### Task 1: Session Persistence

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Add session config to better-auth**

In `src/lib/auth.ts`, add the `session` key to the `betterAuth()` config object. Place it after the `user` block (line 38), before the closing `});`:

```ts
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
```

The full file should read:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sql } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.user);
          if (Number(result[0].count) > 0) {
            return false;
          }
        },
      },
    },
  },
  user: {
    additionalFields: {
      defaultCurrency: {
        type: "string",
        defaultValue: "USD",
        required: false,
        input: true,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
});
```

- [ ] **Step 2: Verify the app builds**

Run: `pnpm build`
Expected: Build succeeds with no errors. The session config is validated at startup by better-auth.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "fix(auth): configure 30-day session with cookie cache for iOS PWA"
```

---

### Task 2: Code-Split Heavy Components

**Files:**
- Modify: `src/components/portfolio/portfolio-view.tsx`

- [ ] **Step 1: Replace five static imports with dynamic imports**

In `src/components/portfolio/portfolio-view.tsx`, replace these five import lines (lines 18-22):

```ts
import { DetailPanel } from "./detail-panel";
import { AddFlowDialog } from "./add-flow-dialog";
import { AccountDetailModal } from "./account-detail-modal";
import { PlaidConnectDialog } from "./plaid-connect-dialog";
import { CsvImportDialog } from "./csv-import-dialog";
```

With:

```ts
import dynamic from "next/dynamic";

const DetailPanel = dynamic(
  () => import("./detail-panel").then((m) => ({ default: m.DetailPanel })),
  { ssr: false },
);
const AccountDetailModal = dynamic(
  () => import("./account-detail-modal").then((m) => ({ default: m.AccountDetailModal })),
  { ssr: false },
);
const AddFlowDialog = dynamic(
  () => import("./add-flow-dialog").then((m) => ({ default: m.AddFlowDialog })),
  { ssr: false },
);
const PlaidConnectDialog = dynamic(
  () => import("./plaid-connect-dialog").then((m) => ({ default: m.PlaidConnectDialog })),
  { ssr: false },
);
const CsvImportDialog = dynamic(
  () => import("./csv-import-dialog").then((m) => ({ default: m.CsvImportDialog })),
  { ssr: false },
);
```

No other changes needed — the JSX references stay identical since the variable names are the same.

- [ ] **Step 2: Verify the app builds**

Run: `pnpm build`
Expected: Build succeeds. You should see additional chunks in the build output for the dynamically imported components.

- [ ] **Step 3: Smoke-test locally**

Run: `pnpm dev`

1. Open `http://localhost:3000` in a browser
2. Navigate to the portfolio/assets page — the sheet should render normally
3. Click an asset row — the detail panel should open (loaded on demand)
4. Open the "Add Asset" flow — the dialog should appear

All features work identically; they just load on first use instead of page load.

- [ ] **Step 4: Commit**

```bash
git add src/components/portfolio/portfolio-view.tsx
git commit -m "perf(portfolio): lazy-load modals and detail panel to reduce iOS memory pressure"
```

---

### Task 3: HTTPS Custom Server

**Files:**
- Create: `server.js` (project root)
- Modify: `.gitignore`
- Modify: `.env` (manual — not committed)
- Modify: `package.json` (add `start:https` script)

- [ ] **Step 1: Generate self-signed certificates**

Run these commands on the server (CT 142). They create a local CA and a server cert valid for 10 years, with a SAN for the LAN IP:

```bash
mkdir -p /opt/summa/certs

openssl genrsa -out /opt/summa/certs/ca.key 2048

openssl req -x509 -new -nodes -key /opt/summa/certs/ca.key \
  -sha256 -days 3650 -out /opt/summa/certs/ca.crt \
  -subj "/CN=Summa Local CA"

openssl genrsa -out /opt/summa/certs/server.key 2048

openssl req -new -key /opt/summa/certs/server.key \
  -out /opt/summa/certs/server.csr \
  -subj "/CN=192.168.1.244"

openssl x509 -req -in /opt/summa/certs/server.csr \
  -CA /opt/summa/certs/ca.crt -CAkey /opt/summa/certs/ca.key \
  -CAcreateserial -out /opt/summa/certs/server.crt \
  -days 3650 -sha256 \
  -extfile <(printf "subjectAltName=IP:192.168.1.244")
```

Expected: `certs/` directory contains `ca.key`, `ca.crt`, `server.key`, `server.csr`, `server.crt`, `ca.srl`.

- [ ] **Step 2: Add certs/ to .gitignore**

Append to `.gitignore`:

```
# TLS certs (local CA)
/certs/
```

- [ ] **Step 3: Create server.js**

Create `server.js` at the project root:

```js
const { createServer: createHttpsServer } = require("https");
const { createServer: createHttpServer } = require("http");
const { readFileSync, existsSync } = require("fs");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

const certDir = process.env.CERT_DIR || "/opt/summa/certs";
const hasCerts =
  existsSync(`${certDir}/server.crt`) && existsSync(`${certDir}/server.key`);

app.prepare().then(() => {
  const handler = (req, res) => {
    handle(req, res, parse(req.url, true));
  };

  if (hasCerts) {
    const httpsOptions = {
      key: readFileSync(`${certDir}/server.key`),
      cert: readFileSync(`${certDir}/server.crt`),
    };
    createHttpsServer(httpsOptions, handler).listen(port, () => {
      console.log(`> HTTPS ready on https://0.0.0.0:${port}`);
    });
  } else {
    console.warn("! No TLS certs found — falling back to HTTP");
    createHttpServer(handler).listen(port, () => {
      console.log(`> HTTP ready on http://0.0.0.0:${port}`);
    });
  }
});
```

- [ ] **Step 4: Add start:https script to package.json**

Add a new script to `package.json`:

```json
"start:https": "NODE_ENV=production node server.js"
```

Place it after the existing `"start": "next start"` line. The existing `start` script is left untouched for dev/CI use.

- [ ] **Step 5: Update .env auth URLs**

Manually edit `/opt/summa/.env` — change both auth URL values from `http` to `https`:

```
BETTER_AUTH_URL=https://192.168.1.244:3000
NEXT_PUBLIC_BETTER_AUTH_URL=https://192.168.1.244:3000
```

This file is gitignored, so this is a manual server-only change.

- [ ] **Step 6: Update systemd service**

Edit `/etc/systemd/system/summa.service` — change the `ExecStart` line:

```ini
ExecStart=/bin/pnpm start:https
```

Then reload and restart:

```bash
systemctl daemon-reload
systemctl restart summa
```

- [ ] **Step 7: Verify HTTPS works**

Run: `curl -k https://192.168.1.244:3000/api/health`
Expected: A 200 response. The `-k` flag is needed because curl doesn't trust the self-signed CA.

- [ ] **Step 8: Commit**

```bash
git add server.js .gitignore package.json
git commit -m "feat: add HTTPS custom server with self-signed CA for iOS PWA"
```

- [ ] **Step 9: Install CA on iPhone (manual, user action)**

1. Transfer `/opt/summa/certs/ca.crt` to iPhone (AirDrop, email attachment, or serve temporarily via HTTP)
2. On iPhone: Settings > General > VPN & Device Management > tap the "Summa Local CA" profile > Install
3. Settings > General > About > Certificate Trust Settings > toggle ON "Summa Local CA"
4. In Safari, visit `https://192.168.1.244:3000` — should load without cert warnings
5. Delete old HTTP PWA from home screen, re-add from the HTTPS URL

---

### Task 4: Service Worker via Serwist

**Files:**
- Create: `src/sw.ts`
- Modify: `next.config.ts`
- Modify: `public/manifest.json`
- Modify: `.gitignore`
- Create: `public/icon-192.png` (generated from SVG)
- Create: `public/icon-512.png` (generated from SVG)

- [ ] **Step 1: Install serwist dependencies**

```bash
pnpm add -D @serwist/next serwist
```

Expected: Both packages install successfully and appear in `devDependencies`.

- [ ] **Step 2: Add service worker build artifacts to .gitignore**

Append to `.gitignore`:

```
# Serwist service worker (generated at build)
/public/sw.js
/public/sw.js.map
/public/swe-worker-*.js
```

- [ ] **Step 3: Create the service worker source**

Create `src/sw.ts`:

```ts
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

- [ ] **Step 4: Wrap next.config.ts with serwist**

Replace the contents of `next.config.ts` with:

```ts
import type { NextConfig } from "next";
import { execSync } from "child_process";
import withSerwistInit from "@serwist/next";

function getGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require("./package.json") as { version: string };

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["postgres"],
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_GIT_SHA: getGitSha(),
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
```

Note: `disable: process.env.NODE_ENV === "development"` prevents the service worker from being generated during `pnpm dev` — it only activates for production builds.

- [ ] **Step 5: Generate PNG icons from existing SVG**

The SVG at `public/icon.svg` is a 512x512 rounded-rect with a white "S". Generate raster PNGs for iOS PWA (iOS ignores SVG icons in the manifest):

```bash
# Requires: apt install librsvg2-bin (or brew install librsvg on macOS)
rsvg-convert -w 192 -h 192 public/icon.svg -o public/icon-192.png
rsvg-convert -w 512 -h 512 public/icon.svg -o public/icon-512.png
```

If `rsvg-convert` is not available, install it:
```bash
apt-get install -y librsvg2-bin
```

Verify both files exist and are valid PNGs:
```bash
file public/icon-192.png public/icon-512.png
```
Expected: Both report as PNG image data with correct dimensions.

- [ ] **Step 6: Update manifest.json**

Replace `public/manifest.json` with:

```json
{
  "id": "/dashboard",
  "name": "Summa",
  "short_name": "Summa",
  "description": "Self-hosted net worth tracker",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml"
    },
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 7: Build and verify service worker is generated**

Run: `pnpm build`

Expected: Build succeeds. Check that the service worker was generated:
```bash
ls -la public/sw.js
```
Expected: `public/sw.js` exists and is non-empty.

- [ ] **Step 8: Deploy and verify end-to-end**

Rebuild and restart the production server:

```bash
pnpm build && systemctl restart summa
```

In a browser, visit `https://192.168.1.244:3000`:
1. Open DevTools > Application > Service Workers — should show `sw.js` as active
2. Check Application > Manifest — should show the full manifest with PNG icons
3. Navigate around — subsequent navigations should be faster (cached assets)

- [ ] **Step 9: Commit**

```bash
git add src/sw.ts next.config.ts public/manifest.json public/icon-192.png public/icon-512.png .gitignore
git commit -m "feat: add service worker and PWA icons for offline caching"
```
