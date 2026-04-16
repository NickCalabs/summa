/**
 * Deep capture for the routes that came back blank — wait for networkidle and
 * for real content selectors before screenshotting. Also: drill into portfolio
 * interactions (row click, sheet tab click, add-row menu) and Recap sub-tabs.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');

const OUT = '/opt/summa/kubera-audit';
const SHOTS = path.join(OUT, 'screenshots');
const RAW = path.join(OUT, 'raw');
const TOKEN = process.env.KUBERA_TOKEN;
const CLIENT_ID = '4s3p5qi7spb7cd5vtgj920ofvt';
const USERNAME = 'dec1652d-25a9-48fe-96f5-cbaf2a0b13ba';

let idx = 12; // continue numbering after first pass
const snap = async (p, label) => {
  idx += 1;
  const name = `${String(idx).padStart(2,'0')}-${label}.png`;
  try { await p.screenshot({ path: path.join(SHOTS, name), fullPage: true }); console.log('  shot', name); }
  catch(e) { console.log('  shot FAIL', name, e.message); }
  return name;
};
const dump = (label, obj) => fs.writeFileSync(path.join(RAW, `${label}.json`), JSON.stringify(obj, null, 2));
const dumpHtml = (p, label) => p.content().then(h => fs.writeFileSync(path.join(RAW, `${label}.html`), h));

const TOKENS_FN = () => {
  const pick = (sels) => { for (const s of sels) { const el = document.querySelector(s); if (el) return {sel:s, ...read(el)}; } return null; };
  function read(el) {
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    const props = ['font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','border','border-radius','padding','margin','box-shadow','transition','display','align-items','justify-content','gap'];
    const out = { tag: el.tagName, cls: (el.className?.toString?.()||'').slice(0,150), w: Math.round(r.width), h: Math.round(r.height) };
    for (const p of props) out[p] = s.getPropertyValue(p).trim();
    return out;
  }
  const all = Array.from(document.querySelectorAll('*')).slice(0,3000);
  const colors={}, bgs={}, fonts={}, sizes={}, weights={};
  for (const el of all) {
    const s=getComputedStyle(el); const r=el.getBoundingClientRect();
    if (r.width===0||r.height===0) continue;
    colors[s.color]=(colors[s.color]||0)+1;
    bgs[s.backgroundColor]=(bgs[s.backgroundColor]||0)+1;
    fonts[s.fontFamily]=(fonts[s.fontFamily]||0)+1;
    sizes[s.fontSize]=(sizes[s.fontSize]||0)+1;
    weights[s.fontWeight]=(weights[s.fontWeight]||0)+1;
  }
  const top=(o,n)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,n);
  return {
    targets: {
      body: read(document.body),
      h1: pick(['h1']), h2: pick(['h2']), h3: pick(['h3']),
      netWorth: pick(['[class*=etWorth]','[class*=net-worth]','[data-testid*=networth i]']),
      sidebar: pick(['nav','[class*=idebar]','aside','[role=navigation]']),
      sidebarItem: pick(['nav a','[class*=idebar] a','aside a']),
      sidebarActive: pick(['nav .active','[class*=idebar] [class*=active]','[aria-current=page]']),
      topBar: pick(['header','[class*=opbar]','[class*=eader]']),
      card: pick(['[class*=card]','[class*=tat-]','[class*=tats]']),
      sheetTab: pick(['[role=tab]','[class*=sheetTab]','[class*=heet-tab]','[class*=tab]']),
      sheetTabActive: pick(['[role=tab][aria-selected=true]','[class*=abActive]','[class*=active-tab]']),
      tableHeader: pick(['thead th','[role=columnheader]','[class*=olumnHeader]','[class*=col-head]']),
      tableRow: pick(['tbody tr','[role=row]:not([aria-rowindex="1"])','[class*=row]']),
      tableCell: pick(['tbody td','[role=cell]','[class*=cell]']),
      sectionHeader: pick(['[class*=ection-header]','[class*=ectionHeader]','[class*=group-header]']),
      positive: pick(['[class*=positive]','[class*=green]','[class*=up]','.text-green-500']),
      negative: pick(['[class*=negative]','[class*=red]','[class*=down]']),
      button: pick(['button:not([aria-hidden])','[role=button]']),
      primaryBtn: pick(['button[class*=primary]','[class*=btn-primary]']),
      input: pick(['input[type=text]','input:not([type=hidden])','textarea']),
      chartWrap: pick(['[class*=chart]','[class*=Chart]','svg.highcharts-root','.recharts-wrapper']),
      chartSvg: pick(['svg.highcharts-root','svg.recharts-surface','svg[class*=chart]']),
    },
    stats: { topColors: top(colors,30), topBgs: top(bgs,30), topFonts: top(fonts,10), topSizes: top(sizes,15), topWeights: top(weights,8) },
    rootVars: (() => { const cs=getComputedStyle(document.documentElement); const o={}; for(let i=0;i<cs.length;i++){const k=cs[i]; if(k.startsWith('--')) o[k]=cs.getPropertyValue(k).trim();} return o; })(),
    chartLibs: {
      highcharts: !!window.Highcharts,
      recharts: !!document.querySelector('.recharts-wrapper'),
      chartjs: !!window.Chart,
      d3: !!window.d3,
      echarts: !!window.echarts,
      nivo: !!document.querySelector('[class*=nivo]'),
    },
    url: location.href, title: document.title,
  };
};

const DOM_FN = (depth = 4) => {
  function s(el, d){ if(!el||d>depth) return null;
    const r = el.getBoundingClientRect?.() || {width:0,height:0};
    const o = { tag: el.tagName?.toLowerCase?.(), id: el.id||undefined, cls: (el.className?.toString?.()||'').slice(0,160)||undefined, w: Math.round(r.width), h: Math.round(r.height) };
    const kids = Array.from(el.children||[]).slice(0,25);
    if (kids.length && d<depth) o.children = kids.map(c=>s(c,d+1)).filter(Boolean);
    return o;
  }
  return { url: location.href, title: document.title, main: s(document.querySelector('main') || document.body, 0) };
};

async function gotoDeep(page, url, { label }) {
  console.log('→', label, url);
  const navErrors = [];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  } catch (e) { navErrors.push(String(e.message)); }
  // wait for networkidle, but tolerate slow long-polls
  try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch {}
  // wait for a plausible content selector for up to 15s
  const contentSelectors = ['[class*=row] [class*=cell]', '[role=row]', 'table tbody tr', '[class*=asset]', '[class*=heet]', 'svg.highcharts-root', '[class*=chart]'];
  for (const sel of contentSelectors) {
    try { await page.waitForSelector(sel, { timeout: 5000 }); console.log('  matched', sel); break; } catch {}
  }
  // small settle
  await page.waitForTimeout(2500);
  await snap(page, label);
  await dumpHtml(page, label);
  try { dump(`${label}-tokens`, await page.evaluate(TOKENS_FN)); } catch(e){ dump(`${label}-tokens-err`,{err:String(e.message)}); }
  try { dump(`${label}-dom`, await page.evaluate(DOM_FN)); } catch(e){ dump(`${label}-dom-err`,{err:String(e.message)}); }
  if (navErrors.length) dump(`${label}-nav-err`, navErrors);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  await ctx.addInitScript(({token, clientId, username}) => {
    const p = `CognitoIdentityServiceProvider.${clientId}`;
    try {
      localStorage.setItem(`${p}.LastAuthUser`, username);
      localStorage.setItem(`${p}.${username}.accessToken`, token);
      localStorage.setItem(`${p}.${username}.idToken`, token);
      localStorage.setItem(`${p}.${username}.clockDrift`,'0');
      localStorage.setItem(`${p}.${username}.userData`, JSON.stringify({Username:username}));
      localStorage.setItem('accessToken', token);
      localStorage.setItem('token', token);
    } catch {}
  }, { token: TOKEN, clientId: CLIENT_ID, username: USERNAME });
  await ctx.setExtraHTTPHeaders({ 'Authorization': `Bearer ${TOKEN}` });

  const page = await ctx.newPage();
  const net = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (!/api\.kubera\.com|kubera\.com\/api/.test(u)) return;
    const r = { url: u, status: res.status(), method: res.request().method(), ct: res.headers()['content-type']||'' };
    try { if (r.ct.includes('json')) r.body = (await res.text()).slice(0,2000); } catch {}
    net.push(r);
  });

  // warm up auth
  await page.goto('https://app.kubera.com/networth', { waitUntil:'domcontentloaded' });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}

  // Re-capture the three that were blank + a portfolio row interaction + recap sub-tabs
  const routes = [
    { url: 'https://app.kubera.com/portfolio', label: 'portfolio-deep' },
    { url: 'https://app.kubera.com/insights', label: 'insights-deep' },
    { url: 'https://app.kubera.com/settings', label: 'settings-deep' },
  ];
  for (const r of routes) await gotoDeep(page, r.url, { label: r.label });

  // Portfolio interactions
  try {
    await page.goto('https://app.kubera.com/portfolio', { waitUntil:'domcontentloaded' });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(3000);
    await snap(page, 'portfolio-loaded');

    // Try a section header collapse toggle
    const chevron = await page.$('[class*=chevron], [class*=caret], [class*=expand], [class*=collapse], button[aria-expanded]');
    if (chevron) { try { await chevron.click({timeout:2000}); await page.waitForTimeout(1500); await snap(page,'portfolio-section-toggle'); } catch {} }

    // Click first row to open detail panel
    const row = await page.$('[role=row]:nth-of-type(2), tbody tr:first-child, [class*=row]:not(header)');
    if (row) { try { await row.click({timeout:2500}); await page.waitForTimeout(2500); await snap(page,'portfolio-detail-panel'); await dumpHtml(page,'portfolio-detail-panel'); } catch {} }

    // Close detail — Escape key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);

    // Right-click a row for context menu
    const row2 = await page.$('[role=row], tbody tr, [class*=row]');
    if (row2) { try { await row2.click({ button:'right', timeout:2500 }); await page.waitForTimeout(1200); await snap(page,'portfolio-context-menu'); } catch {} }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // Try the "+" add button
    const addBtn = await page.$('button[aria-label*=add i], button[class*=add i], button[title*=add i], [class*=addRow]');
    if (addBtn) { try { await addBtn.click({timeout:2500}); await page.waitForTimeout(2000); await snap(page,'portfolio-add-menu'); } catch {} }
    await page.keyboard.press('Escape');
  } catch (e) { dump('portfolio-interactions-err', { err:String(e.message) }); }

  // Recap deep dive — wait for charts and try common sub-tabs
  try {
    await page.goto('https://app.kubera.com/recap', { waitUntil:'domcontentloaded' });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(3500);
    await snap(page, 'recap-deep');
    await dumpHtml(page, 'recap-deep');
    dump('recap-deep-tokens', await page.evaluate(TOKENS_FN));
    dump('recap-deep-dom', await page.evaluate(DOM_FN));

    // Try clicking each nav tab inside recap
    const tabs = await page.$$('[role=tab], [class*=tab], nav a');
    for (let i=0; i<Math.min(tabs.length, 8); i++) {
      try {
        const t = tabs[i];
        const txt = (await t.innerText()).trim().slice(0,30).replace(/\s+/g,'_').replace(/\W/g,'');
        if (!txt) continue;
        await t.click({timeout:2000});
        await page.waitForTimeout(1800);
        await snap(page, `recap-tab-${txt||i}`);
      } catch {}
    }
  } catch (e) { dump('recap-deep-err',{err:String(e.message)}); }

  // Settings / profile / subscription — try common sub-routes
  const settingsRoutes = ['/settings', '/settings/profile', '/settings/subscription', '/settings/account'];
  for (const r of settingsRoutes) {
    try {
      await page.goto(`https://app.kubera.com${r}`, { waitUntil:'domcontentloaded', timeout: 20000 });
      try { await page.waitForLoadState('networkidle',{timeout:10000}); } catch {}
      await page.waitForTimeout(1800);
      await snap(page, `settings${r.replace(/\//g,'-')}`);
    } catch {}
  }

  dump('network-log-deep', net.slice(0,800));
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('fatal:', e); process.exit(1); });
