'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const FIXTURE_WEBK = `<!doctype html>
<html>
<head>
  <style>
    /* Minimal reproduction of WebK chat container styles */
    :root {
      --chat-topbar-height: 48px;
      --page-chats-padding: 0px;
      --chat-width: 720px;
    }
    body { margin: 0; background: #0e1621; }
    #column-center { position: relative; width: 100%; height: 100vh; }
    .chats-container { height: 100%; }
    .chat {
      --chat-padding-top: calc(var(--chat-topbar-height) + var(--page-chats-padding));
      width: 1000px; height: 800px; position: relative;
      display: flex !important; flex-direction: column; align-items: center;
    }
    .topbar {
      position: absolute; top: 0; inset-inline: 0;
      max-width: var(--chat-width); margin-inline: auto;
      height: var(--chat-topbar-height) !important;
      background: #17212b; color: #fff; z-index: 2;
    }
    .bubbles {
      position: absolute; inset-inline: 0;
      top: var(--chat-padding-top);
      background: #111;
    }
    .bubbles-viewport {
      position: absolute; inset-inline: 0;
      top: var(--chat-padding-top);
      background: #222;
    }
  </style>
</head>
<body class="page-chats animation-level-2 theme-dark">
  <div id="column-center">
    <div class="chats-container tabs-container">
      <div class="chat tabs-tab active" style="width: 1000px; height: 800px; position: relative;">
        <div class="topbar sidebar-header" style="height: 48px;">
          <div class="chat-info">WarpPortalTestBot</div>
        </div>
        <div class="bubbles" style="background: #111;">
          <div class="bubbles-viewport" style="background: #222;">
            <div class="bubble is-message" data-mid="1">
              <div class="message-content">Hello world</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

(async () => {
  const defaultChrome = [
    process.env.CHROMIUM_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Users/BlankScreen/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
  ].find(p => p && fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(defaultChrome ? { executablePath: defaultChrome } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('**/k/', route => route.fulfill({ contentType: 'text/html', body: FIXTURE_WEBK }));
    await page.goto('https://web.telegram.org/k/', { waitUntil: 'load' });
    
    // Inject the shipped userscript
    await page.addScriptTag({ path: path.join(__dirname, 'telefilter_desktop.user.js') });
    await page.waitForSelector('.tf3-ctrl', { timeout: 5000 });

    const layout = await page.evaluate(() => {
      const topbar = document.querySelector('.topbar');
      const bar = document.querySelector('.tf3-ctrl');
      const bv = document.querySelector('.bubbles-viewport');
      const tbR = topbar.getBoundingClientRect();
      const barR = bar.getBoundingClientRect();
      const bvR = bv ? bv.getBoundingClientRect() : null;
      const b = document.querySelector('.tf3-ctrl');
      const pw = b.querySelector('.tf3-pw');
      const aw = b.querySelector('.tf3-aw');
      return {
        topbar: { top: tbR.top, left: tbR.left, width: tbR.width, height: tbR.height, bottom: tbR.bottom },
        bar: { top: barR.top, left: barR.left, width: barR.width, height: barR.height, bottom: barR.bottom },
        bubblesViewport: bvR ? { top: bvR.top, bottom: bvR.bottom } : null,
        barWrap: {
          pwWidth: pw.getBoundingClientRect().width,
          awWidth: aw.getBoundingClientRect().width,
          contentWidth: b.querySelector('.tf3-content').getBoundingClientRect().width,
          pills: [...b.querySelectorAll('.tf3-pill')].map(p => ({ label: p.textContent.trim().slice(0, 10), w: Math.round(p.getBoundingClientRect().width) }))
        }
      };
    });

    console.log('WebK Layout Result:', JSON.stringify(layout, null, 2));

    // Assertions
    assert.equal(layout.bar.width, 720, `Bar width should match --chat-width (720), got ${layout.bar.width}`);
    assert.equal(layout.bar.left, layout.topbar.left, `Bar left (${layout.bar.left}) must align with topbar left (${layout.topbar.left})`);
    assert(layout.bar.height >= 36 && layout.bar.height <= 55, `Bar height should be compact inline (36-55), got ${layout.bar.height}`);
    assert(Math.abs(layout.bar.top - layout.topbar.bottom) <= 10, `Bar top (${layout.bar.top}) must sit just below topbar bottom (${layout.topbar.bottom})`);
    if (layout.bubblesViewport) {
      assert(layout.bubblesViewport.top >= layout.bar.bottom - 4, `Messages top (${layout.bubblesViewport.top}) must not be hidden behind bar bottom (${layout.bar.bottom})`);
    }
    console.log('PASS: WebK inline toolbar layout is correct and does not collapse or overlap.');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e.message || e);
  process.exitCode = 1;
});
