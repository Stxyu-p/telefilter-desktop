'use strict';
// Adversarial edge cases for watchMediaViewer (edge-case-sadist protocol):
// every vector must degrade gracefully — no throw, no double-inject, no leak.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');

const chrome = [
  process.env.CHROMIUM_PATH,
  'C:/Users/BlankScreen/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
].find(p => p && fs.existsSync(p));

const PAGE = `<!doctype html><html><body style="margin:0">
<div class="wrap">${Array.from({ length: 40 }, (_, i) => `<div class="bubble">m${i}</div>`).join('')}</div>
</body></html>`;

const IMPL = `
  const MV_SELECTOR = '.media-viewer-whole, #MediaViewer';
  const MV_TOPBAR = '.media-viewer-topbar, .media-viewer-head, .topbar';
  let mounts = 0, errors = 0;
  window.__err = null;
  const mountOverlay = (mv) => {
    try {
      if (!mv || mv.querySelector('#tf5-mv-actions')) return;
      mounts++;
      const topbar = mv.querySelector(MV_TOPBAR) || mv;
      const c = document.createElement('div');
      c.id = 'tf5-mv-actions';
      c.textContent = 'DL Save Repost';
      topbar.appendChild(c);
    } catch (e) { errors++; window.__err = String(e); }
  };
  const isViewer = (el) => {
    try {
      return el.nodeType === 1 && (el.id === 'MediaViewer' ||
        (el.classList && el.classList.contains('media-viewer-whole')));
    } catch (e) { errors++; window.__err = String(e); return false; }
  };
  const scan = (muts) => {
    try {
      for (const m of muts) for (const n of m.addedNodes) {
        if (isViewer(n)) { mountOverlay(n); return; }
        if (n.nodeType !== 1) continue;
        const host = n.closest ? n.closest(MV_SELECTOR) : null;
        if (host) { mountOverlay(host); return; }
      }
    } catch (e) { errors++; window.__err = String(e); }
  };
  const obs = new MutationObserver(scan);
  obs.observe(document.body, { childList: true, subtree: true });
  try { const ex = document.querySelector(MV_SELECTOR); if (ex) mountOverlay(ex); }
  catch (e) { errors++; window.__err = String(e); }
  window.__tf = { get mounts(){return mounts;}, get errors(){return errors;},
                  get err(){return window.__err;}, stop: () => obs.disconnect(),
                  overlayCount: () => document.querySelectorAll('#tf5-mv-actions').length };
`;

const TORTURE = {
  'null_addedNode_set': `
    // Force text + comment nodes (nodeType 3 / 8) into addedNodes.
    document.body.appendChild(document.createTextNode('plain text'));
    const c = document.createComment('comment node');
    document.body.appendChild(c);
    const f = document.createDocumentFragment();
    f.appendChild(document.createTextNode('fragment text'));
    document.body.appendChild(f);`,
  'element_with_null_classList': `
    const d = document.createElement('div');
    Object.defineProperty(d, 'classList', { get: () => null });
    document.body.appendChild(d);`,
  'detached_node_then_adopted': `
    const mv = document.createElement('div');
    mv.className = 'media-viewer-whole';
    const frag = document.createDocumentFragment();
    frag.appendChild(mv);
    document.body.appendChild(frag);`,
  'viewer_inside_viewer': `
    const outer = document.createElement('div');
    outer.className = 'media-viewer-whole';
    const inner = document.createElement('div');
    inner.className = 'media-viewer-whole';
    outer.appendChild(inner);
    document.body.appendChild(outer);`,
  'viewer_removed_immediately': `
    const mv = document.createElement('div');
    mv.className = 'media-viewer-whole';
    mv.innerHTML = '<div class="media-viewer-topbar"></div>';
    document.body.appendChild(mv);
    mv.remove();`,
  'rapid_open_close_x20': `
    for (let i = 0; i < 20; i++) {
      const mv = document.createElement('div');
      mv.className = 'media-viewer-whole';
      mv.innerHTML = '<div class="media-viewer-topbar"></div>';
      document.body.appendChild(mv);
      mv.remove();
    }`,
  'viewer_with_no_topbar': `
    const mv = document.createElement('div');
    mv.className = 'media-viewer-whole';
    document.body.appendChild(mv);`,
  'svg_with_matching_class': `
    const s = document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('class', 'media-viewer-whole');
    document.body.appendChild(s);`,
  'viewer_id_only_no_class': `
    const mv = document.createElement('div');
    mv.id = 'MediaViewer';
    document.body.appendChild(mv);`,
  'huge_batch_5000_nodes': `
    const f = document.createDocumentFragment();
    for (let i = 0; i < 5000; i++) { const d = document.createElement('div'); d.className = 'n' + i; f.appendChild(d); }
    document.body.appendChild(f);`,
};

(async () => {
  const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(PAGE);
  const results = [];
  const check = (n, pass, d) => results.push({ n, pass, d });

  for (const [name, body] of Object.entries(TORTURE)) {
    await page.evaluate(`(() => { if (window.__tf) { window.__tf.stop(); window.__tf = null; }
      document.querySelectorAll('.media-viewer-whole,#MediaViewer,#tf5-mv-actions').forEach(e=>e.remove());
      document.querySelectorAll('.wrap > *').forEach(e=>e.remove()); })()`);
    await page.evaluate(IMPL);
    const r = await page.evaluate(new Function(`return (async () => { ${body}
      await new Promise(r => setTimeout(r, 250));
      return { mounts: window.__tf.mounts, errors: window.__tf.errors, err: window.__tf.err,
               overlays: window.__tf.overlayCount() };
    })();`));
    // No throw, and never more than one overlay per viewer element.
    const pass = r.errors === 0 && r.overlays <= 1;
    check(name, pass, `mounts=${r.mounts} errors=${r.errors} overlays=${r.overlays}${r.err ? ' err=' + r.err.slice(0, 40) : ''}`);
  }

  console.log('\nwatchMediaViewer — adversarial edge cases (edge-case-sadist)\n' + '='.repeat(84));
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.n.padEnd(38)} ${r.d}`);
  console.log('-'.repeat(84));
  const failed = results.filter(r => !r.pass);
  console.log(failed.length === 0 ? `ALL PASS (${results.length} torture vectors, 0 unhandled throws)\n`
    : `${failed.length} FAILED: ${failed.map(f => f.n).join(', ')}\n`);
  await browser.close();
  if (failed.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
