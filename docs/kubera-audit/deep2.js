/**
 * Third pass: correct routes only (/assets, /debts, /fastforward, /documents, /insurance).
 * /portfolio, /insights, /settings were all wrong URLs — the app is a 404 shell for those.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT='/opt/summa/kubera-audit', SHOTS=path.join(OUT,'screenshots'), RAW=path.join(OUT,'raw');
const TOKEN=process.env.KUBERA_TOKEN, CID='4s3p5qi7spb7cd5vtgj920ofvt', USER='dec1652d-25a9-48fe-96f5-cbaf2a0b13ba';

let idx=21;
const snap=async(p,l)=>{idx++;const n=`${String(idx).padStart(2,'0')}-${l}.png`;try{await p.screenshot({path:path.join(SHOTS,n),fullPage:true});console.log('shot',n);}catch(e){console.log('FAIL',n,e.message);}};
const dump=(l,o)=>fs.writeFileSync(path.join(RAW,`${l}.json`),JSON.stringify(o,null,2));
const dumpHtml=(p,l)=>p.content().then(h=>fs.writeFileSync(path.join(RAW,`${l}.html`),h));

// reuse extract functions inline-ish
const TOKENS_FN=()=>{const pick=(sels)=>{for(const s of sels){const el=document.querySelector(s);if(el)return{sel:s,...r(el)};}return null;};
function r(el){const s=getComputedStyle(el),b=el.getBoundingClientRect();const ps=['font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','border','border-radius','padding','margin','box-shadow','display'];const o={tag:el.tagName,cls:(el.className?.toString?.()||'').slice(0,140),w:Math.round(b.width),h:Math.round(b.height)};for(const p of ps)o[p]=s.getPropertyValue(p).trim();return o;}
const all=Array.from(document.querySelectorAll('*')).slice(0,3500);
const colors={},bgs={},fonts={},sizes={},weights={};
for(const el of all){const s=getComputedStyle(el),b=el.getBoundingClientRect();if(!b.width||!b.height)continue;colors[s.color]=(colors[s.color]||0)+1;bgs[s.backgroundColor]=(bgs[s.backgroundColor]||0)+1;fonts[s.fontFamily]=(fonts[s.fontFamily]||0)+1;sizes[s.fontSize]=(sizes[s.fontSize]||0)+1;weights[s.fontWeight]=(weights[s.fontWeight]||0)+1;}
const top=(o,n)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,n);
return{targets:{body:r(document.body),h1:pick(['h1']),h2:pick(['h2']),h3:pick(['h3']),
sidebar:pick(['nav','[class*=idebar]','aside']),sidebarItem:pick(['nav a','aside a']),
sidebarActive:pick(['[aria-current=page]','nav .active','nav [class*=active]']),
topBar:pick(['header','[class*=opbar]','[class*=eader]']),
card:pick(['[class*=card]','[class*=tats]']),
sheetTab:pick(['[role=tab]','[class*=sheet-tab i]','[class*=heetTab]','[data-cy*=sheet i]','[data-cy*=tab i]']),
tableHeader:pick(['thead th','[role=columnheader]','[class*=olumnHeader]','[class*=col-head]','[data-cy*=header i]']),
tableRow:pick(['tbody tr','[role=row]','[class*=row]:not(header)','[data-cy*=row i]']),
tableCell:pick(['tbody td','[role=cell]','[class*=cell]:not([class*=header i])']),
sectionHeader:pick(['[class*=ectionHeader]','[class*=ection-header]','[class*=groupHeader]','[data-cy*=section i]']),
netWorth:pick(['[data-cy*=networth i]','[class*=etWorth]']),
chartSvg:pick(['svg.highcharts-root','svg.recharts-surface','svg[class*=chart]','canvas'])},
stats:{colors:top(colors,25),bgs:top(bgs,25),fonts:top(fonts,8),sizes:top(sizes,15),weights:top(weights,8)},
rootVars:(()=>{const cs=getComputedStyle(document.documentElement),o={};for(let i=0;i<cs.length;i++){const k=cs[i];if(k.startsWith('--'))o[k]=cs.getPropertyValue(k).trim();}return o;})(),
chartLibs:{highcharts:!!window.Highcharts,recharts:!!document.querySelector('.recharts-wrapper'),chartjs:!!window.Chart,d3:!!window.d3,echarts:!!window.echarts},
url:location.href,title:document.title};};

const DOM_FN=()=>{function s(el,d){if(!el||d>4)return null;const b=el.getBoundingClientRect?.()||{width:0,height:0};const o={tag:el.tagName?.toLowerCase?.(),id:el.id||undefined,cls:(el.className?.toString?.()||'').slice(0,140)||undefined,w:Math.round(b.width),h:Math.round(b.height),cy:el.getAttribute?.('data-cy')||undefined};const kids=Array.from(el.children||[]).slice(0,25);if(kids.length&&d<4)o.children=kids.map(c=>s(c,d+1)).filter(Boolean);return o;}return{url:location.href,title:document.title,main:s(document.querySelector('main')||document.body,0)};};

async function cap(page,url,label){
  console.log('→',label);
  try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});}catch(e){console.log('nav err',e.message);}
  try{await page.waitForLoadState('networkidle',{timeout:15000});}catch{}
  await page.waitForTimeout(3500);
  await snap(page,label);
  await dumpHtml(page,label);
  try{dump(`${label}-tokens`,await page.evaluate(TOKENS_FN));}catch(e){dump(`${label}-tokens-err`,{e:String(e.message)});}
  try{dump(`${label}-dom`,await page.evaluate(DOM_FN));}catch(e){dump(`${label}-dom-err`,{e:String(e.message)});}
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  await ctx.addInitScript(({token,cid,u})=>{const p=`CognitoIdentityServiceProvider.${cid}`;try{localStorage.setItem(`${p}.LastAuthUser`,u);localStorage.setItem(`${p}.${u}.accessToken`,token);localStorage.setItem(`${p}.${u}.idToken`,token);localStorage.setItem('accessToken',token);localStorage.setItem('token',token);}catch{}},{token:TOKEN,cid:CID,u:USER});
  await ctx.setExtraHTTPHeaders({'Authorization':`Bearer ${TOKEN}`});
  const page=await ctx.newPage();
  const net=[];
  page.on('response',async(res)=>{const u=res.url();if(!/api\.kubera\.com/.test(u))return;const r={url:u,status:res.status(),method:res.request().method(),ct:res.headers()['content-type']||''};try{if(r.ct.includes('json'))r.body=(await res.text()).slice(0,2500);}catch{}net.push(r);});

  // warm
  await page.goto('https://app.kubera.com/networth',{waitUntil:'domcontentloaded'});
  try{await page.waitForLoadState('networkidle',{timeout:10000});}catch{}

  const routes=[
    ['https://app.kubera.com/assets','assets'],
    ['https://app.kubera.com/debts','debts'],
    ['https://app.kubera.com/fastforward','fastforward'],
    ['https://app.kubera.com/documents','documents'],
    ['https://app.kubera.com/insurance','insurance'],
  ];
  for(const [u,l] of routes) await cap(page,u,l);

  // Interact on /assets: first row click for detail panel
  try{
    await page.goto('https://app.kubera.com/assets',{waitUntil:'domcontentloaded'});
    try{await page.waitForLoadState('networkidle',{timeout:10000});}catch{}
    await page.waitForTimeout(3500);
    await snap(page,'assets-loaded');

    // Try clicking a data-cy row
    const rows=await page.$$('[data-cy*=row i]');
    if (rows.length) {
      try { await rows[0].click({timeout:2500}); await page.waitForTimeout(2500); await snap(page,'assets-row-click'); await dumpHtml(page,'assets-row-click'); } catch {}
    } else {
      // fallback: click a visible cell
      const cell = await page.$('[data-cy*=cell i], [class*=cell]:not([class*=header i])');
      if (cell) { try { await cell.click({timeout:2500}); await page.waitForTimeout(2500); await snap(page,'assets-cell-click'); } catch {} }
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    // Right-click a row
    const rc = await page.$('[data-cy*=row i], [class*=row]:not(header)');
    if (rc) { try { await rc.click({button:'right',timeout:2500}); await page.waitForTimeout(1500); await snap(page,'assets-context-menu'); } catch {} }
    await page.keyboard.press('Escape');
  } catch(e){ dump('assets-interact-err',{e:String(e.message)}); }

  dump('network-log-final',net.slice(0,1000));
  await browser.close();
})().catch(e=>{console.error('fatal',e);process.exit(1);});
