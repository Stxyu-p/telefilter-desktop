'use strict';
// Reproduces bar placement through the shipped inject() on Telegram-like DOM shapes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync(path.join(__dirname, 'telefilter_desktop.user.js'), 'utf8');
function section(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  assert(start >= 0 && end > start, `Missing section: ${from}`);
  return source.slice(start, end);
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const blocks = [section('  function parseColor(', '  let themeObserver'), section('  function ico(', '  const getMedia'), section('  function buildBar()', '  function inject('), section('  function mountStyles()', '  if (W.__TF5_TEST_MODE__'), section('  function renderActionButtons()', '  async function downloadTargets'), section('  function pnl()', '  function mountDialog('), section('  function inject(', '  const findColumn = () =>')];
    const filters = require('node:vm').runInNewContext(section('  const FILTERS =', '  const MEDIA_BUBBLE_SELECTOR_OLD') + ';FILTERS;');
    const shapes = {
      // Production WebK shapes (grep-verified 2026-09-25): #column-center > .chat
      // > .sidebar-header + .bubbles[.scrollable-y]. MessageList/MiddleHeader live
      // only in WebA and are intentionally not exercised here.
      oldChat: `<div id="column-center" style="width:1100px;height:600px;position:relative"><div class="chat" style="display:flex;flex-direction:column;height:100%"><div class="sidebar-header" style="height:48px;background:#212121">Header</div><div class="bubbles" style="flex:1;overflow:auto"><div class="bubble">x</div></div></div></div>`,
      emptyBubbles: `<div id="column-center" style="width:1100px;height:600px;position:relative"><div class="chat" style="display:flex;flex-direction:column;height:100%"><div class="sidebar-header" style="height:48px;background:#212121">Header</div><div class="bubbles" style="flex:1;overflow:auto"></div></div></div>`,
      scrollableChat: `<div class="column"><div class="chat" style="display:flex;flex-direction:column;height:600px"><div class="sidebar-header" style="height:48px;background:#212121">Header</div><div class="scrollable-y" style="flex:1;overflow:auto"><div class="bubble">x</div></div></div></div>`,
    };
    for (const [name, html] of Object.entries(shapes)) {
      await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
      await page.evaluate(({ blocks, filters }) => {
        const noop = () => {};
        const S = { zipMode: false, batchRunning: false, fActive: new Set(), chatFilters: new Map(), fActivePeer: null, mediaCount: 0, catCounts: {}, panel: null, lastFailedTargets: [], expanded: false };
        let isNewWebKDOM = false;
        const env = { S, VERSION: 'test', FILTERS: filters, isNewWebKDOM: v => isNewWebKDOM = v, debug: noop, normalizePeerId: String, currentPeerId: () => '1',
          handleControlFeedback: noop, updateBadge: noop, saveScrollAnchor: noop, applyFilterState: noop, restoreScrollAnchor: noop, saveChatFilter: noop,
          forceRefreshLazyMedia: noop, toggleFilter: noop, runCategoryJob: noop, toggleDeepHarvester: noop, saveStorage: noop, showActionAck: noop,
          downloadNativeSelection: noop, handleRepostSelection: noop, showLocatorLibrary: noop, updateBookmarkPill: noop, showSettings: noop, showHistory: noop, syncDialogTheme: noop,
          setupMediaCounter: noop, watchBubblesHost: noop, watchBarHost: noop, watchColumn: noop, scheduleInject: noop };
        const api = new Function(...Object.keys(env), blocks.join('\n') + '; return {inject,mountStyles};')(...Object.values(env));
        api.mountStyles();
        const ok = api.inject(document.body.firstElementChild);
        window.fixture = { ok, S };
      }, { blocks, filters });
      const state = await page.evaluate(() => {
        const bar = document.querySelector('.tf3-ctrl');
        if (!bar) return { ok: fixture.ok, bar: false };
        const r = bar.getBoundingClientRect();
        const cs = getComputedStyle(bar);
        const controls = [...bar.querySelectorAll('button,summary')].filter(e => e.checkVisibility());
        return { ok: fixture.ok, bar: true, width: r.width, height: r.height, display: cs.display, visible: cs.visibility, opacity: cs.opacity, controls: controls.length, html: bar.parentElement.className || bar.parentElement.tagName };
      });
      assert(state.ok, `${name}: inject reported failure`);
      assert(state.bar && state.width > 200 && state.height >= 32 && state.controls >= 5 && state.display !== 'none' && state.opacity !== '0', `${name}: bar collapsed -> ${JSON.stringify(state)}`);
      console.log(`PASS ${name}: bar ${state.width}x${Math.round(state.height)} in ${state.html}, ${state.controls} visible controls`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: inject() mounts a full-size bar on all DOM shapes; 0 page errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
