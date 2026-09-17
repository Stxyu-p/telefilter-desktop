'use strict';
// Exercises shipped UI in Chromium; host actions are stubs, never account operations.
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
  const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const blocks = [section('  function ico(', '  const getMedia'), section('  function buildBar()', '  /* ─── INJECT & DOM WATCHER'), section('  function mountStyles()', '  /* ─── TEST HOOKS'), section('  function renderActionButtons()', '  async function downloadTargets'), section('  function pnl()', '  function mountDialog(')];
    // Extract the shipped filter definitions too, including actual SVG codes.
    const filters = require('node:vm').runInNewContext(section('  const FILTERS =', '  const MEDIA_BUBBLE_SELECTOR_OLD') + ';FILTERS;');
    assert.equal(filters.length, 5); assert(filters.every(f => f.ico !== 'e994')); assert(filters.every(f => f.ico));
    for (const dark of [false,true]) for (const width of [320,560,760,1100]) {
      await page.setViewportSize({width:1200,height:850});
      await page.setContent(`<html><body style="margin:0"><div id="fixture" style="width:${width}px"><header style="height:48px">Chat fixture (not Telegram)</header><article style="height:400px">Messages</article></div></body></html>`);
      await page.evaluate(({blocks,filters,dark}) => {
        const noop=()=>{};
        const S={zipMode:false,batchRunning:false,fActive:new Set(),panel:null,lastFailedTargets:[]};
        const calls={filter:0,download:0,library:0,settings:0,history:0,harvest:0,save:0};
        const env={S,VERSION:'test',FILTERS:filters,handleControlFeedback:noop,updateBadge:noop,saveScrollAnchor:noop,applyFilterState:noop,restoreScrollAnchor:noop,saveChatFilter:noop,forceRefreshLazyMedia:noop,toggleFilter:()=>calls.filter++,runCategoryJob:noop,toggleDeepHarvester:()=>calls.harvest++,saveStorage:()=>calls.save++,showActionAck:noop,downloadNativeSelection:()=>calls.download++,showLocatorLibrary:()=>calls.library++,updateBookmarkPill:noop,showSettings:()=>calls.settings++,showHistory:()=>calls.history++,syncDialogTheme:noop,schedulePanelHide:noop,downloadTargets:noop};
        // Code is extracted only from the trusted local artifact; no external strings.
        const api = new Function(...Object.keys(env), blocks.join('\n')+'; return {buildBar,mountStyles,renderActionButtons,pnlUpd,pnlDone};')(...Object.values(env));
        api.mountStyles();
        S.bar=api.buildBar(); S.bar.classList.toggle('tf3-dark',dark);
        document.querySelector('article').before(S.bar); api.renderActionButtons();
        window.fixture={S,calls,api};
      },{blocks,filters,dark});
      assert.equal(await page.locator('.tf3-toggle').count(),0);
      assert(await page.locator('.tf3-content').isVisible());
      await page.locator('[data-key="photo"]').click();
      await page.locator('#tf3-dlb').click();
      await page.locator('.tf3-bm-pill').click();
      assert.deepEqual(await page.evaluate(()=>[fixture.calls.filter,fixture.calls.download,fixture.calls.library]),[1,1,1]);
      const fits = async () => page.evaluate(()=>{
        const bar=document.querySelector('.tf3-ctrl'), b=bar.getBoundingClientRect(), article=document.querySelector('article').getBoundingClientRect();
        const controls=[...bar.querySelectorAll('button,summary')].filter(e=>e.checkVisibility());
        return {overlap:b.bottom>article.top+1,overflow:bar.scrollWidth>bar.clientWidth+1,outside:controls.some(e=>{const r=e.getBoundingClientRect();return r.right>b.right+1||r.left<b.left-1;})};
      });
      assert.deepEqual(await fits(),{overlap:false,overflow:false,outside:false},`idle ${width} dark=${dark}`);
      await page.locator('.tf3-format summary').click();
      await page.locator('.tf5-zip-pill').click();
      assert.equal(await page.locator('.tf5-zip-pill').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('.tf3-dl-label').textContent(),'ZIP Download');
      assert.deepEqual(await fits(),{overlap:false,overflow:false,outside:false},`format ${width}`);
      await page.locator('.tf3-format summary').focus(); await page.keyboard.press('Escape');
      assert.equal(await page.locator('.tf3-format').evaluate(e=>e.open),false);
      await page.locator('.tf3-more summary').click();
      await page.locator('.tf5-harvest-pill').click();
      assert.equal(await page.evaluate(()=>fixture.calls.harvest),1);
      assert.deepEqual(await fits(),{overlap:false,overflow:false,outside:false},`more ${width}`);
      await page.locator('.tf3-more summary').focus(); await page.keyboard.press('Escape');
      await page.evaluate(()=>{fixture.S.batchRunning=true;fixture.api.renderActionButtons();fixture.api.pnlUpd(2,5,'Example file.jpg');});
      assert(await page.locator('#tf3-dlb').isDisabled());
      assert.equal(await page.locator('#tf3-panel .pb').getAttribute('aria-valuenow'),'40');
      assert.deepEqual(await fits(),{overlap:false,overflow:false,outside:false},`progress ${width}`);
      await page.evaluate(()=>{
        const old=fixture.S.panel;fixture.S.bar.remove();fixture.S.bar=fixture.api.buildBar();document.querySelector('article').before(fixture.S.bar);
        if(fixture.S.panel!==old || old.parentElement!==fixture.S.bar) throw Error('Panel lost during remount');
      });
      console.log(`PASS browser fixture: ${width}px ${dark?'dark':'light'}; actions, disclosures, inline progress, remount, bounds`);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: 8 browser layouts, 0 page errors. Telegram host integration not exercised.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
