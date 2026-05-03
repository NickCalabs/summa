// One-off Playwright capture for kubera-slice-1 verification.
// Takes screenshots and runs the DevTools-equivalent console checks from the plan.
// Usage: TOKEN=<session_token> STAGE=before|after node capture.js

const { chromium } = require("playwright");
const path = require("path");

const TOKEN = process.env.TOKEN;
const STAGE = process.env.STAGE || "before";
const BASE = process.env.BASE || "http://localhost:3000";
const OUT = path.join(__dirname, "summa-baseline");

if (!TOKEN) {
  console.error("TOKEN env is required");
  process.exit(1);
}

const routes = [
  { slug: "dashboard", url: "/dashboard" },
  { slug: "portfolio", url: "/portfolio/dc66233a-7ac5-4cde-a388-e387e9979e5a" },
  { slug: "login", url: "/login", unauthenticated: true },
];

const themes = ["light", "dark"];

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await ctx.addCookies([
    {
      name: "better-auth.session_token",
      value: TOKEN,
      url: BASE,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const report = { stage: STAGE, routes: {}, computedTokens: {}, tailwindUtilities: {} };

  for (const route of routes) {
    for (const theme of themes) {
      const page = await ctx.newPage();
      await page.addInitScript((t) => {
        try { localStorage.setItem("theme", t); } catch (_) {}
      }, theme);
      const resp = await page.goto(BASE + route.url, { waitUntil: "networkidle", timeout: 30000 });
      // Force-apply the theme class (next-themes may hydrate after networkidle)
      await page.evaluate((t) => {
        const el = document.documentElement;
        el.classList.remove("light", "dark");
        el.classList.add(t);
      }, theme);
      // Wait for skeletons to disappear (up to 15s)
      try {
        await page.waitForFunction(
          () => !document.querySelector('[data-slot="skeleton"]') &&
                !Array.from(document.querySelectorAll('*')).some(el => el.className && typeof el.className === 'string' && el.className.includes('animate-pulse')),
          null,
          { timeout: 15000 }
        );
      } catch (_) { /* timed out; screenshot whatever is present */ }
      await page.waitForTimeout(500);

      const label = `${route.slug}-${theme}-${STAGE}`;
      const file = path.join(OUT, `${label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      report.routes[label] = { status: resp && resp.status(), path: file };

      // Run the plan's computed-style + Tailwind utility probes on the first (light dashboard) pass only
      if (route.slug === "dashboard" && theme === "light") {
        report.computedTokens.light = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          return {
            "--font-size-nano": root.getPropertyValue("--font-size-nano"),
            "--font-size-micro": root.getPropertyValue("--font-size-micro"),
            "--font-size-tiny": root.getPropertyValue("--font-size-tiny"),
            "--font-size-small": root.getPropertyValue("--font-size-small"),
            "--font-size-base": root.getPropertyValue("--font-size-base"),
            "--font-size-hero": root.getPropertyValue("--font-size-hero"),
            "--letter-spacing-upper": root.getPropertyValue("--letter-spacing-upper"),
            "--font-weight-tab": root.getPropertyValue("--font-weight-tab"),
            "--sidebar-width": root.getPropertyValue("--sidebar-width"),
            "--row-height": root.getPropertyValue("--row-height"),
            "--card-radius": root.getPropertyValue("--card-radius"),
            "--muted-foreground": root.getPropertyValue("--muted-foreground"),
          };
        });

        report.tailwindUtilities.light = await page.evaluate(() => {
          const out = {};
          const probe = (cls, prop) => {
            const el = document.createElement("span");
            el.className = cls;
            el.style.display = "inline-block";
            document.body.appendChild(el);
            const v = getComputedStyle(el)[prop];
            document.body.removeChild(el);
            return v;
          };
          out["text-nano fontSize"] = probe("text-nano", "fontSize");
          out["text-micro fontSize"] = probe("text-micro", "fontSize");
          out["text-tiny fontSize"] = probe("text-tiny", "fontSize");
          out["text-small fontSize"] = probe("text-small", "fontSize");
          out["text-hero fontSize"] = probe("text-hero", "fontSize");
          out["tracking-upper letterSpacing"] = probe("tracking-upper", "letterSpacing");
          out["w-sidebar width"] = probe("w-sidebar", "width");
          out["h-row height"] = probe("h-row", "height");
          out["rounded-card borderRadius"] = probe("rounded-card", "borderRadius");
          return out;
        });
      }
      if (route.slug === "dashboard" && theme === "dark") {
        report.computedTokens.dark = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          return {
            "--muted-foreground": root.getPropertyValue("--muted-foreground"),
            "--foreground": root.getPropertyValue("--foreground"),
          };
        });
      }

      await page.close();
    }
  }

  await browser.close();

  console.log(JSON.stringify(report, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
