/**
 * Kubera UI/UX audit harness.
 * Phase 1: auth probe — fail loudly if not authenticated.
 * Phase 2: full crawl — screenshots, DOM, computed styles, network.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = '/opt/summa/kubera-audit';
const SHOTS = path.join(OUT, 'screenshots');
const RAW = path.join(OUT, 'raw');
const TOKEN = process.env.KUBERA_TOKEN;
if (!TOKEN) { console.error('KUBERA_TOKEN env required'); process.exit(2); }

// Decoded from the JWT payload
const CLIENT_ID = '4s3p5qi7spb7cd5vtgj920ofvt';
const USERNAME = 'dec1652d-25a9-48fe-96f5-cbaf2a0b13ba';

const BASE_CANDIDATES = [
  'https://app.kubera.com',
  'https://kubera.com',
];

let shotIdx = 0;
async function snap(page, label) {
  shotIdx += 1;
  const name = `${String(shotIdx).padStart(2,'0')}-${label}.png`;
  try {
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
    console.log(`  shot: ${name}`);
  } catch (e) {
    console.log(`  shot FAIL ${name}: ${e.message}`);
  }
  return name;
}

async function dumpHtml(page, label) {
  const html = await page.content();
  fs.writeFileSync(path.join(RAW, `${label}.html`), html);
}

async function dump(label, obj) {
  fs.writeFileSync(path.join(RAW, `${label}.json`), JSON.stringify(obj, null, 2));
}

async function authProbe(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });

  // Strategy: install everything we can think of before first navigation.
  // 1. Cookies under both candidate domains
  const cookieNames = ['_kubera_session', 'kubera_session', 'session', 'access_token', 'auth_token', 'Authorization'];
  const cookies = [];
  for (const dom of ['.kubera.com', '.app.kubera.com']) {
    for (const n of cookieNames) {
      cookies.push({ name: n, value: TOKEN, domain: dom, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' });
    }
  }
  await ctx.addCookies(cookies);

  // 2. Inject localStorage on first navigation via init script
  await ctx.addInitScript(({token, clientId, username}) => {
    const p = `CognitoIdentityServiceProvider.${clientId}`;
    try {
      localStorage.setItem(`${p}.LastAuthUser`, username);
      localStorage.setItem(`${p}.${username}.accessToken`, token);
      localStorage.setItem(`${p}.${username}.idToken`, token);
      localStorage.setItem(`${p}.${username}.clockDrift`, '0');
      localStorage.setItem(`${p}.${username}.userData`, JSON.stringify({Username: username}));
      // generic fallbacks
      localStorage.setItem('kubera.accessToken', token);
      localStorage.setItem('accessToken', token);
      localStorage.setItem('token', token);
    } catch (e) {}
  }, { token: TOKEN, clientId: CLIENT_ID, username: USERNAME });

  // 3. Authorization header on all requests (SPA APIs usually accept this)
  await ctx.setExtraHTTPHeaders({ 'Authorization': `Bearer ${TOKEN}` });

  const page = await ctx.newPage();
  const netLog = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (!/kubera|cognito|amazonaws/.test(url)) return;
    const row = { url, status: res.status(), method: res.request().method(), ct: res.headers()['content-type'] || '' };
    try {
      if (row.ct.includes('json')) {
        const t = await res.text();
        row.body = t.slice(0, 1500);
      }
    } catch {}
    netLog.push(row);
  });

  const tryUrls = [
    'https://app.kubera.com/',
    'https://kubera.com/',
  ];
  let ok = false;
  let finalUrl = '';
  let bodySignals = {};
  for (const u of tryUrls) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000); // let SPA bootstrap
      finalUrl = page.url();
      await snap(page, `probe-${u.replace(/[^a-z0-9]/gi,'_').slice(0,40)}`);
      const sig = await page.evaluate(() => {
        const txt = document.body?.innerText || '';
        return {
          url: location.href,
          title: document.title,
          hasLogin: /sign\s*in|log\s*in|password/i.test(txt),
          hasAuthedShell: /net\s*worth|portfolio|dashboard|recap/i.test(txt),
          textSample: txt.slice(0, 600),
          lsKeys: Object.keys(localStorage).slice(0, 20),
        };
      });
      bodySignals[u] = sig;
      if (sig.hasAuthedShell && !sig.hasLogin) { ok = true; break; }
      // if not authed yet, try any secondary routes
      for (const route of ['/portfolio', '/recap', '/dashboard']) {
        try {
          await page.goto(`https://app.kubera.com${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(2500);
          const s2 = await page.evaluate(() => ({
            url: location.href,
            hasLogin: /sign\s*in|log\s*in|password/i.test(document.body?.innerText||''),
            hasAuthedShell: /net\s*worth|portfolio|dashboard|recap/i.test(document.body?.innerText||''),
            text: (document.body?.innerText||'').slice(0,400),
          }));
          bodySignals[`app.kubera.com${route}`] = s2;
          await snap(page, `probe-route-${route.replace(/\W/g,'')}`);
          if (s2.hasAuthedShell && !s2.hasLogin) { ok = true; break; }
        } catch (e) { bodySignals[`err_${route}`] = String(e.message); }
      }
      if (ok) break;
    } catch (e) {
      bodySignals[`err_${u}`] = String(e.message);
    }
  }
  await dump('auth-probe', { ok, finalUrl, bodySignals, netLogCount: netLog.length, netLogSample: netLog.slice(0, 30) });
  return { ok, ctx, page, netLog };
}

// --- style extraction helper (runs in the page) ---
const EXTRACT_TOKENS_FN = () => {
  function read(el, props) {
    if (!el) return null;
    const s = getComputedStyle(el);
    const out = {};
    for (const p of props) out[p] = s.getPropertyValue(p).trim();
    const r = el.getBoundingClientRect();
    out.width = Math.round(r.width);
    out.height = Math.round(r.height);
    out.tag = el.tagName;
    out.cls = el.className?.toString?.().slice(0, 120) || '';
    return out;
  }
  const props = ['font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','border','border-radius','padding','margin','box-shadow','transition'];
  const pick = (sels) => {
    for (const s of sels) { const el = document.querySelector(s); if (el) return {sel: s, ...read(el, props)}; }
    return null;
  };
  // heuristics — selectors differ across builds, so we try broad lists
  const results = {
    body: read(document.body, props),
    h1: pick(['h1']),
    h2: pick(['h2']),
    h3: pick(['h3']),
    sidebar: pick(['nav','[class*=idebar]','[class*=aside]','aside','[role=navigation]']),
    sidebarItem: pick(['nav a','[class*=idebar] a','aside a']),
    topBar: pick(['header','[class*=opbar]','[class*=eader]']),
    card: pick(['[class*=card]','[class*=tat]','[class*=panel]']),
    tableHeader: pick(['thead th','[role=columnheader]','[class*=col-header]','[class*=columnHeader]']),
    tableCell: pick(['tbody td','[role=cell]','[class*=cell]']),
    button: pick(['button','[role=button]']),
    input: pick(['input','textarea']),
    link: pick(['a']),
  };
  // collect all unique colors used on the visible page (sample a few hundred elements)
  const all = Array.from(document.querySelectorAll('*')).slice(0, 2500);
  const colors = {}, bgs = {}, fonts = {};
  for (const el of all) {
    const s = getComputedStyle(el);
    colors[s.color] = (colors[s.color]||0) + 1;
    bgs[s.backgroundColor] = (bgs[s.backgroundColor]||0) + 1;
    fonts[s.fontFamily] = (fonts[s.fontFamily]||0) + 1;
  }
  const topN = (obj, n) => Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n);
  return {
    results,
    topColors: topN(colors, 25),
    topBgs: topN(bgs, 25),
    topFonts: topN(fonts, 15),
    rootVars: (() => {
      const cs = getComputedStyle(document.documentElement);
      const out = {};
      for (let i = 0; i < cs.length; i++) {
        const k = cs[i]; if (k.startsWith('--')) out[k] = cs.getPropertyValue(k).trim();
      }
      return out;
    })(),
    url: location.href,
    title: document.title,
  };
};

const DOM_SNAPSHOT_FN = () => {
  function summarize(el, depth, maxDepth) {
    if (!el || depth > maxDepth) return null;
    const out = {
      tag: el.tagName?.toLowerCase?.(),
      id: el.id || undefined,
      cls: el.className?.toString?.().slice(0, 120) || undefined,
      w: Math.round(el.getBoundingClientRect?.().width || 0),
      h: Math.round(el.getBoundingClientRect?.().height || 0),
    };
    const children = Array.from(el.children || []).slice(0, 20);
    if (children.length && depth < maxDepth) {
      out.children = children.map(c => summarize(c, depth+1, maxDepth)).filter(Boolean);
    }
    return out;
  }
  return {
    title: document.title,
    url: location.href,
    main: summarize(document.querySelector('main') || document.body, 0, 4),
    headScripts: Array.from(document.scripts).map(s => s.src).filter(Boolean).slice(0, 40),
  };
};

async function capturePage(page, label) {
  await page.waitForTimeout(1500);
  await snap(page, label);
  await dumpHtml(page, label);
  try {
    const tokens = await page.evaluate(EXTRACT_TOKENS_FN);
    await dump(`${label}-tokens`, tokens);
  } catch (e) { await dump(`${label}-tokens-err`, { err: String(e.message) }); }
  try {
    const dom = await page.evaluate(DOM_SNAPSHOT_FN);
    await dump(`${label}-dom`, dom);
  } catch (e) { await dump(`${label}-dom-err`, { err: String(e.message) }); }
}

async function fullAudit(ctx, page, netLog) {
  const routes = [
    { url: 'https://app.kubera.com/', label: 'dashboard' },
    { url: 'https://app.kubera.com/portfolio', label: 'portfolio' },
    { url: 'https://app.kubera.com/recap', label: 'recap' },
    { url: 'https://app.kubera.com/insights', label: 'insights' },
    { url: 'https://app.kubera.com/beneficiary', label: 'beneficiary' },
    { url: 'https://app.kubera.com/settings', label: 'settings' },
  ];
  for (const r of routes) {
    try {
      console.log(`→ ${r.label} ${r.url}`);
      await page.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3500);
      await capturePage(page, r.label);
    } catch (e) {
      console.log(`  ${r.label} error: ${e.message}`);
      await dump(`${r.label}-err`, { err: String(e.message) });
    }
  }

  // Responsive snapshots at 1024 and 768 on dashboard + portfolio
  for (const [w,h] of [[1024,768],[768,1024]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const r of [{url:'https://app.kubera.com/',l:'dashboard'},{url:'https://app.kubera.com/portfolio',l:'portfolio'}]) {
      try {
        await page.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500);
        await snap(page, `${r.l}-${w}x${h}`);
      } catch (e) {}
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // Interaction: try to open a row detail on portfolio
  try {
    await page.goto('https://app.kubera.com/portfolio', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await snap(page, 'portfolio-prehover');
    // attempt click on first asset-looking row
    const rowSel = ['[class*=row]:not(header):not(thead)','[role=row]','tbody tr'];
    for (const s of rowSel) {
      const el = await page.$(s);
      if (el) {
        try { await el.click({ timeout: 2000 }); } catch {}
        await page.waitForTimeout(2500);
        await snap(page, 'portfolio-row-click');
        break;
      }
    }
  } catch (e) { await dump('interaction-err', { err: String(e.message) }); }

  await dump('network-log', netLog.slice(0, 500));
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(RAW, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const { ok, ctx, page, netLog } = await authProbe(browser);
  if (!ok) {
    console.error('\nAUTH FAILED — login page detected or no authenticated shell.');
    console.error('See raw/auth-probe.json and screenshots/01-probe-*.png for details.');
    await browser.close();
    process.exit(3);
  }
  console.log('AUTH OK — proceeding with full audit.');
  await fullAudit(ctx, page, netLog);
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('fatal:', e); process.exit(1); });
