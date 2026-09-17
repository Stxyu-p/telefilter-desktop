'use strict';
// Loads the FULL shipped userscript into Chromium on a Telegram-like fixture and
// reads real geometry from its inject() debug hook. Isolates script vs environment.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const FIXTURE = `<!doctype html><html><head><style>
  html,body{margin:0;height:100%;overflow:hidden;background:#0e1621}
  .app{display:flex;height:100vh}
  .sidebar-left{width:300px;background:#17212b}
  .middle-column{flex:1;min-width:0;position:relative;background:#0e1621}
  .messages-layout{display:flex;flex-direction:column;height:100%}
  .MiddleHeader{height:48px;background:#17212b;color:#fff}
  .MessageList{flex:1;min-height:0;overflow-y:auto}
  .bubbles{overflow-y:auto;height:100%}
  .Message.message-list-item,.bubble{margin:4px 60px;padding:8px 12px;background:#182533;color:#fff;border-radius:12px;width:max-content}
</style></head><body>
<div class="app">
  <div class="sidebar-left">chats</div>
  <div id="MiddleColumn" class="middle-column">
    <div class="messages-layout">
      <div class="MiddleHeader"><span class="peer-title">Fixture chat</span></div>
      <div class="MessageList main">
        <div class="bubbles">
          <div class="Message message-list-item is-in" data-mid="1"><div class="message-content media"><div class="media-inner"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div></div></div>
          <div class="Message message-list-item is-in" data-mid="2"><div class="message-content">text only</div></div>
          <div class="Message message-list-item is-in" data-mid="3"><div class="message-content media"><div class="media-inner"><video src="about:blank"></video></div></div></div>
        </div>
      </div>
    </div>
  </div>
</div>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], infos = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'info' && m.text().startsWith('[TF5')) infos.push(m.text()); });
    await page.route('**/k/', route => route.fulfill({ contentType: 'text/html', body: FIXTURE }));
    await page.goto('https://web.telegram.org/k/', { waitUntil: 'load' });
    // Shipped gate requires pathname /k/ — satisfied by the routed URL above.
    await page.addScriptTag({ path: path.join(__dirname, 'telefilter_desktop.user.js') });
    await page.waitForSelector('.tf3-ctrl', { timeout: 5000 }).catch(() => {});
    const state = await page.evaluate(() => ({
      debug: window.__TF5_UI_DEBUG || null,
      bar: (() => { const b = document.querySelector('.tf3-ctrl'); if (!b) return null;
        const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
        const controls = [...b.querySelectorAll('button,summary')].filter(e => e.checkVisibility());
        return { w: r.width, h: r.height, top: r.top, left: r.left, display: cs.display, controls: controls.length, labels: controls.map(e => e.textContent.trim().slice(0, 18)) }; })(),
      host: location.host, script: Boolean(document.getElementById('tf3-base-css')),
    }));
    console.log('console infos:', JSON.stringify(infos));
    console.log('state:', JSON.stringify(state, null, 2));
    assert(state.script, 'userscript styles not mounted');
    assert(state.debug, 'inject() debug hook never ran — bar not injected');
    assert(state.bar && state.bar.w > 300 && state.bar.h >= 30 && state.bar.controls >= 5,
      'repro: bar is the thin artifact -> ' + JSON.stringify(state.bar));
    assert.deepEqual(errors, [], 'page errors during live-script run');
    console.log('PASS: full userscript end-to-end on Telegram-like fixture; bar full-size.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message || e); process.exitCode = 1; });
