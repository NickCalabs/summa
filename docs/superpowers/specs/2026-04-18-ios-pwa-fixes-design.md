# iOS PWA Stability Fixes

Fix three root-cause issues making the iOS PWA unreliable: session loss, page crashes, and missing offline/caching support.

## Problem

When used as an iOS home-screen PWA at `http://192.168.1.244:3000`:

1. **Frequent logouts** — iOS Safari aggressively purges cookies for non-HTTPS PWAs and when the app is backgrounded. `better-auth` has no explicit session/cookie config, so defaults are too short.
2. **Assets page crashes** — Navigating from the hamburger menu to the Assets sheet mounts `PortfolioView` with all child components eagerly: `DetailPanel` (960 lines + Recharts), `AccountDetailModal` (wraps 2197-line `AccountDetailView`), plus three dialog components. iOS WebKit's ~50% smaller memory budget kills the process.
3. **No service worker** — Every navigation is a full network round-trip. No offline fallback. iOS treats PWAs without service workers as disposable.

Additionally, the app runs on plain HTTP, which blocks service worker registration entirely and worsens iOS cookie behavior.

## Design

### 1. Session Persistence (auth.ts)

Add explicit session configuration to the `betterAuth()` call in `src/lib/auth.ts`:

```ts
export const auth = betterAuth({
  // ...existing config...
  session: {
    expiresIn: 60 * 60 * 24 * 30,   // 30 days (default is 7)
    updateAge: 60 * 60 * 24,         // refresh cookie once per day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,                // 5-min client-side cache avoids re-validation on every request
    },
  },
});
```

**Why these values:**
- `expiresIn: 30 days` — single-user app; long sessions are safe and prevent iOS from expiring the cookie during normal use gaps.
- `updateAge: 1 day` — refreshes the cookie daily so the 30-day window keeps sliding forward without hammering the DB on every request.
- `cookieCache: 5 min` — prevents the client from making a session-validation API call on every page transition, which is especially important on iOS where rapid navigations (drawer open, tap, page load) all fire requests.

### 2. Code-Split Heavy Components (portfolio-view.tsx)

Replace static imports with `next/dynamic` for components that are invisible on initial render:

**Components to lazy-load in `portfolio-view.tsx`:**
| Component | Why | Size |
|---|---|---|
| `DetailPanel` | Slide-over drawer, hidden until asset tap | 960 lines + Recharts |
| `AccountDetailModal` | Dialog, hidden until asset tap | 30 lines but wraps 2197-line `AccountDetailView` |
| `AddFlowDialog` | Dialog, hidden until "Add Asset" | ~200 lines |
| `PlaidConnectDialog` | Dialog, hidden until Plaid connect | ~150 lines |
| `CsvImportDialog` | Dialog, hidden until CSV import | ~300 lines |

All use `next/dynamic` with `ssr: false` since they're client-only modals/drawers:

```tsx
import dynamic from "next/dynamic";

const DetailPanel = dynamic(() =>
  import("./detail-panel").then((m) => ({ default: m.DetailPanel })),
  { ssr: false }
);
const AccountDetailModal = dynamic(() =>
  import("./account-detail-modal").then((m) => ({ default: m.AccountDetailModal })),
  { ssr: false }
);
const AddFlowDialog = dynamic(() =>
  import("./add-flow-dialog").then((m) => ({ default: m.AddFlowDialog })),
  { ssr: false }
);
const PlaidConnectDialog = dynamic(() =>
  import("./plaid-connect-dialog").then((m) => ({ default: m.PlaidConnectDialog })),
  { ssr: false }
);
const CsvImportDialog = dynamic(() =>
  import("./csv-import-dialog").then((m) => ({ default: m.CsvImportDialog })),
  { ssr: false }
);
```

This defers loading ~4,500 lines of component code (including Recharts) until the user actually opens a modal or drawer. The initial portfolio sheet renders with only `TopBar`, `SheetTotalHeader`, `SheetSummaryRow`, and `SheetView` — the visible content.

### 3. HTTPS via Custom Server

Since the app is LAN-only (no public domain), use a self-signed CA with a Node HTTPS wrapper.

**3a. Generate certificates** (one-time, on CT 142):

```bash
mkdir -p /opt/summa/certs
# Generate CA
openssl genrsa -out /opt/summa/certs/ca.key 2048
openssl req -x509 -new -nodes -key /opt/summa/certs/ca.key \
  -sha256 -days 3650 -out /opt/summa/certs/ca.crt \
  -subj "/CN=Summa Local CA"

# Generate server cert
openssl genrsa -out /opt/summa/certs/server.key 2048
openssl req -new -key /opt/summa/certs/server.key \
  -out /opt/summa/certs/server.csr \
  -subj "/CN=192.168.1.244"

# Sign with SAN for the LAN IP
openssl x509 -req -in /opt/summa/certs/server.csr \
  -CA /opt/summa/certs/ca.crt -CAkey /opt/summa/certs/ca.key \
  -CAcreateserial -out /opt/summa/certs/server.crt \
  -days 3650 -sha256 \
  -extfile <(printf "subjectAltName=IP:192.168.1.244")
```

**3b. Create `server.js`** at project root:

A minimal HTTPS wrapper around the Next.js standalone server. Reads cert/key from `/opt/summa/certs/`, creates an `https.createServer()`, and hands requests to Next.js's request handler. Falls back to HTTP if certs are missing (for dev).

Listens on port 3000 (HTTPS) by default. The `.env` values for `BETTER_AUTH_URL` and `NEXT_PUBLIC_BETTER_AUTH_URL` change from `http://` to `https://`.

**3c. iOS CA installation** (one-time, manual):
1. Transfer `ca.crt` to iPhone (AirDrop, email, or serve it via HTTP temporarily)
2. Settings > General > VPN & Device Management > Install the profile
3. Settings > General > About > Certificate Trust Settings > Enable trust for "Summa Local CA"
4. Delete the old HTTP PWA bookmark and re-add from `https://192.168.1.244:3000`

**3d. Add `certs/` to `.gitignore`.**

### 4. Service Worker (serwist)

Add `@serwist/next` and `serwist` as dependencies. Serwist is the actively maintained successor to `next-pwa`.

**4a. `next.config.ts`** — wrap with `withSerwist`:

```ts
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
});

export default withSerwist(nextConfig);
```

**4b. Create `src/sw.ts`** — the service worker source:

```ts
import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

`defaultCache` from serwist provides sensible defaults:
- **NetworkFirst** for pages and API routes
- **StaleWhileRevalidate** for static assets (JS, CSS)
- **CacheFirst** for images and fonts

**4c. Register the service worker** — serwist handles this automatically via the Next.js plugin. No manual registration code needed.

**4d. Manifest updates** — add `id` field to `manifest.json` for PWA identity stability:

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
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml" },
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Note: PNG icons (192x192 and 512x512) should be generated from the existing SVG icon. iOS requires raster icons for the home screen — the SVG-only manifest is why the current PWA may show a blank/default icon.

## Files Changed

| File | Change |
|---|---|
| `src/lib/auth.ts` | Add session config (expiresIn, updateAge, cookieCache) |
| `src/components/portfolio/portfolio-view.tsx` | Replace 5 static imports with `next/dynamic` |
| `server.js` | New — HTTPS wrapper for Next.js standalone |
| `src/sw.ts` | New — service worker source |
| `next.config.ts` | Wrap with `withSerwist` |
| `public/manifest.json` | Add `id`, add PNG icon entries |
| `public/icon-192.png` | New — raster icon for PWA |
| `public/icon-512.png` | New — raster icon for PWA |
| `.env` | Update URLs from http to https |
| `.gitignore` | Add `certs/`, `public/sw.js`, `public/sw.js.map` |
| `package.json` | Add `@serwist/next`, `serwist` |

## What This Does NOT Cover

- **Virtualization of asset rows** — deferred; personal portfolios rarely have 100+ assets per sheet.
- **Offline data** — the service worker caches assets and pages but does not cache API responses for offline use. That would require an IndexedDB strategy and is a separate effort.
- **Automatic cert renewal** — the self-signed cert is valid for 10 years. If the LAN IP changes, regenerate.
