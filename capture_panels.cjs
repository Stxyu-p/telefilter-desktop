'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || 'C:/Users/BlankScreen/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Telegram WebK - Telefilter v5.1.0</title>
  <style>
    * { box-sizing: border-box; }
    body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0e1621; color: #fff; }
    .app { display: flex; height: 100vh; width: 100vw; }
    
    /* Left Sidebar */
    .sidebar-left { width: 340px; background: #17212b; border-right: 1px solid #0b1118; display: flex; flex-direction: column; flex-shrink: 0; }
    .sidebar-top { height: 56px; padding: 10px 14px; display: flex; align-items: center; gap: 12px; }
    .sidebar-search { flex: 1; height: 36px; background: #242f3d; border-radius: 18px; border: none; padding: 0 16px; color: #fff; font-size: 14px; outline: none; }
    .chat-list { flex: 1; overflow-y: auto; }
    .chat-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; cursor: pointer; transition: background 0.15s; }
    .chat-item:hover { background: #202b36; }
    .chat-item.active { background: #2b5278; }
    .chat-avatar { width: 46px; height: 46px; border-radius: 50%; background: linear-gradient(135deg, #6b8af6, #3b5998); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; color: #fff; flex-shrink: 0; }
    .chat-info-col { flex: 1; min-width: 0; }
    .chat-row-top { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .chat-title-text { font-size: 14px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chat-time { font-size: 12px; color: #7f91a4; }
    .chat-row-bottom { display: flex; justify-content: space-between; align-items: center; }
    .chat-snippet { font-size: 13px; color: #8e9dae; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chat-badge { background: #3390ec; color: #fff; font-size: 11px; font-weight: bold; padding: 2px 7px; border-radius: 10px; }

    /* Center Column & Chat Viewport */
    #column-center { flex: 1; min-width: 0; position: relative; display: flex; flex-direction: column; background: #0e1621; }
    .chats-container { height: 100%; display: flex; flex-direction: column; }
    .chat { display: flex; flex-direction: column; height: 100%; position: relative; }
    
    .topbar { height: 56px; background: #17212b; border-bottom: 1px solid #0b1118; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0; }
    .topbar-left { display: flex; align-items: center; gap: 12px; }
    .topbar-avatar { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #00c6ff, #0072ff); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; }
    .topbar-title { font-size: 15px; font-weight: 600; color: #fff; }
    .topbar-sub { font-size: 12px; color: #7f91a4; }
    .topbar-actions { display: flex; align-items: center; gap: 16px; color: #7f91a4; font-size: 18px; cursor: pointer; }

    /* Message Bubbles Area */
    .bubbles { flex: 1; overflow-y: auto; padding: 20px 40px; display: flex; flex-direction: column; gap: 12px; }
    .bubble { max-width: 520px; border-radius: 12px; padding: 10px 14px; position: relative; font-size: 14px; line-height: 1.45; }
    .bubble.is-in { background: #182533; align-self: flex-start; color: #fff; border-bottom-left-radius: 4px; }
    .bubble.is-out { background: #2b5278; align-self: flex-end; color: #fff; border-bottom-right-radius: 4px; }
    .bubble .bubble-author { font-size: 12px; font-weight: 600; color: #5288c1; margin-bottom: 4px; }
    .bubble .bubble-media { border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
    .bubble .bubble-media img, .bubble .bubble-media video { display: block; width: 100%; max-height: 240px; object-fit: cover; border-radius: 8px; }
    .bubble .bubble-doc { display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: 8px; }
    .bubble .bubble-doc-icon { width: 36px; height: 36px; border-radius: 50%; background: #3390ec; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; }
    .bubble .bubble-time { font-size: 11px; color: rgba(255,255,255,0.6); float: right; margin-top: 4px; margin-left: 12px; }
    
    .reactions { display: flex; gap: 6px; margin-top: 6px; }
    .reaction-pill { background: rgba(255,255,255,0.1); border-radius: 12px; padding: 2px 8px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; }

    /* Selection simulation styling */
    .bubble.is-selected { outline: 2px solid #5288c1; background: #1f3144 !important; }
  </style>
</head>
<body class="page-chats animation-level-2 theme-dark">
  <div class="app">
    <!-- Left Navigation Sidebar -->
    <div class="sidebar-left">
      <div class="sidebar-top">
        <input type="text" class="sidebar-search" placeholder="Search Telegram..." value="Telefilter Guild">
      </div>
      <div class="chat-list">
        <div class="chat-item active">
          <div class="chat-avatar">🎨</div>
          <div class="chat-info-col">
            <div class="chat-row-top">
              <span class="chat-title-text">Creative Assets & Media</span>
              <span class="chat-time">12:45</span>
            </div>
            <div class="chat-row-bottom">
              <span class="chat-snippet">Sarah: High-res UI prototypes attached</span>
              <span class="chat-badge">3</span>
            </div>
          </div>
        </div>
        <div class="chat-item">
          <div class="chat-avatar" style="background: linear-gradient(135deg, #10b981, #059669)">🔖</div>
          <div class="chat-info-col">
            <div class="chat-row-top">
              <span class="chat-title-text">Saved Messages</span>
              <span class="chat-time">11:20</span>
            </div>
            <div class="chat-row-bottom">
              <span class="chat-snippet">Telefilter ZIP archive · 12 items</span>
            </div>
          </div>
        </div>
        <div class="chat-item">
          <div class="chat-avatar" style="background: linear-gradient(135deg, #f59e0b, #d97706)">⚡</div>
          <div class="chat-info-col">
            <div class="chat-row-top">
              <span class="chat-title-text">Telefilter Engineering</span>
              <span class="chat-time">Yesterday</span>
            </div>
            <div class="chat-row-bottom">
              <span class="chat-snippet">Alex: v5.1.0 release is now live</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Active Chat Column -->
    <div id="column-center">
      <div class="chats-container tabs-container">
        <div class="chat tabs-tab active">
          <div class="topbar sidebar-header">
            <div class="topbar-left">
              <div class="topbar-avatar">🎨</div>
              <div>
                <div class="topbar-title">Creative Assets & Media</div>
                <div class="topbar-sub">1,420 members · 84 online</div>
              </div>
            </div>
            <div class="topbar-actions">
              <span>🔍</span>
              <span>📞</span>
              <span>⋮</span>
            </div>
          </div>

          <!-- Message Viewport -->
          <div class="bubbles bubbles-viewport">
            <!-- Message 1: Text -->
            <div class="bubble is-in is-message" data-mid="101">
              <div class="bubble-author">Marcus Vance</div>
              Here is the updated design package for Telefilter Desktop v5.1.0. The floating bulk action bar and selective reposting are ready for review!
              <span class="bubble-time">12:38</span>
            </div>

            <!-- Message 2: Photo (Selected) -->
            <div class="bubble is-in photo is-message is-selected" data-mid="102">
              <div class="bubble-author">Elena Rostova</div>
              <div class="bubble-media">
                <svg width="460" height="240" viewBox="0 0 460 240" style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); border-radius: 8px; display: block;">
                  <rect width="100%" height="100%" fill="none"/>
                  <circle cx="230" cy="110" r="45" fill="rgba(255,255,255,0.15)"/>
                  <path d="M215 95 L250 110 L215 125 Z" fill="#ffffff"/>
                  <text x="230" y="180" font-family="sans-serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="600">UI_Dark_Concept_Final.png</text>
                  <text x="230" y="200" font-family="sans-serif" font-size="11" fill="rgba(255,255,255,0.7)" text-anchor="middle">2880 × 1800 · 3.4 MB</text>
                </svg>
              </div>
              Updated dark mode tokens with high-contrast active states.
              <span class="bubble-time">12:40</span>
            </div>

            <!-- Message 3: Video (Selected) -->
            <div class="bubble is-in video is-message is-selected" data-mid="103">
              <div class="bubble-author">Sarah Jenkins</div>
              <div class="bubble-media">
                <svg width="460" height="220" viewBox="0 0 460 220" style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); border-radius: 8px; display: block;">
                  <circle cx="230" cy="100" r="36" fill="#3390ec"/>
                  <polygon points="224,88 242,100 224,112" fill="#fff"/>
                  <text x="230" y="165" font-family="sans-serif" font-size="13" fill="#ffffff" text-anchor="middle" font-weight="600">Telefilter_Flow_Demo_v5.mp4</text>
                  <text x="230" y="185" font-family="sans-serif" font-size="11" fill="rgba(255,255,255,0.7)" text-anchor="middle">01:42 · 1080p 60fps · 24.8 MB</text>
                </svg>
              </div>
              Screen recording showing the zero-lag virtual scroll and batch ZIP compilation.
              <div class="reactions">
                <span class="reaction-pill">🔥 42</span>
                <span class="reaction-pill">🚀 19</span>
                <span class="reaction-pill">❤️ 12</span>
              </div>
              <span class="bubble-time">12:42</span>
            </div>

            <!-- Message 4: Document (Selected) -->
            <div class="bubble is-in document is-message is-selected" data-mid="104">
              <div class="bubble-author">David Kim</div>
              <div class="bubble-doc">
                <div class="bubble-doc-icon">PDF</div>
                <div>
                  <div style="font-weight: 600; font-size: 13px;">Telefilter_Architecture_Spec_v5.1.pdf</div>
                  <div style="font-size: 11px; color: #8e9dae;">14.2 MB · Document</div>
                </div>
              </div>
              Formal architectural specifications and privacy verification models.
              <span class="bubble-time">12:45</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

(async () => {
  const assetsDir = path.join(__dirname, 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2, // HiDPI retina crispness
    });

    await page.route('**/k/', route => route.fulfill({ contentType: 'text/html', body: FIXTURE_HTML }));
    await page.goto('https://web.telegram.org/k/', { waitUntil: 'load' });

    // Seed realistic settings, history, and bookmarks in localStorage before userscript loads
    await page.evaluate(() => {
      const state = {
        bookmarks: [
          {
            peerId: 'chat_assets',
            mid: '102',
            chat: 'Creative Assets & Media',
            label: 'UI_Dark_Concept_Final.png',
            previewFull: 'Updated dark mode tokens with high-contrast active states.',
            preview: 'Updated dark mode tokens with high-contrast active states.',
            t: 'photo',
            createdAt: Date.now() - 3600000 * 2,
            tags: ['ui', 'darkmode', 'tokens', 'v5.1']
          },
          {
            peerId: 'chat_assets',
            mid: '103',
            chat: 'Creative Assets & Media',
            label: 'Telefilter_Flow_Demo_v5.mp4',
            previewFull: 'Screen recording showing the zero-lag virtual scroll and batch ZIP compilation.',
            preview: 'Screen recording showing the zero-lag virtual scroll and batch ZIP compilation.',
            t: 'video',
            createdAt: Date.now() - 3600000 * 5,
            tags: ['demo', 'video', 'harvester']
          },
          {
            peerId: 'chat_assets',
            mid: '104',
            chat: 'Creative Assets & Media',
            label: 'Telefilter_Architecture_Spec_v5.1.pdf',
            previewFull: 'Formal architectural specifications and privacy verification models.',
            preview: 'Formal architectural specifications and privacy verification models.',
            t: 'document',
            createdAt: Date.now() - 3600000 * 24,
            tags: ['spec', 'architecture', 'privacy']
          }
        ],
        history: [
          { time: '12:42', chat: 'Creative Assets & Media', files: 12, total: 12, failed: 0 },
          { time: 'Yesterday', chat: 'Saved Messages', files: 8, total: 8, failed: 0 }
        ],
        repostText: true,
        repostMedia: true,
        zipMode: false,
        smartNaming: true,
        saveCaptions: true
      };
      localStorage.setItem('tf3', JSON.stringify(state));
    });

    // Inject userscript
    await page.addScriptTag({ path: path.join(__dirname, 'telefilter_desktop.user.js') });
    await page.waitForSelector('.tf3-ctrl', { timeout: 5000 });

    console.log('[Capture] 1. Capturing Telegram WebK Overview with Telefilter...');
    // Create floating bulk bar with 3 items selected
    await page.evaluate(() => {
      const hook = window.__TF5_TEST__;
      if (hook && hook.buildBulkBar) {
        const bar = hook.buildBulkBar();
        const chat = document.querySelector('.chat.active') || document.querySelector('#column-center');
        if (chat && !document.getElementById('tf5-bulk-bar')) {
          chat.appendChild(bar);
        }
        bar.classList.add('is-visible');
        const badge = bar.querySelector('.tf5-bulk-count-badge');
        if (badge) badge.textContent = '3';
      }
    });

    await page.waitForTimeout(300);

    // Capture 1: Full WebK Overview (shows active chat with inline toolbar + floating bulk bar)
    await page.screenshot({
      path: path.join(assetsDir, 'overview-webk.png'),
      fullPage: false,
    });
    console.log('✔ Captured assets/overview-webk.png');

    // Capture 2: Inline Toolbar Panel
    console.log('[Capture] 2. Capturing Inline Toolbar Panel...');
    const toolbar = await page.$('.tf3-ctrl');
    if (toolbar) {
      await toolbar.screenshot({
        path: path.join(assetsDir, 'panel-toolbar.png'),
      });
      console.log('✔ Captured assets/panel-toolbar.png');
    }

    // Capture 3: Floating Bulk Action Bar
    console.log('[Capture] 3. Capturing Floating Bulk Bar...');
    const bulkBar = await page.$('#tf5-bulk-bar');
    if (bulkBar) {
      await bulkBar.screenshot({
        path: path.join(assetsDir, 'panel-bulk-bar.png'),
      });
      console.log('✔ Captured assets/panel-bulk-bar.png');
    }

    // Capture 4: Settings Dialog via More menu
    console.log('[Capture] 4. Capturing Settings Dialog...');
    await page.click('.tf3-more summary');
    await page.waitForTimeout(150);
    await page.click('.tf3-more .tf3-popover-menu button:has-text("Settings")');
    await page.waitForSelector('#tf3-overlay .tf3-settings-card', { timeout: 4000 });
    const settingsCard = await page.$('#tf3-overlay .tf3-settings-card');
    if (settingsCard) {
      await settingsCard.screenshot({
        path: path.join(assetsDir, 'panel-settings.png'),
      });
      console.log('✔ Captured assets/panel-settings.png');
    }
    // Close settings dialog
    await page.click('#tf3-overlay .tf3-done');
    await page.waitForTimeout(200);

    // Capture 5: Workspace Library Dialog via Library pill
    console.log('[Capture] 5. Capturing Workspace Library Dialog...');
    await page.click('.tf3-bm-pill');
    await page.waitForSelector('#tf3-overlay .tf3-library-card', { timeout: 4000 });
    const libraryCard = await page.$('#tf3-overlay .tf3-library-card');
    if (libraryCard) {
      await libraryCard.screenshot({
        path: path.join(assetsDir, 'panel-library.png'),
      });
      console.log('✔ Captured assets/panel-library.png');
    }
    // Close library dialog
    await page.click('#tf3-overlay .tf3-done');
    await page.waitForTimeout(200);

    // Capture 6: Download Progress Panel
    console.log('[Capture] 6. Capturing Active Download Progress Panel...');
    await page.evaluate(() => {
      let p = document.querySelector('#tf3-panel');
      if (!p) {
        p = document.createElement('div');
        p.id = 'tf3-panel';
        p.className = 'tf3-active';
        p.innerHTML = `
          <div class="h"><div class="hl"><span class="l">7/12 (58%)</span></div>
          <div class="hr"><button type="button" class="pp" aria-label="Pause queue">Ⅱ</button><button type="button" class="cc" aria-label="Cancel">✕</button></div></div>
          <div class="b"><div class="pb" role="progressbar" aria-valuenow="58"><div class="pf" style="transform: scaleX(0.58);"></div></div><div class="fn">Telefilter_Media_Bundle_2026.zip · 42.8 MB / 73.5 MB</div><div class="st">Compressing ZIP archive...</div></div>`;
        const bar = document.querySelector('.tf3-ctrl');
        if (bar) bar.appendChild(p);
      }
      p.style.display = 'flex';
    });
    const dlPanel = await page.$('#tf3-panel');
    if (dlPanel) {
      await dlPanel.screenshot({
        path: path.join(assetsDir, 'panel-download.png'),
      });
      console.log('✔ Captured assets/panel-download.png');
    }

    console.log('🎉 All panels captured successfully!');
  } finally {
    await browser.close();
  }
})();
