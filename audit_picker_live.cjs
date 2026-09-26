'use strict';
// Drives the SHIPPED destination picker end-to-end in real Chromium, on a local
// http origin, with Telegram's real checkbox-hiding CSS present.
// Verifies: picker opens, lists chats from dialogsStorage, search filters,
// a chat can be picked, and the choice persists to localStorage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const SRC = fs.readFileSync(path.join(__dirname, 'telefilter_desktop.user.js'), 'utf8');
// The exact Telegram rule that hid the checkboxes.
const TELEGRAM_CSS = `[type="checkbox"], [type="radio"] { box-sizing: border-box; opacity: 0; z-index: -1; padding: 0px; position: absolute; }`;

const FIXTURE = `<!doctype html><html><head><style>
  html,body{margin:0;height:100%;overflow:hidden;background:#0e1621}
  .app{display:flex;height:100vh}
  .sidebar-left{width:300px;background:#17212b}
  #column-center{flex:1;min-width:0;position:relative;background:#0e1621}
  .chat{display:flex;flex-direction:column;height:100%}
  .sidebar-header{height:48px;background:#17212b;color:#fff;display:flex;align-items:center;padding:0 16px;box-sizing:border-box;flex:none}
  .bubbles{flex:1;min-height:0;overflow-y:auto;padding:12px}
  .bubble{margin:4px 60px;padding:8px 12px;background:#182533;color:#fff;border-radius:12px;width:max-content}
  ${TELEGRAM_CSS}
</style></head><body>
<div class="app">
  <div class="sidebar-left">chats</div>
  <div id="column-center">
    <div class="chat active">
      <div class="sidebar-header"><span class="title">Fixture chat</span></div>
      <div class="bubbles">
        <div class="bubble photo" data-mid="1"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div>
        <div class="bubble is-message" data-mid="2">text only</div>
      </div>
    </div>
  </div>
</div>
</body></html>`;

const chrome = [
  process.env.CHROMIUM_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Users/BlankScreen/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
].find(p => p && fs.existsSync(p));

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/user.js')) {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      return res.end(SRC);
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(FIXTURE);
  });
  await new Promise(r => server.listen(8933, '127.0.0.1', r));

  const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('http://127.0.0.1:8933/k/', { waitUntil: 'load' });
  // Fake the Telegram manager layer so getRecentChats() has real dialog data.
  await page.evaluate(() => {
    const W = window;
    W.appImManager = {
      myId: 999,
      chat: {
        peerId: 555,
        threadId: null,
        monoforumThreadId: null,
        selection: null,
        managers: {
          dialogsStorage: {
            getCachedDialogs: () => [{ peerId: 111 }, { peerId: 222 }, { peerId: 333 }, { peerId: 444 }],
          },
          appPeersManager: {
            getPeerString: id => ({ 111: 'Alpha Channel', 222: 'Beta Group', 333: 'Gamma Club', 444: 'My Replays', 555: 'Fixture chat' })[id] || '',
          },
          appDialogsManager: { xds: { 0: { sortedList: { getSortedItems: () => [{ id: 555 }, { id: 666 }] } } } },
          appMessagesManager: { sendText: async () => {}, sendFile: async () => {} },
        },
      },
    };
  });
  await page.addScriptTag({ url: 'http://127.0.0.1:8933/user.js' });
  await page.waitForSelector('.tf3-ctrl', { timeout: 8000 });

  // 1. Settings shows the destination row.
  await page.evaluate(() => {
    [...document.querySelectorAll('.tf3-ctrl button,.tf3-ctrl summary')]
      .find(b => /settings/i.test(b.title + ' ' + (b.getAttribute('aria-label') || ''))).click();
  });
  await page.waitForSelector('.tf3-settings-card', { timeout: 4000 });
  const destRow = await page.evaluate(() => {
    const btn = document.getElementById('tf5-opt-dest');
    const lbl = document.getElementById('tf5-dest-current');
    return { hasButton: !!btn, label: lbl?.textContent, visible: btn ? getComputedStyle(btn).display !== 'none' : false };
  });
  console.log('settings destination row:', JSON.stringify(destRow));
  assert(destRow.hasButton, 'destination Choose button missing');

  // 2. Click Choose -> picker opens, settings closes (no inert deadlock).
  await page.click('#tf5-opt-dest');
  await page.waitForSelector('.tf3-dest-card', { timeout: 4000 });
  const picker = await page.evaluate(() => ({
    open: !!document.querySelector('.tf3-dest-card'),
    settingsClosed: !document.querySelector('.tf3-settings-card'),
    itemCount: document.querySelectorAll('.tf3-dest-item').length,
    names: [...document.querySelectorAll('.tf3-dest-name')].map(e => e.textContent),
  }));
  console.log('picker:', JSON.stringify(picker, null, 1));
  assert(picker.open, 'picker did not open');
  assert(picker.settingsClosed, 'settings stayed open behind picker (inert deadlock)');
  assert(picker.itemCount >= 6, 'expected Saved + current + 4 dialogs, got ' + picker.itemCount);

  // 3. Search filters.
  await page.fill('.tf3-dest-search', 'beta');
  await page.waitForTimeout(120);
  const filtered = await page.evaluate(() => [...document.querySelectorAll('.tf3-dest-name')].map(e => e.textContent));
  console.log('search "beta" ->', JSON.stringify(filtered));
  assert.deepEqual(filtered, ['Beta Group']);

  // 4. Pick it; the choice must persist.
  await page.click('.tf3-dest-item');
  await page.waitForTimeout(250);
  const stored = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('tf3') || '{}');
    return { destId: s.repostDestId, destName: s.repostDestName, pickerClosed: !document.querySelector('.tf3-dest-card') };
  });
  console.log('after pick:', JSON.stringify(stored));
  assert.equal(stored.destId, 222);
  assert.equal(stored.destName, 'Beta Group');
  assert(stored.pickerClosed, 'picker did not close after choosing');

  // 5. Reopen settings -> it must show the saved destination.
  await page.evaluate(() => {
    [...document.querySelectorAll('.tf3-ctrl button,.tf3-ctrl summary')]
      .find(b => /settings/i.test(b.title + ' ' + (b.getAttribute('aria-label') || ''))).click();
  });
  await page.waitForSelector('.tf3-settings-card', { timeout: 4000 });
  const shown = await page.evaluate(() => document.getElementById('tf5-dest-current')?.textContent);
  console.log('settings now shows:', JSON.stringify(shown));
  assert.equal(shown, 'Beta Group');

  // 6. Checkbox still visible despite Telegram's opacity:0 rule.
  const cb = await page.evaluate(() => {
    const row = document.querySelector('.tf3-set-row');
    const before = getComputedStyle(row.querySelector('input[type="checkbox"]')).opacity;
    const box = getComputedStyle(row, '::before');
    return { nativeOpacity: before, ourBoxWidth: box.width, ourBoxContent: box.content };
  });
  console.log('checkbox under telegram CSS:', JSON.stringify(cb));
  assert.equal(cb.nativeOpacity, '0', 'native input should still be hidden by telegram');
  assert.notEqual(cb.ourBoxContent, 'none', 'our ::before box must render');

  assert.deepEqual(errors, [], 'page errors');
  console.log('\nPASS: destination picker works end-to-end under real Telegram CSS.');
  await browser.close();
  server.close();
})().catch(e => { console.error(e.message || e); process.exitCode = 1; });
