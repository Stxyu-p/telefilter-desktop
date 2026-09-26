'use strict';
// Ranks every observer TeleFilter keeps alive, one per browser page, in
// PARALLEL so total wall time is one 3s run instead of 8x3s.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');

const chrome = [
  process.env.CHROMIUM_PATH,
  'C:/Users/BlankScreen/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
].find(p => p && fs.existsSync(p));

const PAGE = `<!doctype html><html><body style="margin:0;font:13px sans-serif">
<div id="app"><div class="sidebar-left"><div class="scrollable-y">${
  Array.from({ length: 25 }, (_, i) => `<div class="chat-list-chat" data-peer-id="${i}">chat ${i}</div>`).join('')
}</div></div>
<div id="column-center"><div class="bubbles scrollable-y">${
  Array.from({ length: 60 }, (_, i) => `<div class="bubble is-message" data-mid="${1000 + i}">${
    i % 3 === 0 ? '<img class="media-photo" src="data:,">' : 'text'}</div>`).join('')
}</div></div></body></html>`;

const CASES = [
  ['themeObserver (docEl+body attrs)', `
    const o=new MutationObserver(()=>{window.__n++;});
    o.observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});
    o.observe(document.body,{attributes:true,attributeFilter:['class','style']});`],
  ['mediaObserver (bubbles subtree)', `
    const b=document.querySelector('.bubbles');
    const o=new MutationObserver(()=>{window.__n++;});
    o.observe(b,{childList:true,subtree:true,attributes:true,attributeFilter:['data-mid']});`],
  ['columnObserver (column childList)', `
    const c=document.querySelector('#column-center');
    const o=new MutationObserver(()=>{window.__n++;});
    o.observe(c,{childList:true});`],
  ['bubblesHostObserver (parent childList)', `
    const b=document.querySelector('.bubbles');
    const o=new MutationObserver(()=>{window.__n++;});
    o.observe(b.parentElement,{childList:true});`],
  ['watchMediaViewer NEW (body+addedNode)', `
    const o=new MutationObserver(ms=>{window.__n++;
      for(const m of ms)for(const x of m.addedNodes){
        if(x.nodeType!==1)continue;
        if(x.id==='MediaViewer'||(x.classList&&x.classList.contains('media-viewer-whole')))window.__hit++;
      }});
    o.observe(document.body,{childList:true,subtree:true});`],
  ['watchMediaViewer OLD (body+querySelector)', `
    const o=new MutationObserver(()=>{const t=performance.now();window.__n++;
      document.querySelector('.media-viewer-whole, #MediaViewer');
      window.__work+=performance.now()-t;});
    o.observe(document.body,{childList:true,subtree:true});`],
  ['init fallback (body, self-disconnect)', `
    const o=new MutationObserver(()=>{window.__n++;});
    o.observe(document.body,{subtree:true,childList:true});`],
  ['rafThrottle (line 220) + querySelector', `
    const rafThrottle = fn => { let frame = 0; return (...a) => { if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = 0; fn(...a); }); }; };
    const th = rafThrottle(()=>{const t=performance.now();window.__n++;
      document.querySelector('.media-viewer-whole, #MediaViewer');
      window.__work+=performance.now()-t;});
    for(let i=0;i<200;i++) th();`],
];

(async () => {
  const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const ctx = browser.contexts()[0] || await browser.newContext();
  const pages = await Promise.all(CASES.map(() => ctx.newPage()));
  const results = await Promise.all(pages.map(async (page, i) => {
    await page.setContent(PAGE);
    return page.evaluate(async ({ code }) => {
      window.__n = 0; window.__work = 0; window.__hit = 0;
      // eslint-disable-next-line no-new-func
      new Function(code)();
      const t0 = performance.now();
      const drive = setInterval(() => {
        const host = document.querySelector('.bubbles');
        const d = document.createElement('div');
        d.className = 'bubble is-message';
        d.setAttribute('data-mid', String(Math.random()));
        if (Math.random() < 0.3) { const im = document.createElement('img'); im.className = 'media-photo'; im.src = 'data:,'; d.appendChild(im); }
        else d.textContent = 'text';
        host.appendChild(d);
        setTimeout(() => d.remove(), 400);
        if (Math.random() < 0.08) document.body.setAttribute('class', 'night t' + Math.random());
      }, 16);
      await new Promise(r => setTimeout(r, 3000));
      clearInterval(drive);
      const ms = performance.now() - t0;
      return { n: window.__n, work: Number(window.__work.toFixed(2)), hit: window.__hit,
        ms: Math.round(ms), cpuPct: Number(((window.__work / ms) * 100).toFixed(3)) };
    }, { code: CASES[i][1] });
  }));

  console.log('\nObserver cost ranking — Telegram-shaped churn, 3s each, run in parallel\n' + '='.repeat(98));
  console.log('observer'.padEnd(44) + 'cb/s'.padStart(8) + 'work ms'.padStart(9) + 'cpu%'.padStart(8) + ' note');
  console.log('-'.repeat(98));
  const rows = results.map((r, i) => ({ name: CASES[i][0], ...r }));
  for (const r of rows.sort((a, b) => a.cpuPct - b.cpuPct)) {
    const note = r.cpuPct === 0 ? 'free (node scan only)' : r.cpuPct < 0.05 ? 'negligible' : r.cpuPct < 1 ? 'light' : 'COSTLY';
    console.log(r.name.padEnd(44) + String(Math.round(r.n / (r.ms / 1000))).padStart(8) +
      String(r.work).padStart(9) + String(r.cpuPct).padStart(8) + ' ' + note);
  }
  console.log('-'.repeat(98));
  console.log('node count: ' + (await pages[0].evaluate(() => document.body.querySelectorAll('*').length)));
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
