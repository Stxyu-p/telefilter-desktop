'use strict';
// Regression check for watchMediaViewer — observer-only (no polling).
// Proves the real mount shapes are detected, detection is idempotent, and the
// shipped strategy is materially cheaper than the old body-wide query.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');

const chrome = [
  process.env.CHROMIUM_PATH,
  'C:/Users/BlankScreen/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
].find(p => p && fs.existsSync(p));

const PAGE = `<!doctype html><html><body style="margin:0">
${Array.from({ length: 8 }, (_, i) => `<div id="app-${i}"><div class="wrap">${
  Array.from({ length: 120 }, (_, j) => `<div class="bubble is-message" data-mid="${i}-${j}">msg ${j}</div>`).join('')
}</div></div>`).join('')}
</body></html>`;

// Mirrors the shipped watchMediaViewer exactly (observer + boot-race query).
const IMPL = `
  const MV_SELECTOR = '.media-viewer-whole, #MediaViewer';
  const MV_TOPBAR = '.media-viewer-topbar, .media-viewer-head, .topbar';
  let mounts = 0, callbacks = 0, addedSeen = 0, workMs = 0, bootMs = 0;
  const mountOverlay = (mv) => {
    if (!mv || mv.querySelector('#tf5-mv-actions')) return;
    mounts++;
    const topbar = mv.querySelector(MV_TOPBAR) || mv;
    const c = document.createElement('div');
    c.id = 'tf5-mv-actions';
    c.textContent = 'DL Save Repost';
    topbar.appendChild(c);
  };
  const isViewer = (el) => el.nodeType === 1 &&
    (el.id === 'MediaViewer' || (el.classList && el.classList.contains('media-viewer-whole')));
  const scan = (muts) => {
    const t = performance.now(); callbacks++;
    for (const m of muts) for (const n of m.addedNodes) {
      addedSeen++;
      if (isViewer(n)) { mountOverlay(n); workMs += performance.now() - t; return; }
      if (n.nodeType !== 1) continue;
      const host = n.closest ? n.closest(MV_SELECTOR) : null;
      if (host) { mountOverlay(host); workMs += performance.now() - t; return; }
    }
    workMs += performance.now() - t;
  };
  const obs = new MutationObserver(scan);
  obs.observe(document.body, { childList: true, subtree: true });
  const tq = performance.now();
  const existing = document.querySelector(MV_SELECTOR);
  bootMs = performance.now() - tq;
  if (existing) mountOverlay(existing);
  window.__tf = { get mounts(){return mounts;}, get callbacks(){return callbacks;},
                  get addedSeen(){return addedSeen;}, get workMs(){return workMs;},
                  get bootMs(){return bootMs;},
                  stop: () => obs.disconnect(),
                  overlayCount: () => document.querySelectorAll('#tf5-mv-actions').length };
`;

const SHAPES = {
  'shape1_viewer_inserted (Telegram real)': `
      const mv = document.createElement('div');
      mv.className = 'media-viewer-whole no-forwards active';
      mv.innerHTML = '<div class="media-viewer-topbar"></div><div class="media-viewer-content"></div>';
      document.body.appendChild(mv);`,
  'shape2_content_into_live_viewer': `
      const mv = document.createElement('div');
      mv.className = 'media-viewer-whole active';
      document.body.appendChild(mv);
      await new Promise(r => setTimeout(r, 120));
      const inner = document.createElement('div');
      inner.className = 'media-viewer-content-inner';
      mv.appendChild(inner);`,
  'shape3_by_id_only': `
      const mv = document.createElement('div');
      mv.id = 'MediaViewer';
      document.body.appendChild(mv);`,
  'shape4_album_next_slide': `
      const mv = document.createElement('div');
      mv.className = 'media-viewer-whole active';
      document.body.appendChild(mv);
      await new Promise(r => setTimeout(r, 120));
      for (let i = 0; i < 5; i++) {
        const s = document.createElement('div');
        s.className = 'media-viewer-content-inner';
        mv.appendChild(s);
        await new Promise(r => setTimeout(r, 30));
      }`,
};

(async () => {
  const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(PAGE);
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass, detail });
  const clean = `(() => { if (window.__tf) { window.__tf.stop(); window.__tf = null; }
    document.querySelectorAll('.media-viewer-whole,#MediaViewer,#tf5-mv-actions').forEach(e=>e.remove()); })()`;

  for (const [name, body] of Object.entries(SHAPES)) {
    await page.evaluate(clean);
    await page.evaluate(IMPL);
    const r = await page.evaluate(new Function(`
      return (async () => { ${body}
        await new Promise(r => setTimeout(r, 400));
        return { mounts: window.__tf.mounts, overlays: window.__tf.overlayCount() };
      })();`));
    check(name, r.mounts === 1 && r.overlays === 1, `mounts=${r.mounts} overlays=${r.overlays}`);
  }

  // boot race: viewer already open before TeleFilter starts
  await page.evaluate(clean);
  await page.evaluate(`(() => { const mv=document.createElement('div');
    mv.className='media-viewer-whole active';
    mv.innerHTML='<div class="media-viewer-topbar"></div>';
    document.body.appendChild(mv); })()`);
  await page.evaluate(IMPL);
  const boot = await page.evaluate(`({ mounts: window.__tf.mounts, overlays: window.__tf.overlayCount() })`);
  check('boot_race_viewer_already_open', boot.mounts === 1 && boot.overlays === 1,
    `mounts=${boot.mounts} overlays=${boot.overlays}`);

  // idempotency under churn
  await page.evaluate(clean);
  await page.evaluate(IMPL);
  const idem = await page.evaluate(`(async () => {
    for (let i = 0; i < 50; i++) {
      const d = document.createElement('div'); d.className = 'noise';
      document.querySelector('.wrap').appendChild(d);
    }
    const mv = document.createElement('div');
    mv.className = 'media-viewer-whole active';
    mv.innerHTML = '<div class="media-viewer-topbar"></div>';
    document.body.appendChild(mv);
    await new Promise(r => setTimeout(r, 800));
    return { mounts: window.__tf.mounts, overlays: window.__tf.overlayCount() };
  })()`);
  check('idempotent_no_double_inject', idem.mounts === 1 && idem.overlays === 1,
    `mounts=${idem.mounts} overlays=${idem.overlays}`);

  // ---- cost: new vs old ----
  const OLD = `
    window.__n=0; window.__work=0;
    const checkOverlay = () => { const t = performance.now(); window.__n++;
      const mv = document.querySelector('.media-viewer-whole, #MediaViewer');
      if (mv && !mv.querySelector('#tf5-mv-actions')) {}
      window.__work += performance.now() - t; };
    const o = new MutationObserver(checkOverlay);
    o.observe(document.body, { childList: true, subtree: true });
    window.__old = { get callbacks(){return window.__n;}, get workMs(){return window.__work;},
                      stop: () => o.disconnect() };`;

  const measure = async (setup) => {
    await page.evaluate(clean);
    await page.evaluate(setup);
    const r = await page.evaluate(`(async () => {
      const t0 = performance.now();
      const drive = setInterval(() => {
        const d = document.createElement('div');
        d.className = 'bubble is-message'; d.setAttribute('data-mid', String(Math.random()));
        document.querySelector('.wrap').appendChild(d);
        setTimeout(() => d.remove(), 300);
      }, 16);
      await new Promise(r => setTimeout(r, 4000));
      clearInterval(drive);
      const ms = performance.now() - t0;
      const c = ${setup === OLD ? 'window.__old' : 'window.__tf'};
      const out = { ms: Math.round(ms), callbacks: c.callbacks, workMs: Number(c.workMs.toFixed(2)) };
      c.stop();
      return out;
    })()`);
    return r;
  };

  const oldM = await measure(OLD);
  const newM = await measure(IMPL);
  const oldCpu = (oldM.workMs / oldM.ms) * 100;
  const newCpu = (newM.workMs / newM.ms) * 100;

  console.log('\nwatchMediaViewer (observer-only) — correctness + cost\n' + '='.repeat(74));
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(46)} ${r.detail}`);
  console.log('-'.repeat(74));
  console.log('old : ' + String(oldM.callbacks).padStart(5) + ' callbacks, ' +
    oldM.workMs + 'ms = ' + oldCpu.toFixed(3) + '% CPU');
  console.log('new : ' + String(newM.callbacks).padStart(5) + ' callbacks, ' +
    newM.workMs + 'ms = ' + newCpu.toFixed(3) + '% CPU  (' + (oldCpu / Math.max(newCpu, 1e-9)).toFixed(0) + 'x lighter)');
  console.log('polling: none — boot query only, once');
  console.log('-'.repeat(74));
  check('perf_at_least_5x_cheaper', newCpu < oldCpu / 5, `${oldCpu.toFixed(3)}% -> ${newCpu.toFixed(3)}%`);

  const failed = results.filter(r => !r.pass);
  console.log(failed.length === 0 ? `\nALL PASS (${results.length} checks)\n`
    : `\n${failed.length} FAILED: ${failed.map(f => f.name).join(', ')}\n`);
  await browser.close();
  if (failed.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
