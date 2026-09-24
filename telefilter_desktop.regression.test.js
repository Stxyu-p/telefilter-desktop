'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'telefilter_desktop.user.js'), 'utf8');
function section(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  assert(start >= 0 && end > start, `Missing section: ${from}`);
  return source.slice(start, end);
}
async function batch(scenario, failure = "", album = null) {
  const records = [], archives = [], files = [];
  let groupCalls = 0;
  const refs = Object.fromEntries(['pause','cancel','label','filename','retry','status'].map(k => [k, {style:{}}]));
  const S = {batchRunning:false, zipMode:true, smartNaming:false, saveCaptions:false, panelRefs:refs};
  const ctx = {S, console, Date, Uint8Array, TextEncoder, ZIP_PAYLOAD_LIMIT:128*1024*1024, normalizePeerId:String,
    TG:{hasDownloadManager:()=>true, im:()=>({chat:{managers:{appMessagesManager:{getMessagesByGroupedId:async()=>{groupCalls++;return album;}}}}})},
    getMedia:m=>m?.media?.document || m?.media?.photo, renderActionButtons(){}, clearTimeout(){}, debug(){},
    pnlUpd(){}, sleep:async()=>{}, metaFromMsg:()=>({}), recordError(){},
    TelefilterVault:{recordDownload:async(p,m)=>records.push(m)},
    getMediaBytes:async(msg)=>{ scenario(S); return new Uint8Array([msg.id]); },
    createStoredZip:entries=>{ if (failure === 'build') throw Error('build failed'); files.push(...entries); archives.push(true); return new Blob(['x']); },
    sanitizeFileName:s=>s, addHistory(){}, pnlDone(){}, schedulePanelHide(){},
    URL:{createObjectURL:()=> 'blob:test', revokeObjectURL(){}}, setTimeout(){},
    document:{body:{appendChild(){}},createElement:()=>({click(){if(failure === "handoff") throw Error("handoff failed");},remove(){}})}
  };
  vm.createContext(ctx);
  vm.runInContext(section('  async function downloadTargets(', '  async function runCategoryJob(') + ';this.run=downloadTargets;',ctx);
  const targets = album ? [album[4], album[0]] : [{id:1,media:{photo:{}}}];
  const result = await ctx.run(targets, 'test', '123','Chat',{});
  return {records,archives,files,groupCalls,result,running:S.batchRunning};
}
for (const failure of ['build', 'handoff']) test(`ZIP ${failure} failure never records success`, async()=> {
  const r = await batch(()=>{}, failure);
  assert.equal(r.records.length,0); assert.equal(r.result.ok,0); assert.equal(r.running,false);
});
test('ZIP cancel does not mark unsaved bytes as downloaded', async()=>{
  const r = await batch(S=>{S.panelCancel=true;});
  assert.equal(r.records.length,0);
  assert.equal(r.archives.length,0);
  assert.equal(r.result.ok,0);
});
test('single download reports missing, failed, and successful outcomes honestly', async()=>{
  let msg=null, success=false, writes=0;
  const ctx={S:{panelCancel:false,batchRunning:false}, normalizePeerId:String,
    lookupMsg:async()=>msg, dlSingleShot:async()=>success,
    TelefilterVault:{recordDownload:async()=>writes++},metaFromMsg:()=>({}),recordError(){}};
  vm.createContext(ctx);
  vm.runInContext(section('  async function dlSingle(', '  /* ─── LAZY-LOAD REFRESH')+';this.run=dlSingle;',ctx);
  assert.equal(await ctx.run('1','2'),false);assert.equal(writes,0);
  msg={id:2};assert.equal(await ctx.run('1','2'),false);assert.equal(writes,0);
  success=true;assert.equal(await ctx.run('1','2'),true);assert.equal(writes,1);
  ctx.S.batchRunning=true;assert.equal(await ctx.run('1','2'),false);assert.equal(writes,1);
});
async function harvest(changeChat=false) {
  let peer='1', steps=0;
  const index=new Map([['old','photo']]);
  const scroll={scrollTop:0,scrollHeight:100,dispatchEvent(){}};
  const bubbles={isConnected:true,closest:()=>scroll};
  const S={bubbles,mediaCount:1,mediaIndex:new Map([['1',index]])};
  const progress=[];
  const ctx={S,Event,Date,normalizePeerId:String,currentPeerId:()=>peer,
    locatorContext:()=>({}),sameLocatorContext:p=>p===peer,
    sleep:async()=>{steps++;if(changeChat)peer='2';},
    resyncMediaCounters:b=>{assert.equal(peer,'1','must not rescan after chat switch');index.set('new'+steps,'photo');},
    forceRefreshLazyMedia(){},queueBadgeUpdate(){}};
  vm.createContext(ctx);
  vm.runInContext('let isHarvesting=false,harvestStopRequested=false;'+section('  async function runDeepHarvester(', '  function toggleDeepHarvester(')+';this.run=runDeepHarvester;',ctx);
  const gained=await ctx.run(2,n=>progress.push(n));
  return {gained,steps,progress};
}
test('harvest measures unique discoveries despite constant DOM count',async()=>{
  const r=await harvest();assert.equal(r.gained,2);assert.equal(r.progress[0],0);assert.equal(r.progress.at(-1),2);
});
test('harvest stops before rescanning a different chat',async()=>{
  const r=await harvest(true);assert.equal(r.gained,0);assert.equal(r.steps,1);
});
test('ZIP bytes use native Blob API, choose full photo, and enforce byte budget',async()=>{
  const thumb={_: 'photoSize',type:'y',size:3};
  const media={_: 'photo',sizes:[{_: 'photoSize',type:'s',size:1},thumb]};
  let calls=0, options;
  const ctx={Uint8Array,TG:{hasDownloadManager:()=>false},findBubbleByMid:()=>null,S:{panelCancel:false},getMedia:m=>m.media,
    W:{appDownloadManager:{downloadMedia:async(o,type)=>{calls++;options=o;assert.equal(type,'blob');return new Blob(['abc']);}}}};
  vm.createContext(ctx);
  vm.runInContext(section('  async function getMediaBytes(', '  /* ─── STORAGE SYSTEM')+';this.run=getMediaBytes;',ctx);
  assert.deepEqual(Array.from(await ctx.run({media},3)),[97,98,99]);
  assert.equal(options.media,media);assert.equal(options.thumb,thumb);
  await assert.rejects(ctx.run({media},2),/ZIP.*limit/);assert.equal(calls,1);
  ctx.S.panelCancel=true;assert.equal(await ctx.run({media},3),null);assert.equal(calls,1);
});
test('ZIP refuses unknown-size documents and never captures page downloads',async()=>{
  const ctx={Uint8Array,TG:{hasDownloadManager:()=>false},findBubbleByMid:()=>null,S:{panelCancel:false},getMedia:m=>m.media,
    W:{appDownloadManager:{downloadMedia(){throw Error('must not download');}}}};
  vm.createContext(ctx);
  vm.runInContext(section('  async function getMediaBytes(', '  /* ─── STORAGE SYSTEM')+';this.run=getMediaBytes;',ctx);
  await assert.rejects(ctx.run({media:{_: 'document'}},4),/size/);
  assert(!source.includes('HTMLAnchorElement.prototype.click ='));
});
test('viewer bookmark uses target peer and topic, not background chat',async()=>{
  let saved, ack;
  const ctx={W:{appMediaViewer:{target:{peerId:-123,mid:456,message:{peerId:-123,mid:456,message:'caption'}},searchContext:{threadId:99}}},
    document:{getElementById:()=>({})},normalizePeerId:String,recordError(){},
    addBookmark:async(...args)=>{saved=args;return true;},showActionAck:t=>{ack=t;}};
  vm.createContext(ctx);
  vm.runInContext(section('  function triggerMediaViewerBookmark()', '  function watchMediaViewer()')+';this.run=triggerMediaViewerBookmark;',ctx);
  await ctx.run();
  assert.equal(saved?.[0],'-123');assert.equal(saved[1],456);assert.equal(saved[3].threadId,99);assert.equal(ack,'Bookmarked ✓');
  saved=null;ctx.W.appMediaViewer.target.mid=Number.MAX_SAFE_INTEGER;
  await ctx.run();assert.equal(saved,null);
  ctx.W.appMediaViewer.target.mid=456;ctx.W.appMediaViewer.searchContext.isScheduled=true;
  await ctx.run();assert.equal(saved,null);
});
test('ZIP expands a mixed album to exactly 3 videos and 2 photos, once each',async()=>{
  const album=Array.from({length:5},(_,i)=>({id:i+1,mid:100+i,peerId:123,grouped_id:'album',
    media:i<3?{document:{mime_type:'video/mp4',attributes:[]}}:{photo:{}}}));
  const r=await batch(()=>{},'',album);
  assert.equal(r.result.total,5);assert.equal(r.result.ok,5);assert.equal(r.groupCalls,1);
  assert.equal(r.files.length,5);assert.equal(new Set(r.files.map(f=>f.name)).size,5);
  assert.equal(r.files.filter(f=>f.name.endsWith('.mp4')).length,3);
  assert.equal(r.files.filter(f=>f.name.endsWith('.jpg')).length,2);
  assert.deepEqual(r.files.map(f=>f.data[0]),[1,2,3,4,5]);
  assert.deepEqual(r.records,[100,101,102,103,104]);
});
function counter() {
  const S={mediaCat:new WeakMap(),mediaMid:new WeakMap(),mediaCount:0,catCounts:{photo:0,viral:0}};
  const ctx={S,getBubbleCategory:b=>b.cat,isMediaBubble:b=>b.cat==='photo',getMidFromBubble:b=>b.mid,
    getMessageReactionCount:b=>b.reactions,idxAdd(){},idxMove:()=>true};
  vm.createContext(ctx);
  vm.runInContext(section('  function reconcileMediaBubble(', '  function resetAndScanMedia(')+';this.run=reconcileMediaBubble;',ctx);
  const bubble=()=>{const classes=new Set();return {cat:'photo',mid:'1',reactions:0,classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)}};};
  return {S,run:ctx.run,bubble};
}
test('category removal decrements once and text transition updates total',()=>{
  const {S,run,bubble}=counter(),a=bubble(),b=bubble();
  run(a,1);run(b,1);a.cat=null;run(a,1);
  assert.equal(S.mediaCount,1);assert.equal(S.catCounts.photo,1);
  b.cat='text';run(b,1);assert.equal(S.mediaCount,0);
});
test('reaction removal and reinsertion preserve counts',()=>{
  const {S,run,bubble}=counter(),a=bubble();
  a.classList.add('tf3-has-reactions');a.reactions=2;run(a,1);
  assert.equal(S.catCounts.viral,1);
  a.reactions=0;run(a,1);assert.equal(S.catCounts.viral,0);
  assert.equal(a.classList.contains('tf3-has-reactions'),false);
});
test('harvest running CSS does not disable its Stop button',()=>{
  assert(!source.includes('.tf3-pill.is-running { animation: tf3-pulse 1.2s ease-in-out infinite; pointer-events: none; }'));
});
test('viewer bookmarks never invent message IDs',()=>{
  assert(!section('  function triggerMediaViewerBookmark()', '  function watchMediaViewer()').includes('Date.now()'));
});
test('ZIP mode is frozen for the running batch', async()=>{
  const r = await batch(S=>{S.zipMode=false;});
  assert.equal(r.archives.length,1);
  assert.equal(r.records.length,1);
  assert.equal(r.result.ok,1);
});
