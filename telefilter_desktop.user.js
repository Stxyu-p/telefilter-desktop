// ==UserScript==
// @name         Telefilter Desktop Edition v5
// @namespace    telefilter-5
// @version      5.0.0
// @description  Telefilter v5 Ultimate: High-performance Telegram WebK assistant with zero-DOM media filters, pure client-side ZIP bundling, MediaViewer & Story action overlay, deep harvester, protected content unblocker, reactions scrubber, and persistent IndexedDB vault.
// @author       MIKA × P Choke × SORA
// @match        https://web.telegram.org/*
// @match        https://webk.telegram.org/*
// @match        https://webz.telegram.org/*
// @icon         https://web.telegram.org/k/assets/img/favicon.ico
// @grant        none
// @run-at       document-start
// ==/UserScript==

/*
 * TELEFILTER DESKTOP EDITION v5 (Ultimate Edition)
 *
 * 🛡️  Low-coupling Architecture:
 *        • Zero DOM mutation on message bubbles / images / albums
 *        • Telegram media renders 100% natively via WebK internal engine
 * 📦  Pure Client-side ZIP32 Generator (Zero External Dependencies)
 * 🗄️  TelefilterVault: Persistent Deduplication via IndexedDB
 * ⚡  Deep Harvester: DOM Virtualization Buster with live progress
 * 👁️  MediaViewer & Story Direct Actions (Overlay buttons + Hotkeys D/B)
 * 🔓  Protected Content & Text Unblocker: Re-enables select, copy & context menu
 * 📝  Smart File Naming & Captions Sidecar (.txt metadata bundled)
 * 🔥  Reactions & Viral Scrubber: Fast filtering of top-reacted posts
 * 🔖  Independent Bookmarks Workspace with rich search syntax
 * 🚀  WeakMap-driven O(1) Counter & Zero-scroll overhead
 */

(function () {
  'use strict';

  /* ─── GATE & ENVIRONMENT ──────────────── */
  const isWebK = location.hostname.includes('webk') ||
                 location.hostname.includes('webz') ||
                 location.pathname.startsWith('/k/');
  if (!isWebK) {
    location.replace('https://web.telegram.org/k/' + location.hash);
    return;
  }

  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const VERSION = '5.0.0';
  const LIMITS = Object.freeze({
    history: 50,
    bookmarks: 500,
    mediaPerPeer: 5000,
    mediaPeers: 25,
    filterChats: 100,
    libraryRows: 500,
    errors: 20
  });
  const UI = Object.freeze({
    ackMs: 420,
    ackToastMs: 900,
    scrollSettle: 300,
    contextWatch: 600
  });
  const DAY_MS = 86_400_000;
  const DEBUG = false;
  const debug = (...args) => { if (DEBUG) console.debug('[TF5]', ...args); };

  /* ─── PURE CLIENT-SIDE ZIP32 GENERATOR (Zero External Dependencies) ─── */
  const CRC32_TABLE = new Uint32Array(256);
  (() => {
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
      }
      CRC32_TABLE[i] = c >>> 0;
    }
  })();

  function crc32Bytes(uint8Array) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < uint8Array.length; i++) {
      crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ uint8Array[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosTimestamp(date = new Date()) {
    const d = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const t = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    return { dosDate: d, dosTime: t };
  }

  function createStoredZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const { dosDate, dosTime } = dosTimestamp();

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      let dataBytes;
      if (file.data instanceof Uint8Array) dataBytes = file.data;
      else if (typeof file.data === 'string') dataBytes = encoder.encode(file.data);
      else if (file.data instanceof ArrayBuffer) dataBytes = new Uint8Array(file.data);
      else dataBytes = new Uint8Array(file.data || 0);

      const crc = crc32Bytes(dataBytes);
      const size = dataBytes.length;

      const lfh = new Uint8Array(30 + nameBytes.length);
      const lfhView = new DataView(lfh.buffer);
      lfhView.setUint32(0, 0x04034b50, true);
      lfhView.setUint16(4, 20, true);
      lfhView.setUint16(6, 0x0800, true); // UTF-8 filename flag
      lfhView.setUint16(8, 0, true);      // Stored (no compression)
      lfhView.setUint16(10, dosTime, true);
      lfhView.setUint16(12, dosDate, true);
      lfhView.setUint32(14, crc, true);
      lfhView.setUint32(18, size, true);
      lfhView.setUint32(22, size, true);
      lfhView.setUint16(26, nameBytes.length, true);
      lfhView.setUint16(28, 0, true);
      lfh.set(nameBytes, 30);

      localParts.push(lfh, dataBytes);

      const cdh = new Uint8Array(46 + nameBytes.length);
      const cdhView = new DataView(cdh.buffer);
      cdhView.setUint32(0, 0x02014b50, true);
      cdhView.setUint16(4, 20, true);
      cdhView.setUint16(6, 20, true);
      cdhView.setUint16(8, 0x0800, true);
      cdhView.setUint16(10, 0, true);
      cdhView.setUint16(12, dosTime, true);
      cdhView.setUint16(14, dosDate, true);
      cdhView.setUint32(16, crc, true);
      cdhView.setUint32(20, size, true);
      cdhView.setUint32(24, size, true);
      cdhView.setUint16(28, nameBytes.length, true);
      cdhView.setUint16(30, 0, true);
      cdhView.setUint16(32, 0, true);
      cdhView.setUint16(34, 0, true);
      cdhView.setUint16(36, 0, true);
      cdhView.setUint32(38, 0, true);
      cdhView.setUint32(42, offset, true);
      cdh.set(nameBytes, 46);

      centralParts.push(cdh);
      offset += lfh.length + size;
    }

    const cdOffset = offset;
    let cdSize = 0;
    for (const p of centralParts) cdSize += p.length;

    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, files.length, true);
    eocdView.setUint16(10, files.length, true);
    eocdView.setUint32(12, cdSize, true);
    eocdView.setUint32(16, cdOffset, true);
    eocdView.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
  }

  /* ─── UTILS & NATIVE BRIDGE ──────────────── */
  const normalizePeerId = pid => pid == null ? '' : String(pid);
  const mediaKey = (pid, mid) => normalizePeerId(pid) + ':' + String(mid ?? '');
  const TG = Object.freeze({
    im: () => W.appImManager ?? null,
    currentPeerId: () => W.appImManager?.chat?.peerId ?? null,
    currentThreadId: () => W.appImManager?.chat?.threadId ?? null,
    currentMonoforumThreadId: () => W.appImManager?.chat?.monoforumThreadId ?? null,
    selection: () => W.appImManager?.chat?.selection ?? null,
    lookupMessage: (pid, mid) => W.mtprotoMessagePort?.getMessageByPeer(pid, +mid),
    downloadMedia(media) {
      const dm = W.appDownloadManager;
      if (typeof dm?.downloadToDisc !== 'function') throw new Error('Telegram download manager unavailable');
      return dm.downloadToDisc({ media });
    },
    hasDownloadManager: () => typeof W.appDownloadManager?.downloadToDisc === 'function',
  });
  const currentPeerId = TG.currentPeerId;
  const currentThreadId = TG.currentThreadId;
  const currentMonoforumThreadId = TG.currentMonoforumThreadId;
  const locatorContext = () => ({
    threadId: currentThreadId(),
    monoforumThreadId: currentMonoforumThreadId(),
  });
  const locatorPart = value => { const n = Number(value); return Number.isFinite(n) && n ? String(n) : '0'; };

  function ico(code) {
    const paths = {
      ea87: '<path d="M4 6h16M4 12h16M4 18h10"/>',
      e9c3: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
      e9b5: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3Z"/>',
      e979: '<path d="M14 2H6v20h12V6Zm0 0v5h4M8 12h8M8 16h8"/>',
      ea84: '<path d="m12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1Z"/>',
    };
    if (paths[code]) {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [key, value] of Object.entries({viewBox:'0 0 24 24',width:'16',height:'16',fill:'none',stroke:'currentColor','stroke-width':'1.75','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'})) icon.setAttribute(key, value);
      icon.innerHTML = paths[code]; // Static local SVG paths only.
      return icon;
    }
    const el = document.createElement('span');
    el.className = 'tgico';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = String.fromCodePoint(parseInt(code, 16));
    return el;
  }

  const getMedia = msg => msg?.media && (msg.media.document || msg.media.photo);
  const lookupMsg = TG.lookupMessage;
  const primitivePeerId = value => ['string','number','bigint'].includes(typeof value) ? normalizePeerId(value) : '';
  const messagePeerId = msg => primitivePeerId(msg?.peerId) || primitivePeerId(msg?.peer_id) ||
    primitivePeerId(msg?.peer?.peerId) || normalizePeerId(currentPeerId());

  const locatorCtxFrom = v => ({ threadId: v?.threadId ?? v?.h ?? null, monoforumThreadId: v?.monoforumThreadId ?? v?.mh ?? null });
  const sameLocatorContext = (peerId, ctx = {}) => normalizePeerId(peerId) === normalizePeerId(currentPeerId()) &&
    locatorPart(ctx.threadId) === locatorPart(currentThreadId()) &&
    locatorPart(ctx.monoforumThreadId) === locatorPart(currentMonoforumThreadId());
  function touchBoundedMap(map, key, value, limit) {
    map.delete(key); map.set(key, value);
    while (map.size > limit) map.delete(map.keys().next().value);
    return value;
  }
  const rafThrottle = fn => { let frame = 0; return (...args) => { if (frame) cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { frame = 0; fn(...args); }); }; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  /* ─── SMART FILE NAMING & SANITIZER ─── */
  function sanitizeFileName(str, fallback = 'file') {
    if (!str) return fallback;
    const cleaned = String(str)
      .replace(/[\x00-\x1f\x7f]/g, '')
      .replace(/[\/\\:*?"<>|\s]+/g, '_')
      .replace(/^\.+/, '')
      .replace(/[\s._]+$/, '')
      .trim();
    return cleaned.slice(0, 100) || fallback;
  }

  function formatSmartFileName(msg, defaultName = '', chatTitle = '') {
    const rawDate = Number(msg?.date) ? new Date(msg.date * 1000) : new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${rawDate.getFullYear()}-${pad(rawDate.getMonth() + 1)}-${pad(rawDate.getDate())}_${pad(rawDate.getHours())}${pad(rawDate.getMinutes())}`;

    const doc = msg?.media?.document;
    const origName = doc?.file_name || defaultName || (msg?.media?.photo ? `photo_${msg?.id}.jpg` : `file_${msg?.id || Date.now()}`);
    const extMatch = origName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? '.' + extMatch[1].toLowerCase() : (msg?.media?.photo ? '.jpg' : '');
    const baseName = extMatch ? origName.slice(0, -extMatch[0].length) : origName;

    const chat = sanitizeFileName(chatTitle || getActiveChatTitle(), 'chat').slice(0, 24);
    const cleanBase = sanitizeFileName(baseName, 'item').slice(0, 40);
    return `${dateStr}_${chat}_${cleanBase}${ext}`;
  }

  /* ─── INDEXEDDB VAULT (Persistent Mid Deduplication) ─── */
  const TelefilterVault = {
    db: null,
    ready: false,
    async init() {
      if (typeof indexedDB === 'undefined') return false;
      return new Promise(resolve => {
        try {
          const req = indexedDB.open('telefilter_vault', 1);
          req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('downloads')) {
              db.createObjectStore('downloads', { keyPath: 'key' });
            }
          };
          req.onsuccess = e => {
            this.db = e.target.result;
            this.ready = true;
            this.loadAllKeys().then(() => resolve(true));
          };
          req.onerror = () => resolve(false);
        } catch (_) { resolve(false); }
      });
    },
    async loadAllKeys() {
      if (!this.db) return;
      return new Promise(resolve => {
        try {
          const tx = this.db.transaction('downloads', 'readonly');
          const store = tx.objectStore('downloads');
          const req = store.getAllKeys();
          req.onsuccess = () => {
            if (Array.isArray(req.result)) {
              for (const k of req.result) S.downloadedVaultKeys.add(String(k));
            }
            resolve(true);
          };
          req.onerror = () => resolve(false);
        } catch (_) { resolve(false); }
      });
    },
    hasDownloaded(pid, mid) {
      return S.downloadedVaultKeys.has(mediaKey(pid, mid));
    },
    isDownloaded(pid, mid) {
      return this.hasDownloaded(pid, mid);
    },
    async recordDownload(pid, mid, meta = {}) {
      const k = mediaKey(pid, mid);
      S.downloadedVaultKeys.add(k);
      S.dlSession.add(k);
      if (!this.db) return;
      try {
        const tx = this.db.transaction('downloads', 'readwrite');
        const store = tx.objectStore('downloads');
        store.put({
          key: k,
          pid: normalizePeerId(pid),
          mid: String(mid),
          t: Date.now(),
          n: String(meta.n || ''),
          s: Number(meta.size || 0)
        });
      } catch (err) {
        debug('recordDownload IDB err:', err);
      }
    },
    async clearVault() {
      S.downloadedVaultKeys.clear();
      S.dlSession.clear();
      if (!this.db) return;
      try {
        const tx = this.db.transaction('downloads', 'readwrite');
        tx.objectStore('downloads').clear();
      } catch (_) {}
    }
  };

  /* ─── PROTECTED CONTENT & TEXT UNBLOCKER ─── */
  function enableProtectedContentUnblocker() {
    const unblockStyle = document.createElement('style');
    unblockStyle.id = 'tf5-unblock-css';
    unblockStyle.textContent = `
      .bubble, .Message, .message-content, .text-content, .media-viewer-aspecter, .chat_inner, .messages-layout, .bubbles {
        user-select: text !important;
        -webkit-user-select: text !important;
      }
      .bubble.is-message, .Message.message-list-item {
        pointer-events: auto !important;
      }
    `;
    (document.head || document.documentElement).appendChild(unblockStyle);

    // Bypass copy & text selection restrictions in protected chats (Zero contextmenu tampering)
    const bypassEvents = ['copy', 'selectstart'];
    bypassEvents.forEach(evtName => {
      window.addEventListener(evtName, ev => {
        const target = ev.target;
        if (target?.closest?.('.Message, .bubble, .media-viewer-whole, #MediaViewer, .media-viewer-aspecter')) {
          ev.stopImmediatePropagation?.();
          return true;
        }
      }, true);
    });
  }

  /* ─── GLOBAL STATE ─────────────── */
  const S = {
    fActive: new Set(),
    isScrolling: false,
    scrollTimer: 0,
    panel: null,
    panelRefs: null,
    panelHideTimer: 0,
    panelDismissed: false,
    panelCancel: false,
    panelPaused: false,
    lastFailedTargets: [],
    lastBatch: null,
    batchRunning: false,
    zipMode: false,
    smartNaming: true,
    saveCaptions: true,
    dlPill: null,
    bmPill: null,
    zipPill: null,
    harvestPill: null,
    bar: null,
    col: null,
    bubbles: null,
    mediaObserver: null,
    scrollCleanup: null,
    mediaCat: new WeakMap(),
    mediaMid: new WeakMap(),
    mediaCount: 0,
    catCounts: { text: 0, photo: 0, video: 0, other: 0, viral: 0 },
    mediaUpdateFrame: 0,
    mediaRecheckFrame: 0,
    mediaDirtyDuringScroll: false,
    dialogClose: null,
    history: [],
    bookmarks: [],
    bmKeys: new Set(),
    chatFilters: new Map(),
    mediaIndex: new Map(), // peerId -> Map(mid -> cat)
    dlSession: new Set(),
    downloadedVaultKeys: new Set(),
    errors: [],
    fActivePeer: null,
  };

  /* ─── FEEDBACK & ERRORS ────────── */
  const controlPulseTimers = new WeakMap();
  function pulseControl(el, tone = 'accent') {
    if (!el?.isConnected) return;
    el.dataset.tf3PulseTone = tone;
    el.classList.add('tf3-action-pulse');
    clearTimeout(controlPulseTimers.get(el));
    controlPulseTimers.set(el, setTimeout(() => { if (el.isConnected) { el.classList.remove('tf3-action-pulse'); delete el.dataset.tf3PulseTone; } }, UI.ackMs));
    if (prefersReducedMotion() || typeof el.animate !== 'function') return;
    const glow = tone === 'danger' ? 'rgba(255,59,48,.42)' : tone === 'ok' ? 'rgba(52,199,89,.42)' : 'rgba(51,144,236,.42)';
    el.animate([{ transform:'scale(1)', boxShadow:'none' },{ transform:'scale(.92)', boxShadow:`0 0 0 4px ${glow}` },{ transform:'scale(1.04)' },{ transform:'scale(1)', boxShadow:'none' }], { duration:UI.ackMs, easing:'cubic-bezier(.2,.8,.2,1)' });
  }

  let actionAck = null, actionAckTimer = 0;
  function showActionAck(text, anchor, tone = 'ok') {
    clearTimeout(actionAckTimer);
    if (!actionAck) {
      actionAck = document.createElement('div'); actionAck.id = 'tf3-action-ack'; document.body.appendChild(actionAck);
    }
    actionAck.textContent = text; actionAck.dataset.tone = tone;
    const r = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    actionAck.style.left = `${Math.max(8, Math.min(innerWidth - 180, r ? r.left + r.width / 2 - 70 : innerWidth / 2 - 70))}px`;
    actionAck.style.top = `${Math.max(8, r ? r.top - 36 : 24)}px`;
    actionAck.hidden = false;
    actionAck.getAnimations?.().forEach(a => a.cancel());
    if (!prefersReducedMotion()) actionAck.animate([{opacity:0,transform:'translateY(5px) scale(.96)'},{opacity:1,transform:'translateY(0) scale(1)'},{opacity:1},{opacity:0,transform:'translateY(-4px)'}],{duration:UI.ackToastMs,easing:'ease-out'});
    actionAckTimer = setTimeout(() => { if (actionAck) actionAck.hidden = true; }, UI.ackToastMs);
  }

  function handleControlFeedback(ev) {
    const btn = ev.target.closest?.('button,.tf3-ctx-action');
    if (!btn) return;
    pulseControl(btn, btn.classList.contains('tf3-btn-danger') || btn.classList.contains('cc') ? 'danger' : 'accent');
  }

  function recordError(label, err, mid = '') {
    S.errors.unshift({
      t: Date.now(), mid: String(mid || ''),
      label: String(label || 'Download').slice(0, 140),
      error: String(err?.message || err || 'Unknown error').slice(0, 220),
    });
    S.errors = S.errors.slice(0, LIMITS.errors);
  }

  /* ─── SINGLE DOWNLOAD ENGINE ─── */
  async function dlSingleShot(msg) {
    const media = getMedia(msg);
    if (!TG.hasDownloadManager() || !media) return false;
    if (S.panelCancel) return false;
    try {
      await TG.downloadMedia(media);
      return !S.panelCancel;
    } catch (err) {
      if (!S.panelCancel) {
        recordError(msg?.media?.document?.file_name || ('Message #' + msg.id), err, msg.id);
        console.warn('[TF5] Download failed for msg #' + msg.id + ':', err?.message || err);
      }
      return false;
    }
  }

  // ponytail: 128 MiB ZIP payload, not total browser RAM; use native DL for larger jobs.
  const ZIP_PAYLOAD_LIMIT = 128 * 1024 * 1024;

  async function getMediaBytes(msg, remaining = ZIP_PAYLOAD_LIMIT) {
    if (S.panelCancel) return null;
    const media = getMedia(msg), dm = W.appDownloadManager;
    if (!media || typeof dm?.downloadMedia !== 'function') throw new Error('ZIP Blob API unavailable; use native DL');
    const thumb = media._ === 'photo' ? media.sizes?.filter(s => s._ === 'photoSize' || s._ === 'photoSizeProgressive').slice(-1)[0] : undefined;
    const declared = Number(thumb ? (thumb.size || thumb.sizes?.slice(-1)[0]) : media.size);
    if (!Number.isSafeInteger(declared) || declared <= 0) throw new Error('ZIP media size unknown; use native DL');
    if (declared > remaining) throw new Error('ZIP payload limit reached; use a smaller batch or native DL');
    const blob = await dm.downloadMedia({ media, ...(thumb ? { thumb } : {}) }, 'blob');
    if (S.panelCancel) return null;
    if (!blob || typeof blob.arrayBuffer !== 'function' || !Number.isSafeInteger(blob.size) || blob.size <= 0) throw new Error('ZIP API returned no Blob');
    if (blob.size > remaining) throw new Error('ZIP payload limit reached');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return S.panelCancel ? null : bytes;
  }

  /* ─── STORAGE SYSTEM ───────────── */
  const FILTER_MEM_KEY = 'tf3_chat_filters';

  function rebuildBookmarkKeys() {
    S.bmKeys.clear();
    for (const b of S.bookmarks) {
      const pid = normalizePeerId(b?.peerId);
      const mid = String(b?.mid ?? '');
      if (pid && mid) S.bmKeys.add(mediaKey(pid, mid));
    }
  }

  function loadStorage() {
    try {
      const d = JSON.parse(localStorage.getItem('tf3'));
      if (d) {
        if (Array.isArray(d.history)) S.history = d.history.slice(0, LIMITS.history);
        if (Array.isArray(d.bookmarks)) {
          S.bookmarks = d.bookmarks.slice(0, LIMITS.bookmarks);
          rebuildBookmarkKeys();
        }
        if (typeof d.zipMode === 'boolean') S.zipMode = d.zipMode;
        if (typeof d.smartNaming === 'boolean') S.smartNaming = d.smartNaming;
        if (typeof d.saveCaptions === 'boolean') S.saveCaptions = d.saveCaptions;
      }
      try {
        const fm = JSON.parse(localStorage.getItem(FILTER_MEM_KEY));
        if (fm && typeof fm === 'object') for (const [k, v] of Object.entries(fm).slice(-LIMITS.filterChats)) {
          if (Array.isArray(v)) S.chatFilters.set(k, new Set(v));
        }
      } catch (e) { console.warn('[TF5] filter memory unreadable:', e); }
    } catch (e) { console.warn('[TF5] main store unreadable:', e); }
  }

  function saveChatFilters() {
    try {
      const obj = {};
      for (const [pid, set] of Array.from(S.chatFilters.entries()).filter(([, set]) => set.size).slice(-LIMITS.filterChats)) {
        obj[pid] = Array.from(set);
      }
      localStorage.setItem(FILTER_MEM_KEY, JSON.stringify(obj));
    } catch (e) { console.warn('[TF5] save filters failed:', e); }
  }

  function saveStorage() {
    try {
      localStorage.setItem('tf3', JSON.stringify({
        history: S.history.slice(0, LIMITS.history),
        bookmarks: S.bookmarks.slice(0, LIMITS.bookmarks),
        zipMode: S.zipMode,
        smartNaming: S.smartNaming,
        saveCaptions: S.saveCaptions,
      }));
    } catch (e) { console.warn('[TF5] save storage failed:', e); }
  }

  /* ─── CATEGORY & MEDIA SELECTORS ───────────── */
  const FILTERS = [
    { key: 'text',  label: 'Text',    ico: 'ea87' },
    { key: 'photo', label: 'Photos',  ico: 'e9c3' },
    { key: 'video', label: 'Videos',  ico: 'e9b5' },
    { key: 'other', label: 'Files',   ico: 'e979' },
    { key: 'viral', label: 'Viral',   ico: 'ea84' },
  ];

  const MEDIA_BUBBLE_SELECTOR_OLD = [
    '.bubble.photo',
    '.bubble.video',
    '.bubble.round-video',
    '.bubble.gif',
    '.bubble.audio',
    '.bubble.voice-message',
    '.bubble.document',
    '.bubble.document-container',
    '.bubble.sticker',
    '.bubble.grouped-item',
  ].join(',');

  let isNewWebKDOM = false;

  function getMessageReactionCount(bubble, msg = null) {
    if (msg?.reactions?.results?.length) {
      return msg.reactions.results.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
    }
    if (!bubble || bubble.nodeType !== Node.ELEMENT_NODE) return 0;
    const reactionItems = bubble.querySelectorAll('.reaction-item, .reaction-button, .reaction, .reactions-item');
    if (reactionItems.length) {
      let count = 0;
      reactionItems.forEach(item => {
        const num = parseInt(item.textContent?.replace(/[^\d]/g, '') || '1', 10);
        count += Number.isFinite(num) ? num : 1;
      });
      return count;
    }
    const container = bubble.querySelector('.reactions, .bubble-reactions, .reactions-container');
    if (container) {
      const nums = container.textContent?.match(/\d+/g);
      if (nums) return nums.reduce((s, n) => s + parseInt(n, 10), 0);
      return 1;
    }
    return 0;
  }

  function getBubbleCategory(bubble) {
    if (!bubble || bubble.nodeType !== Node.ELEMENT_NODE) return null;
    if (isNewWebKDOM) {
      const content = bubble.querySelector('.message-content') || bubble;
      if (content.classList.contains('media') || bubble.classList.contains('is-album')) {
        return bubble.querySelector('video') ? 'video' : 'photo';
      }
      if (content.classList.contains('audio') || content.classList.contains('voice') ||
          content.classList.contains('document') || content.classList.contains('custom-shape')) {
        return 'other';
      }
      if (bubble.classList.contains('message-list-item')) return 'text';
    } else {
      if (bubble.matches('.bubble.photo, .bubble.grouped-item')) return 'photo';
      if (bubble.matches('.bubble.video, .bubble.round-video, .bubble.gif')) return 'video';
      if (bubble.matches('.bubble.audio, .bubble.voice-message, .bubble.document, .bubble.document-container, .bubble.sticker')) return 'other';
      if (bubble.matches('.bubble.is-message')) return 'text';
    }
    return null;
  }

  function isMediaBubble(bubble) {
    if (!bubble?.classList) return false;
    if (isNewWebKDOM) {
      if (!bubble.classList.contains('Message')) return false;
      if (bubble.classList.contains('is-album')) return Boolean(bubble.querySelector('img, video'));
      const content = bubble.querySelector('.message-content');
      return Boolean(content && (
        content.classList.contains('media') || content.classList.contains('audio') ||
        content.classList.contains('voice') || content.classList.contains('document') ||
        content.classList.contains('custom-shape')
      ));
    }
    if (!bubble.classList.contains('bubble')) return false;
    return bubble.matches(MEDIA_BUBBLE_SELECTOR_OLD);
  }

  function getMidFromBubble(bubble) {
    if (!bubble) return null;
    return bubble.dataset?.messageId || bubble.dataset?.mid || bubble.dataset?.msgId || bubble.id?.match(/\d+/)?.[0];
  }

  function findBubbleByMid(mid) {
    if (!S.bubbles || !mid) return null;
    const sMid = String(mid);
    let el = S.bubbles.querySelector(`[data-message-id="${sMid}"],[data-mid="${sMid}"],[data-msg-id="${sMid}"]`);
    if (el) return el;
    el = S.bubbles.querySelector(`#message-${sMid}, #message${sMid}, #msg-${sMid}, #msg${sMid}, [id$="-${sMid}"]`);
    if (el) return el;
    const items = S.bubbles.querySelectorAll('.Message, .bubble');
    for (let i = 0; i < items.length; i++) {
      if (getMidFromBubble(items[i]) === sMid) return items[i];
    }
    return null;
  }

  function metaFromMsg(msg, chatTitle = '', ctx = locatorContext()) {
    const doc = msg?.media?.document;
    const mime = String(doc?.mime_type || '');
    return {
      n: doc?.file_name || (msg?.media?.photo ? 'photo_' + msg.id : ''),
      t: msg?.media?.photo ? 'photo'
        : (doc?.type === 'video' || mime.startsWith('video')) ? 'video'
        : (doc?.type === 'voice' || mime.startsWith('audio')) ? 'voice'
        : doc ? 'file' : '',
      c: chatTitle || getActiveChatTitle(),
      x: String(msg?.message || '').slice(0, 600),
      md: Number(msg?.date) || 0,
      h: ctx?.threadId == null ? null : Number(ctx.threadId),
      mh: ctx?.monoforumThreadId == null ? null : Number(ctx.monoforumThreadId),
    };
  }

  async function dlSingle(peerId, mid) {
    if (!mid || S.batchRunning) return false;
    const pid = normalizePeerId(peerId || currentPeerId());
    try {
      const msg = await lookupMsg(pid, mid);
      if (!msg || S.batchRunning) return false;
      S.panelCancel = false;
      if (!await dlSingleShot(msg)) return false;
      await TelefilterVault.recordDownload(pid, mid, metaFromMsg(msg));
      return true;
    } catch (err) {
      recordError('Library download', err, mid);
      return false;
    }
  }

  /* ─── LAZY-LOAD REFRESH ─── */
  function forceRefreshLazyMedia() {
    if (!S.bubbles) return;
    const scrollTarget = S.bubbles.closest('.scrollable-y') ||
                         S.bubbles.closest('.scrollable') ||
                         S.bubbles.parentElement ||
                         S.bubbles;

    const dispatch = () => {
      try { scrollTarget.dispatchEvent(new Event('scroll', { bubbles: true })); } catch (_) {}
    };

    dispatch();
    requestAnimationFrame(() => {
      dispatch();
      setTimeout(dispatch, 80);
      setTimeout(dispatch, 250);
    });
  }

  /* ─── ACTION BUTTON & BATCH DOWNLOAD ENGINE ─── */
  function renderActionButtons() {
    const dlBtn = S.dlPill;
    if (!dlBtn) return;
    dlBtn.style.display = 'inline-flex';
    dlBtn.classList.toggle('is-running', S.batchRunning);
    dlBtn.disabled = S.batchRunning;
    const modeLabel = S.zipMode ? 'ZIP Download' : 'Download';
    dlBtn.querySelector('.tf3-dl-label').textContent = S.batchRunning ? 'Downloading...' : modeLabel;

    if (S.zipPill) {
      S.zipPill.setAttribute('aria-pressed', String(S.zipMode));
      S.zipPill.textContent = S.zipMode ? 'Bundle as ZIP: On' : 'Bundle as ZIP: Off';
      S.zipPill.classList.toggle('active', S.zipMode);
    }
  }

  async function downloadTargets(targets, label, peerId = currentPeerId(), chatTitle = getActiveChatTitle(), ctx = locatorContext()) {
    if (!targets.length || S.batchRunning) return { ok: 0, total: targets.length };
    const batchPeerId = normalizePeerId(peerId);
    const batchChatTitle = chatTitle || getActiveChatTitle();
    const batchLocatorContext = { threadId: ctx?.threadId ?? null, monoforumThreadId: ctx?.monoforumThreadId ?? null };

    if (!TG.hasDownloadManager()) {
      pnlUpd(0, targets.length, 'Telegram download manager unavailable');
      S.panelRefs.label.textContent = '❌ Unavailable';
      S.panelRefs.status.textContent = 'Reload Telegram (F5) and try again';
      S.panelRefs.cancel.style.display = 'none';
      S.panelRefs.pause.style.display = 'none';
      S.panelRefs.retry.style.display = 'none';
      schedulePanelHide(4000);
      return { ok: 0, total: targets.length };
    }

    S.batchRunning = true;
    renderActionButtons();
    S.panelDismissed = false;
    clearTimeout(S.panelHideTimer);
    S.panelCancel = false;
    S.panelPaused = false;
    S.lastFailedTargets = [];
    S.lastBatch = { peerId: batchPeerId, chatTitle: batchChatTitle, ctx: batchLocatorContext };
    pnlUpd(0, targets.length, label || 'Preparing...');
    S.panelRefs.pause.textContent = 'Ⅱ';
    S.panelRefs.pause.title = 'Pause queue';
    S.panelRefs.cancel.onclick = () => {
      S.panelCancel = true;
      if (S.panelRefs) {
        S.panelRefs.label.textContent = '⏹ Cancelled';
        S.panelRefs.filename.textContent = 'Stopping after current file...';
        S.panelRefs.cancel.style.display = 'none';
      }
    };
    S.panelRefs.pause.onclick = () => {
      S.panelPaused = !S.panelPaused;
      S.panelRefs.pause.textContent = S.panelPaused ? '▶' : 'Ⅱ';
      S.panelRefs.pause.title = S.panelPaused ? 'Resume queue' : 'Pause queue';
      S.panelRefs.status.textContent = S.panelPaused ? 'Paused' : 'Resuming…';
    };

    let ok = 0;
    const zipMode = S.zipMode, smartNaming = S.smartNaming, saveCaptions = S.saveCaptions;
    const zipFiles = [], zipMessages = [];
    let zipBytes = 0;

    try {
      if (zipMode) {
        S.panelRefs.status.textContent = 'Resolving album media...';
        targets = await expandZipAlbums(targets, batchPeerId);
      }
      for (let i = 0; i < targets.length && !S.panelCancel; i++) {
        while (S.panelPaused && !S.panelCancel) await sleep(120);
        if (S.panelCancel) break;
        const msg = targets[i];
        const doc = msg.media?.document;
        const ext = ({ 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' })[doc?.mime_type] || '.bin';
        const origName = doc?.file_name || doc?.attributes?.find(a => a._ === 'documentAttributeFilename')?.file_name ||
                     (msg.media?.photo ? 'photo_' + msg.id + '.jpg' : 'media_' + msg.id + ext);
        const smartName = smartNaming ? formatSmartFileName(msg, origName, batchChatTitle) : origName;

        pnlUpd(i, targets.length, smartName);

        if (zipMode) {
          const caption = saveCaptions && msg.message ? new TextEncoder().encode(msg.message) : null;
          const bytes = await getMediaBytes(msg, ZIP_PAYLOAD_LIMIT - zipBytes - (caption?.length || 0));
          if (S.panelCancel) break;
          if (!bytes?.length) throw new Error('ZIP media bytes unavailable');
          zipBytes += bytes.length + (caption?.length || 0);
          if (zipBytes > ZIP_PAYLOAD_LIMIT) throw new Error('ZIP payload limit reached');
          // Message ID + batch index keeps duplicate original filenames distinct.
          const entryName = `${msg.id}_${i + 1}_${sanitizeFileName(smartName, 'media')}`;
          zipFiles.push({ name: entryName, data: bytes });
          if (caption) zipFiles.push({ name: entryName + '.txt', data: caption });
          zipMessages.push(msg);
        } else {
          // Standard native direct download
          const success = await dlSingleShot(msg);
          if (success) {
            ok++;
            TelefilterVault.recordDownload(batchPeerId, msg.id, metaFromMsg(msg, batchChatTitle));
          } else if (!S.panelCancel) {
            S.lastFailedTargets.push(msg);
          }
        }

        pnlUpd(i + 1, targets.length, smartName);

        if (i + 1 < targets.length && !S.panelCancel) {
          const isLarge = Boolean(msg.media?.document || msg.media?.video);
          await sleep(isLarge ? 200 : 50);
        }
      }

      // Finish ZIP bundle if active and files were collected
      if (zipMode && zipFiles.length > 0 && !S.panelCancel) {
        S.panelRefs.status.textContent = 'Building ZIP archive...';
        // ponytail: live-path diagnostics; remove once the album path is verified on Telegram.
        console.info('[TF5 ZIP build]', { entries: zipFiles.length, bytes: zipBytes });
        console.trace('[TF5 ZIP build path]');
        const zipBlob = createStoredZip(zipFiles);
        const pad = n => String(n).padStart(2, '0');
        const now = new Date();
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const zipName = `${sanitizeFileName(batchChatTitle, 'telefilter')}_${stamp}_${zipFiles.length}items.zip`;

        const a = document.createElement('a');
        a.href = URL.createObjectURL(zipBlob);
        a.download = zipName;
        document.body.appendChild(a);
        try { a.click(); }
        finally { a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); }
        // ponytail: browser handoff only; disk completion needs browser download APIs.
        for (const msg of zipMessages) {
          await TelefilterVault.recordDownload(batchPeerId, msg.mid ?? msg.id, metaFromMsg(msg, batchChatTitle));
          ok++;
        }
      }

      addHistory(ok, targets.length, batchChatTitle);

      if (!S.panelCancel) {
        pnlDone(ok, targets.length);
      } else {
        S.panelRefs.label.textContent = `Cancelled · ${ok}/${targets.length}`;
        S.panelRefs.cancel.style.display = 'none';
        S.panelRefs.pause.style.display = 'none';
        S.panelRefs.retry.style.display = 'none';
        schedulePanelHide(2500);
      }
    } catch (err) {
      recordError('Download batch', err);
      S.panelRefs.status.textContent = 'Batch failed: ' + String(err?.message || err);
      S.panelRefs.label.textContent = `${ok}/${targets.length} handed to browser`;
      S.panelRefs.cancel.style.display = 'none';
      S.panelRefs.pause.style.display = 'none';
    } finally {
      S.batchRunning = false;
      renderActionButtons();
    }
    return { ok, total: targets.length };
  }

  async function expandZipAlbums(targets, peerId) {
    const out = new Map(), groups = new Set();
    const manager = TG.im()?.chat?.managers?.appMessagesManager;
    const summarize = rows => ({
      total: rows.length,
      photos: rows.filter(m => m.media?.photo).length,
      videos: rows.filter(m => m.media?.document?.mime_type?.startsWith('video/')).length
    });
    for (const seed of targets) {
      if (S.panelCancel) break;
      const group = seed.grouped_id == null ? '' : String(seed.grouped_id);
      if (group && groups.has(group)) continue;
      let members = [seed];
      if (group) {
        if (typeof manager?.getMessagesByGroupedId !== 'function') {
          // ponytail: diagnostics for the live-build path; drop once verified on Telegram.
          console.warn('[TF5 album-diag]', 'Album API unavailable', { im: typeof TG.im(), chat: !!TG.im()?.chat, hasManagers: !!manager });
          throw new Error('Album API unavailable; no partial ZIP saved');
        }
        members = await manager.getMessagesByGroupedId(seed.grouped_id);
        if (!Array.isArray(members) || members.length < 2 || !members.some(m => (m?.mid ?? m?.id) === (seed.mid ?? seed.id))) {
          console.warn('[TF5 album-diag]', 'Album members unavailable', { managerFound: !!manager, returned: Array.isArray(members) ? members.length : typeof members });
          throw new Error('Album members unavailable; reopen the post and retry');
        }
        groups.add(group);
      }
      for (const msg of members) {
        const mid = msg?.mid ?? msg?.id;
        if (!msg || (msg.peerId != null && normalizePeerId(msg.peerId) !== peerId) ||
            (group && String(msg.grouped_id) !== group) || !Number.isSafeInteger(Number(mid)) || Number(mid) <= 0 || !getMedia(msg)) {
          throw new Error('Invalid album member; no partial ZIP saved');
        }
        out.set(String(mid), msg);
      }
      // Counts only: no captions, media URLs, or account identifiers in diagnostics.
      if (group) console.info('[TF5 ZIP album]', { parsed: summarize(members), uniqueSoFar: out.size });
    }
    const result = [...out.values()];
    console.info('[TF5 ZIP targets]', { before: summarize(targets), after: summarize(result) });
    return result;
  }

  async function runCategoryJob(catKey, pillEl) {
    if (S.batchRunning || !TG.hasDownloadManager()) return;
    const pid = currentPeerId();
    const idx = pid != null ? S.mediaIndex.get(normalizePeerId(pid)) : null;
    let mids;
    if (idx && catKey !== 'text') {
      mids = Array.from(idx)
        .filter(m => (catKey === 'viral' ? true : m[1] === catKey) && !TelefilterVault.hasDownloaded(pid, m[0]))
        .map(m => m[0]);
    } else {
      mids = [];
    }
    if (!mids.length) {
      showActionAck('No new media in this category', pillEl, 'accent');
      return;
    }

    const cnt = pillEl?.querySelector('.tf3-cat-count');
    try {
      pillEl?.classList.add('is-running');
      const resolved = await resolveIndexedMessages(pid, mids.map(mid => [mid, catKey]));
      let msgs = resolved.map(row => row.msg);
      if (catKey === 'viral') {
        msgs = msgs.filter(m => getMessageReactionCount(null, m) > 0);
      }
      if (!msgs.length) {
        showActionAck('No media found', pillEl, 'accent');
        return;
      }

      const res = await downloadTargets(msgs, `${catKey} batch · ${msgs.length} items`, pid);
      if (cnt && cnt.isConnected) {
        const done = res.ok === res.total ? ' ✓' : ` (${res.ok}/${res.total})`;
        cnt.textContent = '⤓' + done;
      }
    } catch (error) {
      console.warn('[TF5] category batch fail:', error?.message || error);
    } finally {
      pillEl?.classList.remove('is-running');
      queueBadgeUpdate();
    }
  }

  async function resolveIndexedMessages(pid, mids) {
    const out = [];
    const CHUNK = 24;
    for (let i = 0; i < mids.length; i += CHUNK) {
      const part = mids.slice(i, i + CHUNK);
      const rows = await Promise.all(part.map(async ([mid, cat]) => {
        try {
          const msg = await lookupMsg(pid, mid);
          return msg && getMedia(msg) ? { msg, cat, mid: String(mid) } : null;
        } catch (_) { return null; }
      }));
      out.push(...rows.filter(Boolean));
      await sleep(0);
    }
    return out;
  }

  async function getNativeSelectedMessages() {
    const selection = TG.selection();
    if (!selection?.isSelecting) return [];
    if (typeof selection.getSelectedMessages === 'function') {
      const rows = await selection.getSelectedMessages();
      return Array.isArray(rows) ? rows.filter(Boolean).map(msg => ({ peerId: messagePeerId(msg), msg })) : [];
    }
    const selected = selection.selectedMids;
    if (!selected || typeof selected[Symbol.iterator] !== 'function') return [];
    const out = [];
    for (const [peerId, mids] of selected) {
      const pid = normalizePeerId(peerId);
      const rows = await Promise.all(Array.from(mids || []).map(mid => lookupMsg(pid, mid)));
      out.push(...rows.filter(Boolean).map(msg => ({ peerId: pid, msg })));
    }
    return out;
  }

  const selectionPeerIds = rows => [...new Set((rows || []).map(row => normalizePeerId(row?.peerId)).filter(Boolean))];

  async function downloadNativeSelection(e) {
    e?.stopPropagation();
    const anchor = S.dlPill;
    if (S.batchRunning) {
      showActionAck('Download already running', anchor, 'accent');
      return;
    }
    const selection = TG.selection();
    if (!selection?.isSelecting) {
      showActionAck('Select messages first', anchor, 'accent');
      return;
    }
    try {
      const selected = (await getNativeSelectedMessages()).filter(row => Boolean(getMedia(row.msg)));
      if (!selected.length) {
        showActionAck('No media selected', anchor, 'accent');
        return;
      }
      const peers = selectionPeerIds(selected);
      if (peers.length !== 1) {
        const err = new Error(`Native selection spans ${peers.length || 0} peer contexts`);
        recordError('Read Telegram selection', err);
        showActionAck('Select media from one chat only', anchor, 'danger');
        return;
      }
      const peerId = peers[0];
      const targets = selected.map(row => row.msg);
      const samePeer = peerId === normalizePeerId(currentPeerId());
      showActionAck(`Downloading ${targets.length}`, anchor, 'ok');
      await downloadTargets(targets, `Selected - ${targets.length} items`, peerId,
        samePeer ? getActiveChatTitle() : '', samePeer ? locatorContext() : {});
    } catch (err) {
      recordError('Read Telegram selection', err);
      showActionAck('Could not read selection', anchor, 'danger');
    }
  }

  /* ─── DEEP HARVESTER (DOM Virtualization Scraper) ─── */
  let isHarvesting = false;
  let harvestStopRequested = false;

  async function runDeepHarvester(targetCount = 250, onProgress = null) {
    if (isHarvesting || !S.bubbles) return 0;
    const bubbles = S.bubbles, pid = normalizePeerId(currentPeerId()), ctx = locatorContext();
    const valid = () => bubbles.isConnected && S.bubbles === bubbles && sameLocatorContext(pid, ctx);
    if (!pid || !valid()) return 0;
    isHarvesting = true;
    harvestStopRequested = false;
    const pill = S.harvestPill;
    const scrollContainer = bubbles.closest('.scrollable-y') || bubbles.closest('.scrollable') || bubbles.parentElement || bubbles;
    const seen = new Set(S.mediaIndex.get(pid)?.keys() || []);
    let gained = 0, stagnantSteps = 0;
    const started = Date.now();
    const report = () => onProgress?.(gained, targetCount, Math.floor((Date.now() - started) / 1000));
    if (pill) { pill.classList.add('is-running'); pill.textContent = '⏹ Stop'; }
    try {
      report();
      // ponytail: bounded DOM discovery, not proof that server history is exhausted.
      while (!harvestStopRequested && valid() && gained < targetCount && stagnantSteps < 10 && Date.now() - started < 120000) {
        const before = gained, top = scrollContainer.scrollTop;
        scrollContainer.scrollTop = Math.max(0, top - 800);
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(350);
        if (harvestStopRequested || !valid()) break;
        resyncMediaCounters(bubbles);
        for (const mid of S.mediaIndex.get(pid)?.keys() || []) {
          if (!seen.has(mid)) { seen.add(mid); gained++; }
        }
        stagnantSteps = gained === before && scrollContainer.scrollTop === top ? stagnantSteps + 1 : 0;
        report();
      }
    } finally {
      isHarvesting = false;
      if (pill) { pill.classList.remove('is-running'); pill.textContent = 'Harvest history'; }
      if (valid()) { forceRefreshLazyMedia(); queueBadgeUpdate(); }
    }
    return gained;
  }

  function toggleDeepHarvester(e) {
    e?.stopPropagation();
    if (isHarvesting) {
      harvestStopRequested = true;
      showActionAck('Harvest stopped', S.harvestPill, 'accent');
      return;
    }
    showActionAck('Harvesting history...', S.harvestPill, 'ok');
    const anchor = S.harvestPill;
    runDeepHarvester(300, (cur, total, seconds) => {
      if (anchor) anchor.textContent = `Stop · ${cur}/${total} · ${seconds}s`;
    }).then(gained => {
      showActionAck(`Indexed +${gained} items`, anchor, 'ok');
    }).catch(err => { recordError('Harvest', err); showActionAck('Harvest failed', anchor, 'danger'); });
  }

  /* ─── MEDIAVIEWER & STORY ACTION OVERLAY ─── */
  function findActiveMediaViewerSlide() {
    const slide = document.querySelector('#MediaViewer .MediaViewerSlide--active, .media-viewer-whole .media-viewer-mover.active') ||
                  document.querySelector('.media-viewer-whole') ||
                  document.querySelector('#StoryViewer, #stories-viewer');
    return slide;
  }

  function getActiveMediaViewerInfo() {
    const mv = document.querySelector('.media-viewer-whole, #MediaViewer');
    if (!mv) return null;
    const authorEl = mv.querySelector('.media-viewer-author [data-peer-id], .SenderInfo .Avatar[data-peer-id]');
    const pid = authorEl?.getAttribute('data-peer-id') || currentPeerId();
    const aspecter = mv.querySelector('.media-viewer-aspecter, .MediaViewerContent');
    const v = aspecter?.querySelector('video');
    const img = aspecter?.querySelector('img.thumbnail, img');
    return {
      pid: normalizePeerId(pid),
      url: v?.src || img?.src || '',
      type: v ? 'video' : 'photo',
      title: mv.querySelector('.peer-title, .title')?.textContent?.trim() || getActiveChatTitle(),
    };
  }

  async function triggerMediaViewerDownload() {
    const anchor = document.getElementById('tf5-mv-dl');
    try {
      const info = getActiveMediaViewerInfo();
      if (!info?.url) {
        showActionAck('No media detected', anchor, 'danger');
        return;
      }
      showActionAck('Downloading...', anchor, 'ok');
      const res = await fetch(info.url);
      const blob = await res.blob();
      const pad = n => String(n).padStart(2, '0');
      const d = new Date();
      const ext = info.type === 'video' ? '.mp4' : '.jpg';
      const fileName = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${sanitizeFileName(info.title)}_${Date.now()}${ext}`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      showActionAck('Saved ✓', anchor, 'ok');
    } catch (err) {
      showActionAck('Download failed', anchor, 'danger');
      recordError('MediaViewer DL', err);
    }
  }

  function triggerMediaViewerBookmark() {
    const anchor = document.getElementById('tf5-mv-bm');
    const viewer = W.appMediaViewer, target = viewer?.target, context = viewer?.searchContext;
    const pid = Number(target?.peerId), mid = Number(target?.mid);
    // Avatar/local/scheduled viewers do not have a normal chat locator.
    if (!context || context.isScheduled || !Number.isSafeInteger(pid) || !pid ||
        !Number.isSafeInteger(mid) || mid <= 0 || mid === Number.MAX_SAFE_INTEGER) {
      showActionAck('Bookmark from the message menu instead', anchor, 'accent');
      return;
    }
    const ctx = { threadId: context.threadId ?? null, monoforumThreadId: context.monoforumThreadId ?? null };
    return addBookmark(normalizePeerId(pid), mid, target.message?.message || '', ctx, `Chat ${pid}`)
      .then(added => showActionAck(added ? 'Bookmarked ✓' : 'Bookmark removed', anchor, 'ok'))
      .catch(err => { recordError('Viewer bookmark', err); showActionAck('Bookmark failed', anchor, 'danger'); });
  }

  function watchMediaViewer() {
    const checkOverlay = () => {
      const mv = document.querySelector('.media-viewer-whole, #MediaViewer');
      if (mv && !mv.querySelector('#tf5-mv-actions')) {
        const topbar = mv.querySelector('.media-viewer-topbar, .media-viewer-head, .topbar') || mv;
        const container = document.createElement('div');
        container.id = 'tf5-mv-actions';
        container.className = 'tf5-mv-actions';

        const dlBtn = document.createElement('button');
        dlBtn.id = 'tf5-mv-dl';
        dlBtn.type = 'button';
        dlBtn.className = 'tf3-btn tf3-btn-primary tf3-btn-sm';
        dlBtn.innerHTML = `${ico('e979').outerHTML} DL`;
        dlBtn.title = 'Quick Download (Shortcut: D)';
        dlBtn.onclick = ev => { ev.stopPropagation(); pulseControl(dlBtn); triggerMediaViewerDownload(); };

        const bmBtn = document.createElement('button');
        bmBtn.id = 'tf5-mv-bm';
        bmBtn.type = 'button';
        bmBtn.className = 'tf3-btn tf3-btn-sm';
        bmBtn.innerHTML = `${ico('ea8e').outerHTML} Save`;
        bmBtn.title = 'Bookmark (Shortcut: B)';
        bmBtn.onclick = ev => { ev.stopPropagation(); pulseControl(bmBtn); triggerMediaViewerBookmark(); };

        container.append(dlBtn, bmBtn);
        topbar.appendChild(container);
      }
    };

    const obs = new MutationObserver(checkOverlay);
    obs.observe(document.body, { childList: true, subtree: true });


  }

  /* ─── BOOKMARKS & LOCAL LIBRARY ─── */
  function getActiveChatTitle() {
    const titleEl = document.querySelector('.MiddleHeader .title, .chat-header .title, .sidebar-header .title');
    return titleEl?.textContent?.trim() || document.title?.slice(0, 60) || 'Active Chat';
  }

  async function enrichBookmark(b) {
    try {
      const pid = normalizePeerId(b.peerId || currentPeerId());
      const msg = await lookupMsg(pid, b.mid);
      if (!msg) return;
      if (msg.message) b.previewFull = String(msg.message).slice(0, 600);
      if (msg.media) Object.assign(b, metaFromMsg(msg, b.chat));
      if (msg.date) b.msgDate = Number(msg.date) || 0;
      b.peerId = pid;
      if (!b.label) b.label = b.n || b.previewFull || b.preview || `Message #${b.mid}`;
      b.label = String(b.label).slice(0, 160);
    } catch (e) { console.warn('[TF5] bookmark enrich skipped:', e); }
    saveStorage();
  }

  async function addBookmark(peerId, mid, previewText = '', ctx = locatorContext(), chatTitle = getActiveChatTitle()) {
    if (!mid) return;
    const pidKey = normalizePeerId(peerId || currentPeerId());
    const sMid = String(mid);
    const k = mediaKey(pidKey, sMid);
    const idx = S.bookmarks.findIndex(b => String(b.mid) === sMid && normalizePeerId(b.peerId) === pidKey);
    if (idx >= 0) {
      S.bookmarks.splice(idx, 1);
      S.bmKeys.delete(k);
    } else {
      const b = { mid: sMid, peerId: pidKey, createdAt: Date.now(),
        threadId: ctx.threadId == null ? null : Number(ctx.threadId),
        monoforumThreadId: ctx.monoforumThreadId == null ? null : Number(ctx.monoforumThreadId),
        tags: [],
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        preview: String(previewText || `Message #${sMid}`).slice(0, 240), chat: chatTitle };
      S.bookmarks.unshift(b);
      if (S.bookmarks.length > LIMITS.bookmarks) {
        const evicted = S.bookmarks.pop();
        if (evicted) {
          const epid = normalizePeerId(evicted.peerId), emid = String(evicted.mid ?? '');
          if (epid && emid) S.bmKeys.delete(mediaKey(epid, emid));
        }
      }
      S.bmKeys.add(k);
      enrichBookmark(b);
    }
    saveStorage(); updateBookmarkPill();
    return idx < 0;
  }

  function removeBookmark(peerId, mid) {
    const pid = normalizePeerId(peerId), sMid = String(mid || '');
    const before = S.bookmarks.length;
    S.bookmarks = S.bookmarks.filter(b => !(normalizePeerId(b.peerId) === pid && String(b.mid) === sMid));
    if (S.bookmarks.length !== before) {
      S.bmKeys.delete(mediaKey(pid, sMid));
      saveStorage(); updateBookmarkPill(); return true;
    }
    return false;
  }

  function setBookmarkTags(bookmark, raw) {
    if (!bookmark) return;
    bookmark.tags = [...new Set(String(raw || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
    saveStorage();
  }

  function updateBookmarkPill() {
    if (!S.bmPill) return;
    const pid = normalizePeerId(currentPeerId());
    const count = S.bookmarks.filter(b => normalizePeerId(b.peerId) === pid).length;
    const badge = S.bmPill.querySelector('.tf3-bm-count');
    if (badge) badge.textContent = count ? String(count) : '';
  }

  async function waitForBubble(mid, timeout = 7000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const el = findBubbleByMid(mid);
      if (el) return el;
      await sleep(100);
    }
    return null;
  }

  function requireRenderedTarget(el) {
    if (!el) throw new Error('Message did not render after navigation');
    return el;
  }

  function flashLocator(el) {
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('tf3-bookmark-flash');
    setTimeout(() => el.classList.remove('tf3-bookmark-flash'), 2400);
  }

  function makeLocatorOptions(peerId, mid, ctx = {}) {
    const targetPeer = Number(peerId);
    const targetMid = Number(mid);
    if (!Number.isFinite(targetPeer) || !targetPeer || !Number.isFinite(targetMid) || !targetMid) {
      throw new Error('Invalid Telegram peer/message id');
    }
    const options = { peerId: targetPeer, lastMsgId: targetMid };
    const threadId = Number(ctx?.threadId);
    const monoforumThreadId = Number(ctx?.monoforumThreadId);
    if (Number.isFinite(threadId) && threadId) options.threadId = threadId;
    if (Number.isFinite(monoforumThreadId) && monoforumThreadId) options.monoforumThreadId = monoforumThreadId;
    return options;
  }

  async function navigateToMessage(mid, peerId, ctx = {}) {
    const im = TG.im();
    if (!im) throw new Error('Telegram AppImManager unavailable');
    const options = makeLocatorOptions(peerId || currentPeerId(), mid, ctx);
    const samePeer = normalizePeerId(currentPeerId()) === normalizePeerId(options.peerId);
    const currentThread = Number(currentThreadId()) || 0;
    const targetThread = Number(options.threadId) || 0;
    const currentMono = Number(currentMonoforumThreadId()) || 0;
    const targetMono = Number(options.monoforumThreadId) || 0;
    const sameContext = samePeer && currentThread === targetThread && currentMono === targetMono;

    if (sameContext && typeof im.chat?.setMessageId === 'function') {
      await im.chat.setMessageId({ lastMsgId: options.lastMsgId });
      return;
    }
    if (typeof im.setInnerPeer === 'function') {
      await im.setInnerPeer(options);
      return;
    }
    if (typeof im.setPeer === 'function') {
      await im.setPeer(options);
      return;
    }
    if (sameContext && typeof im.chat?.jumpToMessage === 'function') {
      await im.chat.jumpToMessage(options.lastMsgId);
      return;
    }
    throw new Error('Telegram message navigation API unavailable');
  }

  async function jumpToLocator(mid, peerId, ctx = {}) {
    if (!mid) return false;
    const sMid = String(mid);
    const targetPid = normalizePeerId(peerId || currentPeerId());
    if (sameLocatorContext(targetPid, ctx)) {
      const local = findBubbleByMid(sMid);
      if (local) { flashLocator(local); return true; }
    }
    try {
      await navigateToMessage(sMid, targetPid, ctx);
      const el = requireRenderedTarget(await waitForBubble(sMid, 7000));
      flashLocator(el);
      return true;
    } catch (err) {
      recordError(`Jump #${sMid}`, err, sMid);
      console.warn('[TF5] locator jump failed:', err?.message || err);
      return false;
    }
  }

  function buildLibraryEntries() {
    const map = new Map();
    for (const b of S.bookmarks) {
      const pid = normalizePeerId(b.peerId), mid = String(b.mid || '');
      if (!pid || !mid) continue;
      const key = mediaKey(pid, mid);
      const row = map.get(key) || { key, pid, mid, meta: {} };
      row.bookmark = b;
      row.chat = b.chat || row.chat || '';
      row.label = b.label || b.n || b.previewFull || b.preview || row.label || `Message #${mid}`;
      row.text = b.previewFull || b.preview || row.text || '';
      row.type = b.t || b.cat || row.type || '';
      const bt = Number(b.createdAt) || 0, bm = Number(b.msgDate) || 0;
      row.when = bt || (bm ? (bm > 1e12 ? bm : bm * 1000) : (Number(row.when) || 0));
      row.threadId = b.threadId ?? row.threadId ?? null;
      row.monoforumThreadId = b.monoforumThreadId ?? row.monoforumThreadId ?? null;
      row.tags = Array.isArray(b.tags) ? b.tags : (row.tags || []);
      row.downloaded = TelefilterVault.hasDownloaded(pid, mid);
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.when - a.when);
  }

  function showLocatorLibrary(e) {
    e?.stopPropagation();
    let entries = buildLibraryEntries();
    const currentPid = normalizePeerId(currentPeerId());
    const overlay = document.createElement('div');
    overlay.id = 'tf3-overlay';
    overlay.innerHTML = `<div class="tf3-card tf3-library-card" role="dialog" aria-modal="true" aria-labelledby="tf3-library-title">
      <div class="tf3-sh">
        <div class="tf3-title-wrap"><span class="tf3-title-icon">&#128278;</span><span><strong id="tf3-library-title">Telefilter Workspace</strong><small>${S.bookmarks.length} bookmarks</small></span></div>
        <button type="button" class="tf3-sx" aria-label="Close">${ico('e95d').outerHTML}</button>
      </div>
      <div class="tf3-workspace-card"></div>
      <input type="search" class="tf3-search tf3-library-search" placeholder="Search... tag:work type:video chat:name mid:123" aria-label="Search Telefilter library">
      <div class="tf3-library-toolbar"><button class="tf3-mini-chip tf3-scope-chat">This chat</button></div>
      <div class="tf3-library-list"></div>
      <div class="tf3-dialog-actions"><span class="tf3-row-actions"><button type="button" class="tf3-btn tf3-export">Export...</button><button type="button" class="tf3-btn tf3-btn-danger tf3-clean-old">Clean old...</button></span><button type="button" class="tf3-btn tf3-btn-primary tf3-done">Done</button></div>
    </div>`;
    const list = overlay.querySelector('.tf3-library-list');
    const search = overlay.querySelector('.tf3-library-search');
    const workspace = overlay.querySelector('.tf3-workspace-card');
    const scopeBtn = overlay.querySelector('.tf3-scope-chat');
    let thisChatOnly = false;
    const close = mountDialog(overlay);
    overlay.querySelector('.tf3-done').onclick = close;

    const parseQuery = value => {
      const filters = { free: [] };
      const tokens = String(value || '').match(/(?:[a-z]+:)?"[^"]+"|\S+/gi) || [];
      for (let token of tokens) {
        token = token.replace(/^"|"$/g, '');
        const cut = token.indexOf(':');
        if (cut > 0) {
          const key = token.slice(0, cut).toLowerCase(), val = token.slice(cut + 1).replace(/^"|"$/g, '').toLowerCase();
          if (['tag','type','chat','mid'].includes(key) && val) { filters[key] = val; continue; }
        }
        filters.free.push(token.toLowerCase());
      }
      return filters;
    };

    const matchesQuery = (row, f) => {
      const tags = Array.isArray(row.tags) ? row.tags : [];
      if (f.tag && !tags.some(t => t.includes(f.tag))) return false;
      if (f.type && !String(row.type || 'message').toLowerCase().includes(f.type)) return false;
      if (f.chat && !String(row.chat || '').toLowerCase().includes(f.chat)) return false;
      if (f.mid && !String(row.mid).includes(f.mid)) return false;
      if (!f.free.length) return true;
      const hay = `${row.chat} ${row.label} ${row.text} ${row.type} ${row.pid} ${row.mid} ${tags.join(' ')}`.toLowerCase();
      return f.free.every(x => hay.includes(x));
    };

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const timelineLabel = when => {
      const t = Number(when) || 0;
      if (!t) return 'Older';
      const d = new Date(t); d.setHours(0, 0, 0, 0);
      const diff = todayStart - d.getTime();
      if (diff <= 0) return 'Today';
      if (diff <= DAY_MS) return 'Yesterday';
      if (diff <= 6 * DAY_MS) return 'This week';
      return 'Older';
    };
    const renderWorkspace = () => {
      const rows = entries.filter(r => r.pid === currentPid);
      const filters = [...(S.chatFilters.get(currentPid) || [])];
      workspace.replaceChildren();
      const text = document.createElement('div'); text.className = 'tf3-workspace-main';
      const title = document.createElement('strong'); title.textContent = getActiveChatTitle();
      const sub = document.createElement('small');
      sub.textContent = `${rows.length} bookmarks · filters: ${filters.length ? filters.join(', ') : 'all'}`;
      text.append(title, sub); workspace.appendChild(text);
    };
    const render = () => {
      const f = parseQuery(search.value);
      const matched = entries.filter(row => {
        if (thisChatOnly && row.pid !== currentPid) return false;
        return matchesQuery(row, f);
      }).slice(0, LIMITS.libraryRows);
      list.replaceChildren();
      if (!matched.length) {
        const empty = document.createElement('div'); empty.className = 'tf3-empty';
        empty.textContent = search.value.trim() ? 'No matching locations' : 'No bookmarks yet';
        list.appendChild(empty); return;
      }
      const frag = document.createDocumentFragment();
      let lastGroup = '';
      matched.forEach(row => {
        const group = timelineLabel(row.when);
        if (group !== lastGroup) {
          const hdr = document.createElement('div'); hdr.className = 'tf3-timeline-title'; hdr.textContent = group;
          frag.appendChild(hdr); lastGroup = group;
        }
        const item = document.createElement('div'); item.className = 'tf3-library-row';
        const info = document.createElement('div'); info.className = 'tf3-library-main';
        const title = document.createElement('strong');
        title.textContent = (row.downloaded ? '✓ ' : '') + row.label;
        const sub = document.createElement('small');
        sub.textContent = `${row.chat || 'Unknown chat'} · ${row.type || 'message'} · #${row.mid}`;
        info.append(title, sub);
        if (row.tags?.length) {
          const tags = document.createElement('div'); tags.className = 'tf3-tagline';
          row.tags.forEach(t => { const chip = document.createElement('span'); chip.className = 'tf3-tag'; chip.textContent = '#' + t; tags.appendChild(chip); });
          info.appendChild(tags);
        }
        const actions = document.createElement('div'); actions.className = 'tf3-row-actions';
        const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'tf3-btn tf3-btn-primary tf3-btn-sm'; jump.textContent = 'Jump';
        jump.onclick = () => { close(); jumpToLocator(row.mid, row.pid, locatorCtxFrom(row)); };
        actions.appendChild(jump);
        const dl = document.createElement('button'); dl.type = 'button'; dl.className = 'tf3-btn tf3-btn-sm'; dl.textContent = 'DL'; dl.title = 'Download again';
        dl.onclick = async () => {
          dl.disabled = true;
          try {
            if (await dlSingle(row.pid, row.mid)) { row.downloaded = true; render(); }
            else showActionAck('Not downloaded — open the message or retry when idle', dl, 'danger');
          } finally { dl.disabled = false; }
        };
        actions.prepend(dl);
        const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'tf3-btn tf3-btn-sm'; tag.textContent = 'Tag';
        tag.onclick = () => { const raw = prompt('Tags, separated by commas', (row.bookmark.tags || []).join(', ')); if (raw == null) return; setBookmarkTags(row.bookmark, raw); entries = buildLibraryEntries(); render(); };
        const del = document.createElement('button'); del.type = 'button'; del.className = 'tf3-btn tf3-btn-danger tf3-btn-sm'; del.textContent = 'Delete';
        del.onclick = () => { removeBookmark(row.pid, row.mid); entries = buildLibraryEntries(); renderWorkspace(); render(); };
        actions.prepend(tag, del);
        item.append(info, actions); frag.appendChild(item);
      });
      list.appendChild(frag);
      if (matched.length === LIMITS.libraryRows) {
        const note = document.createElement('div'); note.className = 'tf3-library-limit'; note.textContent = 'Showing first 500 matches - refine search for more'; list.appendChild(note);
      }
    };

    search.oninput = rafThrottle(render);
    scopeBtn.onclick = () => { thisChatOnly = !thisChatOnly; scopeBtn.classList.toggle('active', thisChatOnly); render(); };
    overlay.querySelector('.tf3-export').onclick = () => {
      try {
        const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
        const blob = new Blob([JSON.stringify(S.bookmarks, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `telefilter-bookmarks-${stamp}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch (err) { console.warn('[TF5] bookmark export failed:', err?.message || err); }
    };
    overlay.querySelector('.tf3-clean-old').onclick = () => {
      const raw = prompt('Delete bookmarks older than how many days?', '30');
      if (raw == null) return;
      const days = Number(raw);
      if (!Number.isFinite(days) || days <= 0) return;
      const cutoff = Date.now() - days * DAY_MS;
      const bookmarkTime = b => { const c = Number(b.createdAt) || 0, m = Number(b.msgDate) || 0; return c || (m ? (m > 1e12 ? m : m * 1000) : 0); };
      const doomed = S.bookmarks.filter(b => (!thisChatOnly || normalizePeerId(b.peerId) === currentPid) && bookmarkTime(b) > 0 && bookmarkTime(b) < cutoff);
      if (!doomed.length) { alert('No bookmarks old enough to delete.'); return; }
      if (!confirm(`Delete ${doomed.length} bookmark${doomed.length === 1 ? '' : 's'} older than ${days} days?`)) return;
      const doomedKeys = new Set(doomed.map(b => mediaKey(b.peerId, b.mid)));
      S.bookmarks = S.bookmarks.filter(b => !doomedKeys.has(mediaKey(b.peerId, b.mid)));
      rebuildBookmarkKeys();
      saveStorage(); updateBookmarkPill(); entries = buildLibraryEntries(); renderWorkspace(); render();
    };
    renderWorkspace(); render();
  }

  /* ─── SCROLL ANCHOR LOCK ─── */
  function getVisibleAnchorBubble() {
    if (!S.bubbles) return null;
    const rect = S.bubbles.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const midY = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, midY)?.closest?.(isNewWebKDOM ? '.Message.message-list-item' : '.bubble');
    if (hit && S.bubbles.contains(hit) && (hit.offsetWidth || hit.offsetHeight)) return hit;
    const items = isNewWebKDOM ? S.bubbles.querySelectorAll('.Message.message-list-item') : S.bubbles.querySelectorAll('.bubble');

    let bestItem = null;
    let minDist = Infinity;
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      if (!el.offsetWidth && !el.offsetHeight) continue;
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - midY);
      if (d < minDist) { minDist = d; bestItem = el; }
    }
    return bestItem;
  }

  function saveScrollAnchor() {
    const anchor = getVisibleAnchorBubble();
    if (!anchor) return null;
    return { element: anchor, mid: getMidFromBubble(anchor) };
  }

  function restoreScrollAnchor(saved) {
    if (!saved || !S.bubbles) return;
    let target = saved.element;
    if (!target?.isConnected || (!target.offsetWidth && !target.offsetHeight)) {
      target = saved.mid ? findBubbleByMid(saved.mid) : null;
    }
    if (target?.isConnected && (target.offsetWidth || target.offsetHeight)) {
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
    } else {
      const sel = isNewWebKDOM ? '.Message.message-list-item' : '.bubble';
      const visible = [...S.bubbles.querySelectorAll(sel)].filter(el => el.offsetWidth || el.offsetHeight);
      if (visible.length) visible[0].scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }

  function saveChatFilter() {
    const pid = currentPeerId();
    if (pid == null || !S.col) return;
    const key = normalizePeerId(pid);
    touchBoundedMap(S.chatFilters, key, new Set(S.fActive), LIMITS.filterChats);
    saveChatFilters();
  }

  function toggleFilter(key) {
    if (!S.col) return;
    const anchor = saveScrollAnchor();
    S.fActive.has(key) ? S.fActive.delete(key) : S.fActive.add(key);
    applyFilterState();
    restoreScrollAnchor(anchor);
    saveChatFilter();
    forceRefreshLazyMedia();
  }

  function applyFilterState() {
    const col = S.col;
    if (!col) return;
    const showAll = S.fActive.size === 0;
    col.classList.toggle('tf3-f-on', !showAll);
    FILTERS.forEach(f => col.classList.toggle('tf3-f_' + f.key, S.fActive.has(f.key)));
    const bar = S.bar;
    if (bar) {
      const allPill = bar.querySelector('.tf3-all-pill');
      allPill?.classList.toggle('active', showAll);
      allPill?.setAttribute('aria-pressed', String(showAll));
      bar.querySelectorAll('.tf3-pill[data-key]').forEach(p => {
        const on = S.fActive.has(p.dataset.key);
        p.classList.toggle('active', on);
        p.setAttribute('aria-pressed', String(on));
      });
    }
  }

  /* ─── MEDIA COUNTER ─── */
  function forEachBubble(node, cb) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.classList.contains('Message') || node.classList.contains('bubble')) { cb(node); return; }
    if (isNewWebKDOM) node.querySelectorAll?.('.Message.message-list-item').forEach(cb);
    else node.querySelectorAll?.('.bubble').forEach(cb);
  }

  function updateBadge() {
    const total = S.mediaCount;
    if (S.bmPill) {
      const tip = 'Library — ' + total + ' loaded media';
      S.bmPill.title = tip;
      S.bmPill.setAttribute('aria-label', tip);
    }
    if (S.bar) {
      FILTERS.forEach(f => {
        const pill = S.bar.querySelector(`.tf3-pill[data-key="${f.key}"]`);
        if (!pill) return;
        let cnt = pill.querySelector('.tf3-cat-count');
        const count = S.catCounts[f.key] || 0;
        if (!cnt) {
          cnt = document.createElement('span');
          cnt.className = 'tf3-cat-count';
          pill.appendChild(cnt);
        }
        cnt.textContent = count > 0 ? String(count) : '';
      });
    }
  }

  /* ─── MEDIA INDEX (peerId -> mid -> cat) ─── */
  function ensureMediaPeerIndex(pid) {
    const key = normalizePeerId(pid);
    if (!key) return null;
    return touchBoundedMap(S.mediaIndex, key, S.mediaIndex.get(key) || new Map(), LIMITS.mediaPeers);
  }
  function idxAdd(pid, mid, cat) {
    if (pid == null || !mid || !cat) return;
    const m = S.mediaIndex.get(normalizePeerId(pid)) || ensureMediaPeerIndex(pid);
    const key = String(mid);
    if (m.size >= LIMITS.mediaPerPeer && !m.has(key)) m.delete(m.keys().next().value);
    m.set(key, cat);
  }
  function idxMove(pid, mid, newCat) {
    if (pid == null || !mid) return;
    const m = S.mediaIndex.get(normalizePeerId(pid));
    if (m?.has(String(mid))) { m.set(String(mid), newCat); return true; }
    return false;
  }

  function queueBadgeUpdate() {
    if (S.mediaUpdateFrame) return;
    S.mediaUpdateFrame = requestAnimationFrame(() => { S.mediaUpdateFrame = 0; updateBadge(); });
  }

  function reconcileMediaBubble(bubble, pid) {
    const tracked = S.mediaCat.has(bubble);
    const cat = getBubbleCategory(bubble);
    const isMedia = Boolean(cat && cat !== 'text' && isMediaBubble(bubble));
    const mid = getMidFromBubble(bubble);
    const prevCat = S.mediaCat.get(bubble);
    const prevMid = S.mediaMid.get(bubble);
    const prevIsMedia = Boolean(tracked && prevCat && prevCat !== 'text');
    if (!cat && !tracked) return false;

    let changed = false;
    if (tracked && prevMid !== mid) {
      S.mediaMid.set(bubble, mid);
      if (isMedia && mid) idxAdd(pid, mid, cat);
      changed = true;
    }
    if (tracked && prevCat !== cat) {
      if (prevCat) S.catCounts[prevCat] = Math.max(0, (S.catCounts[prevCat] || 0) - 1);
      if (cat) S.catCounts[cat] = (S.catCounts[cat] || 0) + 1;
      if (prevIsMedia !== isMedia) S.mediaCount = Math.max(0, S.mediaCount + (isMedia ? 1 : -1));
      changed = true;
    }

    const wasViral = tracked && bubble.classList.contains('tf3-has-reactions');
    const isViral = Boolean(cat && getMessageReactionCount(bubble) > 0);
    bubble.classList.toggle('tf3-has-reactions', isViral);
    if (wasViral !== isViral) {
      S.catCounts.viral = Math.max(0, (S.catCounts.viral || 0) + (isViral ? 1 : -1));
      changed = true;
    }

    if (cat) {
      if (!tracked) {
        S.catCounts[cat] = (S.catCounts[cat] || 0) + 1;
        if (isMedia) S.mediaCount++;
        changed = true;
      }
      S.mediaCat.set(bubble, cat);
      S.mediaMid.set(bubble, mid);
      if (isMedia && mid && prevCat !== cat && !idxMove(pid, mid, cat)) idxAdd(pid, mid, cat);
    } else if (tracked) {
      S.mediaCat.delete(bubble);
      S.mediaMid.delete(bubble);
      // Category transition above already removed the previous counts.
      changed = true;
    }
    return changed;
  }

  function resetAndScanMedia(bubbles, pid) {
    S.mediaCat = new WeakMap();
    S.mediaMid = new WeakMap();
    S.mediaCount = 0;
    S.catCounts = { text: 0, photo: 0, video: 0, other: 0, viral: 0 };
    if (pid != null) ensureMediaPeerIndex(pid);
    const scanSelector = isNewWebKDOM ? '.Message.message-list-item' : '.bubble';
    bubbles.querySelectorAll(scanSelector).forEach(b => {
      const cat = getBubbleCategory(b);
      if (!cat) return;
      const mid = getMidFromBubble(b), isMedia = cat !== 'text' && isMediaBubble(b);
      S.mediaCat.set(b, cat);
      S.mediaMid.set(b, mid);
      S.catCounts[cat] = (S.catCounts[cat] || 0) + 1;
      const isViral = getMessageReactionCount(b) > 0;
      b.classList.toggle('tf3-has-reactions', isViral);
      if (isViral) S.catCounts.viral++;
      if (isMedia) {
        S.mediaCount++;
        if (pid != null) idxAdd(pid, mid, cat);
      }
    });
    updateBadge();
  }

  function resyncMediaCounters(bubbles) {
    if (!bubbles?.isConnected || bubbles !== S.bubbles) return;
    resetAndScanMedia(bubbles, currentPeerId());
  }

  function setupMediaCounter(bubbles) {
    S.mediaObserver?.disconnect();
    if (S.mediaUpdateFrame) { cancelAnimationFrame(S.mediaUpdateFrame); S.mediaUpdateFrame = 0; }
    if (S.mediaRecheckFrame) { cancelAnimationFrame(S.mediaRecheckFrame); S.mediaRecheckFrame = 0; }
    S.mediaDirtyDuringScroll = false;

    resetAndScanMedia(bubbles, currentPeerId());

    S.scrollCleanup?.();
    const scrollContainer = bubbles.parentElement || bubbles;
    const onScroll = () => {
      S.isScrolling = true;
      clearTimeout(S.scrollTimer);
      S.scrollTimer = setTimeout(() => {
        S.isScrolling = false;
        if (S.mediaDirtyDuringScroll) {
          S.mediaDirtyDuringScroll = false;
          resyncMediaCounters(bubbles);
        }
      }, UI.scrollSettle);
    };
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    S.scrollCleanup = () => {
      scrollContainer.removeEventListener('scroll', onScroll);
    };

    const pendingRecheck = new Set();
    S.mediaObserver = new MutationObserver(mutations => {
      if (S.isScrolling) {
        if (mutations.length) S.mediaDirtyDuringScroll = true;
        return;
      }
      let changed = false;
      let addedAtTop = false;
      const pid = currentPeerId();

      for (const m of mutations) {
        if (m.type === 'attributes') {
          const recycled = isNewWebKDOM
            ? (m.target.classList.contains('Message') ? m.target : m.target.closest?.('.Message'))
            : (m.target.classList.contains('bubble') ? m.target : m.target.closest?.('.bubble'));
          if (recycled && bubbles.contains(recycled)) {
            changed = reconcileMediaBubble(recycled, pid) || changed;
          }
          continue;
        }
        const owner = isNewWebKDOM ? m.target.closest?.('.Message') : m.target.closest?.('.bubble');
        if (owner && bubbles.contains(owner)) changed = reconcileMediaBubble(owner, pid) || changed;
        m.removedNodes.forEach(n => forEachBubble(n, b => {
          const prevCat = S.mediaCat.get(b);
          if (S.mediaCat.delete(b)) {
            S.mediaMid.delete(b);
            if (prevCat && prevCat !== 'text') S.mediaCount = Math.max(0, S.mediaCount - 1);
            if (prevCat && S.catCounts[prevCat]) {
              S.catCounts[prevCat] = Math.max(0, S.catCounts[prevCat] - 1);
            }
            if (b.classList.contains('tf3-has-reactions')) {
              S.catCounts.viral = Math.max(0, (S.catCounts.viral || 0) - 1);
            }
            changed = true;
          }
          pendingRecheck.delete(b);
        }));
        m.addedNodes.forEach(n => {
          if (n.previousSibling === null) addedAtTop = true;
          forEachBubble(n, b => { changed = reconcileMediaBubble(b, pid) || changed; pendingRecheck.add(b); });
        });
      }

      if (S.fActive.size > 0 && addedAtTop) {
        const a = getVisibleAnchorBubble();
        if (a) requestAnimationFrame(() => a.scrollIntoView({ block: 'center', behavior: 'instant' }));
      }

      if (changed) queueBadgeUpdate();
      if (pendingRecheck.size && !S.mediaRecheckFrame) {
        S.mediaRecheckFrame = requestAnimationFrame(() => {
          S.mediaRecheckFrame = 0;
          let rc = false;
          pendingRecheck.forEach(b => {
            if (b.isConnected && bubbles.contains(b)) rc = reconcileMediaBubble(b, pid) || rc;
          });
          pendingRecheck.clear();
          if (rc) queueBadgeUpdate();
        });
      }
    });
    S.mediaObserver.observe(bubbles, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-message-id', 'data-mid', 'data-msg-id'],
    });
  }

  /* ─── THEME & DIALOG HELPERS ─────── */
  function parseColor(v) {
    const m = String(v || '').match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?/i);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] } : null;
  }

  function findBg(el) {
    let n = el;
    for (let i = 0; n && i < 8; i++, n = n.parentElement) {
      const v = getComputedStyle(n).backgroundColor;
      const c = parseColor(v);
      if (c && c.a > .2) return { value: v, color: c };
    }
    return { value: 'rgb(255,255,255)', color: { r: 255, g: 255, b: 255, a: 1 } };
  }

  function isDark(c) { return c ? (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 < .48 : false; }

  function syncBarTheme(bar, ctx) {
    const bg = findBg(ctx || bar.parentElement);
    bar.classList.toggle('tf3-dark', isDark(bg.color) || document.body.classList.contains('theme-dark') || document.documentElement.classList.contains('dark'));
    bar.style.setProperty('--tf3-surface', bg.value);
  }

  function syncDialogTheme(overlay) {
    const dark = S.bar?.classList.contains('tf3-dark') ?? (isDark(findBg(document.body).color) || document.body.classList.contains('theme-dark'));
    overlay.classList.toggle('tf3-dark', dark);
  }

  let themeObserver = null, themeFrame = 0;
  function watchThemeChanges() {
    if (themeObserver || !document.body) return;
    const refresh = () => {
      if (themeFrame) return;
      themeFrame = requestAnimationFrame(() => {
        themeFrame = 0;
        if (S.bar?.isConnected) syncBarTheme(S.bar, S.col || S.bar.parentElement);
        if (S.panel?.isConnected) syncDialogTheme(S.panel);
        document.querySelectorAll('#tf3-overlay').forEach(syncDialogTheme);
      });
    };
    themeObserver = new MutationObserver(refresh);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  function schedulePanelHide(delay) {
    clearTimeout(S.panelHideTimer);
    S.panelHideTimer = setTimeout(() => { if (S.panel?.isConnected) S.panel.style.display = 'none'; }, delay);
  }

  function pnl() {
    if (S.panel) {
      if (S.bar && S.panel.parentElement !== S.bar) S.bar.appendChild(S.panel);
      syncDialogTheme(S.panel); return S.panel;
    }
    const p = document.createElement('div');
    p.id = 'tf3-panel';
    p.addEventListener('click', handleControlFeedback, true);
    p.setAttribute('role', 'status');
    p.setAttribute('aria-live', 'polite');
    p.innerHTML = `
      <div class="h"><div class="hl"><span class="l"></span></div>
      <div class="hr"><button type="button" class="rr" aria-label="Retry failed" title="Retry failed" style="display:none">↻</button><button type="button" class="pp" aria-label="Pause queue" title="Pause queue">Ⅱ</button><button type="button" class="cc" aria-label="Cancel">${ico('e973').outerHTML}</button><button type="button" class="xx" aria-label="Close">${ico('e95d').outerHTML}</button></div></div>
      <div class="b"><div class="pb" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="pf"></div></div><div class="fn"></div><div class="st"></div></div>`;
    p.querySelector('.xx').onclick = () => { S.panelDismissed = true; p.style.display = 'none'; };
    if (S.bar) S.bar.appendChild(p);
    S.panel = p;
    S.panelRefs = {
      label: p.querySelector('.l'),
      progress: p.querySelector('.pb'),
      fill: p.querySelector('.pf'),
      filename: p.querySelector('.fn'),
      status: p.querySelector('.st'),
      cancel: p.querySelector('.cc'),
      pause: p.querySelector('.pp'),
      retry: p.querySelector('.rr'),
    };
    syncDialogTheme(p);
    return p;
  }

  function pnlUpd(cur, total, name) {
    const p = pnl();
    p.style.display = S.panelDismissed ? 'none' : 'flex';
    const refs = S.panelRefs;
    const pct = total > 0 ? cur / total : 0;
    refs.label.textContent = `${cur}/${total}`;
    refs.fill.style.transform = `scaleX(${pct})`;
    refs.progress.setAttribute('aria-valuenow', String(Math.round(pct * 100)));
    refs.filename.textContent = name || '';
    refs.status.textContent = `Processing ${cur} of ${total}`;
    refs.cancel.style.display = cur < total ? 'inline-flex' : 'none';
    refs.pause.style.display = cur < total ? 'inline-flex' : 'none';
    refs.retry.style.display = 'none';
  }

  function pnlDone(ok, total) {
    if (!S.panel) return;
    const all = ok === total;
    S.panelRefs.label.textContent = (all ? '✓ ' : '⚠ ') + ok + '/' + total;
    S.panelRefs.fill.style.transform = 'scaleX(1)';
    S.panelRefs.progress.setAttribute('aria-valuenow', '100');
    S.panelRefs.status.textContent = all ? `${total} saved ✓` : `${ok} saved, ${total - ok} failed`;
    S.panelRefs.cancel.style.display = 'none';
    S.panelRefs.pause.style.display = 'none';
    const failed = S.lastFailedTargets.length;
    S.panelRefs.retry.style.display = failed ? 'inline-flex' : 'none';
    S.panelRefs.retry.onclick = failed ? () => {
      const retry = S.lastFailedTargets.slice();
      const last = S.lastBatch || {};
      S.lastFailedTargets = [];
      downloadTargets(retry, `Retry failed · ${retry.length} items`, last.peerId, last.chatTitle, last.ctx || {});
    } : null;
    schedulePanelHide(failed ? 8000 : 3500);
  }

  function mountDialog(overlay) {
    S.dialogClose?.();
    const prevFocus = document.activeElement;
    const closeBtn = overlay.querySelector('.tf3-sx');
    const inerted = 'inert' in HTMLElement.prototype ? [...document.body.children].filter(e => !e.inert) : [];
    let closed = false;

    const close = () => {
      if (closed) return;
      closed = true;
      overlay.remove();
      inerted.forEach(e => { e.inert = false; });
      if (S.dialogClose === close) S.dialogClose = null;
      if (prevFocus?.isConnected) prevFocus.focus({ preventScroll: true });
    };

    S.dialogClose = close;
    closeBtn.onclick = close;
    overlay.onclick = ev => { if (ev.target === overlay) close(); };
    overlay.addEventListener('click', handleControlFeedback, true);
    document.body.appendChild(overlay);
    syncDialogTheme(overlay);
    inerted.forEach(e => { e.inert = true; });
    closeBtn.focus({ preventScroll: true });
    return close;
  }

  /* ─── HISTORY & SETTINGS ───────────── */
  function addHistory(ok, total, chatTitle = '') {
    const now = new Date();
    const safeOk = Math.max(0, Number(ok) || 0);
    const safeTotal = Math.max(safeOk, Number(total) || safeOk);
    S.history.unshift({
      time: now.toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      files: safeOk,
      total: safeTotal,
      failed: Math.max(0, safeTotal - safeOk),
      chat: chatTitle || document.title?.slice(0, 36) || '?',
    });
    S.history = S.history.slice(0, 50);
    saveStorage();
  }

  function showHistory(e) {
    e?.stopPropagation();
    const overlay = document.createElement('div');
    overlay.id = 'tf3-overlay';
    overlay.innerHTML = `<div class="tf3-card" role="dialog" aria-modal="true" aria-labelledby="tf3-history-title">
      <div class="tf3-sh">
        <div class="tf3-title-wrap"><span class="tf3-title-icon">${ico('e95c').outerHTML}</span><span><strong id="tf3-history-title">Download History</strong><small>${S.history.length} session${S.history.length === 1 ? '' : 's'}</small></span></div>
        <button type="button" class="tf3-sx" aria-label="Close">${ico('e95d').outerHTML}</button>
      </div>
      <div class="tf3-hl"></div>
      <div class="tf3-dialog-actions"><button type="button" class="tf3-btn tf3-btn-danger tf3-hclr">Clear</button><button type="button" class="tf3-btn tf3-btn-primary tf3-done">Done</button></div>
    </div>`;

    const list = overlay.querySelector('.tf3-hl');
    if (!S.history.length) {
      const em = document.createElement('div');
      em.className = 'tf3-empty';
      em.textContent = 'No downloads yet';
      list.appendChild(em);
    } else {
      const frag = document.createDocumentFragment();
      S.history.slice(0, 20).forEach(h => {
        const row = document.createElement('div');
        row.className = 'tf3-hi';
        const ok = Number.isFinite(+h.files) ? +h.files : 0;
        const total = Number.isFinite(+h.total) ? +h.total : ok;
        const failed = Number.isFinite(+h.failed) ? +h.failed : Math.max(0, total - ok);
        row.innerHTML = `<span class="tf3-ht">${h.time || ''}</span><span class="tf3-hc"></span><span class="tf3-hf${failed > 0 ? ' has-failures' : ''}">${failed > 0 ? ok + '/' + total + ' · ' + failed + ' failed' : ok + ' files'}</span>`;
        row.querySelector('.tf3-hc').textContent = h.chat || '?';
        frag.appendChild(row);
      });
      list.appendChild(frag);
    }

    const close = mountDialog(overlay);
    const clr = overlay.querySelector('.tf3-hclr');
    clr.disabled = S.history.length === 0;
    clr.onclick = () => { S.history = []; saveStorage(); close(); };
    overlay.querySelector('.tf3-done').onclick = close;
  }

  function showErrors(e) {
    e?.stopPropagation();
    const overlay = document.createElement('div');
    overlay.id = 'tf3-overlay';
    overlay.innerHTML = `<div class="tf3-card" role="dialog" aria-modal="true" aria-labelledby="tf3-errors-title">
      <div class="tf3-sh"><div class="tf3-title-wrap"><span class="tf3-title-icon">!</span><span><strong id="tf3-errors-title">Recent Errors</strong><small>${S.errors.length} in this session</small></span></div><button type="button" class="tf3-sx" aria-label="Close">${ico('e95d').outerHTML}</button></div>
      <div class="tf3-hl tf3-error-list"></div>
      <div class="tf3-dialog-actions"><button type="button" class="tf3-btn tf3-btn-danger tf3-error-clear">Clear</button><button type="button" class="tf3-btn tf3-btn-primary tf3-done">Done</button></div>
    </div>`;
    const list = overlay.querySelector('.tf3-error-list');
    if (!S.errors.length) {
      const empty = document.createElement('div'); empty.className = 'tf3-empty'; empty.textContent = 'No recent errors'; list.appendChild(empty);
    } else {
      S.errors.forEach(row => {
        const item = document.createElement('div'); item.className = 'tf3-error-row';
        const title = document.createElement('strong'); title.textContent = row.label;
        const sub = document.createElement('small'); sub.textContent = row.error;
        item.append(title, sub); list.appendChild(item);
      });
    }
    const close = mountDialog(overlay);
    overlay.querySelector('.tf3-done').onclick = close;
    const clr = overlay.querySelector('.tf3-error-clear'); clr.disabled = !S.errors.length;
    clr.onclick = () => { S.errors = []; close(); };
  }

  function showSettings(e) {
    e?.stopPropagation();
    const overlay = document.createElement('div');
    overlay.id = 'tf3-overlay';
    overlay.innerHTML = `<div class="tf3-card" role="dialog" aria-modal="true" aria-labelledby="tf3-settings-title">
      <div class="tf3-sh">
        <div class="tf3-title-wrap"><span class="tf3-title-icon">${ico('ea8d').outerHTML}</span><span><strong id="tf3-settings-title">Telefilter v5 Ultimate</strong><small>Desktop Edition</small></span></div>
        <button type="button" class="tf3-sx" aria-label="Close">${ico('e95d').outerHTML}</button>
      </div>
      <button type="button" class="tf3-history-link" id="tf3-open-library"><span>${ico('ea8e').outerHTML}</span><span><strong>Workspace & Library</strong><small>Search bookmarks, tags and saved media</small></span><span class="tf3-chevron">›</span></button>
      <button type="button" class="tf3-history-link" id="tf3-show-history" style="margin-top:8px"><span>${ico('e95c').outerHTML}</span><span><strong>Download History</strong><small>${S.history.length} sessions</small></span><span class="tf3-chevron">›</span></button>
      <button type="button" class="tf3-history-link" id="tf3-show-errors" style="margin-top:8px"><span>!</span><span><strong>Recent Errors</strong><small>${S.errors.length} this session</small></span><span class="tf3-chevron">›</span></button>
      <button type="button" class="tf3-history-link" id="tf3-clear-vault" style="margin-top:8px"><span>🗑️</span><span><strong>Clear Download Deduplication Cache</strong><small>${S.downloadedVaultKeys.size} saved IDs in IndexedDB</small></span><span class="tf3-chevron">›</span></button>
      <div style="margin-top:14px; display:flex; flex-direction:column; gap:8px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="tf5-opt-zip" ${S.zipMode ? 'checked' : ''}>
          <span><strong>Bundle batch as ZIP archive</strong> (No multiple prompts)</span>
        </label>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="tf5-opt-naming" ${S.smartNaming ? 'checked' : ''}>
          <span><strong>Smart File Naming</strong> (Date + Chat + Sender)</span>
        </label>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="tf5-opt-captions" ${S.saveCaptions ? 'checked' : ''}>
          <span><strong>Save Captions Sidecar</strong> (.txt text with media)</span>
        </label>
      </div>
      <p class="tf3-note">Workspace data stays local: bookmarks, tags, and persistent deduplication cache.</p>
      <div class="tf3-dialog-actions tf3-dialog-actions-end"><button type="button" class="tf3-btn tf3-btn-primary tf3-done">Done</button></div>
    </div>`;
    const close = mountDialog(overlay);
    overlay.querySelector('.tf3-done').onclick = close;
    overlay.querySelector('#tf3-open-library').onclick = ev => { close(); showLocatorLibrary(ev); };
    overlay.querySelector('#tf3-show-history').onclick = ev => { close(); showHistory(ev); };
    overlay.querySelector('#tf3-show-errors').onclick = ev => { close(); showErrors(ev); };
    overlay.querySelector('#tf3-clear-vault').onclick = () => {
      if (confirm('Clear all downloaded record history from IndexedDB?')) {
        TelefilterVault.clearVault().then(() => alert('Download cache cleared.'));
      }
    };
    overlay.querySelector('#tf5-opt-zip').onchange = e => { S.zipMode = e.target.checked; saveStorage(); renderActionButtons(); };
    overlay.querySelector('#tf5-opt-naming').onchange = e => { S.smartNaming = e.target.checked; saveStorage(); };
    overlay.querySelector('#tf5-opt-captions').onchange = e => { S.saveCaptions = e.target.checked; saveStorage(); };
  }

  /* ─── CONTROL BAR BUILDER ─────────── */
  function buildBar() {
    const bar = document.createElement('div');
    bar.className = 'tf3-ctrl';
    bar.dataset.version = VERSION;
    bar.addEventListener('click', handleControlFeedback, true);

    const content = document.createElement('div');
    content.className = 'tf3-content';
    content.id = 'tf3-controls';
    content.setAttribute('aria-hidden', 'false');

    const pw = document.createElement('div');
    pw.className = 'tf3-pw';

    const allPill = document.createElement('button');
    allPill.className = 'tf3-pill tf3-filter-pill tf3-all-pill active';
    allPill.type = 'button';
    allPill.title = 'Show all';
    allPill.setAttribute('aria-label', 'Show all');
    allPill.setAttribute('aria-pressed', 'true');
    allPill.textContent = 'All';
    allPill.onclick = () => {
      const anchor = saveScrollAnchor();
      S.fActive.clear();
      applyFilterState();
      restoreScrollAnchor(anchor);
      saveChatFilter();
      forceRefreshLazyMedia();
    };
    pw.appendChild(allPill);

    FILTERS.forEach(f => {
      const p = document.createElement('button');
      p.className = 'tf3-pill tf3-filter-pill';
      p.type = 'button';
      p.dataset.key = f.key;
      const canBatch = f.key !== 'text';
      p.title = canBatch
        ? `${f.label}: click to filter · double-click to download loaded ${f.label.toLowerCase()}`
        : `${f.label}: click to filter`;
      p.setAttribute('aria-label', canBatch ? 'Filter ' + f.label + '; double-click to download loaded items' : 'Filter ' + f.label);
      p.setAttribute('aria-pressed', 'false');
      p.appendChild(ico(f.ico));
      const lbl = document.createElement('span');
      lbl.className = 'tf3-pill-label';
      lbl.textContent = f.label;
      p.appendChild(lbl);
      p.onclick = () => toggleFilter(f.key);
      if (canBatch) p.ondblclick = ev => { ev.preventDefault(); runCategoryJob(f.key, p); };
      pw.appendChild(p);
    });

    const aw = document.createElement('div');
    aw.className = 'tf3-aw';

    // Harvest Pill (Deep DOM Virtualization Buster)
    const harvestBtn = document.createElement('button');
    harvestBtn.className = 'tf3-pill tf5-harvest-pill';
    harvestBtn.type = 'button';
    harvestBtn.title = 'Deep Harvester: Scroll history upward to index all media';
    harvestBtn.textContent = 'Harvest history';
    harvestBtn.onclick = toggleDeepHarvester;
    S.harvestPill = harvestBtn;

    // ZIP Mode Toggle Pill
    const zipBtn = document.createElement('button');
    zipBtn.className = 'tf3-pill tf5-zip-pill' + (S.zipMode ? ' active' : '');
    zipBtn.type = 'button';
    zipBtn.title = 'Toggle ZIP Mode (Bundle all downloads into a single .zip file)';
    zipBtn.textContent = 'Bundle as ZIP';
    zipBtn.setAttribute('aria-pressed', String(S.zipMode));
    zipBtn.onclick = () => {
      S.zipMode = !S.zipMode;
      saveStorage();
      renderActionButtons();
      showActionAck(S.zipMode ? 'ZIP Bundling ON' : 'ZIP Bundling OFF', zipBtn, 'ok');
    };
    S.zipPill = zipBtn;

    const dlBtn = document.createElement('button');
    dlBtn.className = 'tf3-pill tf3-pill-accent tf3-download-pill';
    dlBtn.id = 'tf3-dlb';
    dlBtn.type = 'button';
    dlBtn.style.display = 'inline-flex';
    dlBtn.title = 'Download selected media';
    dlBtn.setAttribute('aria-label', 'Download selected Telegram media');
    const dtxt = document.createElement('span');
    dtxt.className = 'tf3-dl-label';
    dtxt.textContent = S.zipMode ? 'ZIP Download' : 'Download';
    dlBtn.appendChild(dtxt);
    dlBtn.onclick = downloadNativeSelection;
    S.dlPill = dlBtn;

    const bmBtn = document.createElement('button');
    bmBtn.className = 'tf3-pill tf3-icon-pill tf3-bm-pill';
    bmBtn.type = 'button';
    bmBtn.title = 'Workspace & Library';
    bmBtn.setAttribute('aria-label', 'Open Telefilter workspace');
    bmBtn.appendChild(ico('ea8e'));
    const bmBadge = document.createElement('span');
    bmBadge.className = 'tf3-bm-count';
    bmBtn.appendChild(bmBadge);
    bmBtn.onclick = showLocatorLibrary;
    S.bmPill = bmBtn;
    updateBookmarkPill();

    const sBtn = document.createElement('button');
    sBtn.className = 'tf3-pill tf3-icon-pill';
    sBtn.type = 'button';
    sBtn.title = 'Settings';
    sBtn.setAttribute('aria-label', 'Settings');
    sBtn.appendChild(ico('ea8d'));
    sBtn.onclick = showSettings;

    // Native disclosures stay in layout: no popup covering messages.
    const disclosure = (label, name) => {
      const box = document.createElement('details');
      box.className = 'tf3-disclosure ' + name;
      const summary = document.createElement('summary');
      summary.className = 'tf3-pill';
      summary.textContent = label;
      summary.setAttribute('aria-label', name === 'tf3-more' ? 'More tools' : 'Download format');
      box.appendChild(summary);
      box.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') { box.open = false; summary.focus(); ev.stopPropagation(); }
      });
      return box;
    };
    const format = disclosure('▾', 'tf3-format');
    format.appendChild(zipBtn);
    const split = document.createElement('div');
    split.className = 'tf3-split';
    split.append(dlBtn, format);
    const more = disclosure('…', 'tf3-more');
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button'; historyBtn.className = 'tf3-pill';
    historyBtn.textContent = 'History'; historyBtn.onclick = showHistory;
    sBtn.textContent = 'Settings';
    sBtn.classList.remove('tf3-icon-pill');
    more.append(harvestBtn, historyBtn, sBtn);
    more.addEventListener('toggle', () => { if (more.open) format.open = false; });
    format.addEventListener('toggle', () => { if (format.open) more.open = false; });
    bmBtn.textContent = 'Library';
    bmBtn.classList.remove('tf3-icon-pill');
    bmBtn.appendChild(bmBadge);
    aw.append(more, split, bmBtn);
    content.append(pw, aw);
    bar.append(content);
    if (S.panel) bar.appendChild(S.panel);
    return bar;
  }

  /* ─── INJECT & DOM WATCHER ─── */
  let bubblesHost = null, watchedBubbles = null, bubblesHostObserver = null;
  let barHost = null, watchedBar = null, barHostObserver = null;

  function watchBubblesHost(bubbles) {
    const host = bubbles.parentElement;
    if (bubblesHost === host && watchedBubbles === bubbles) return;
    bubblesHostObserver?.disconnect();
    bubblesHost = host; watchedBubbles = bubbles;
    if (!host) return;
    bubblesHostObserver = new MutationObserver(() => {
      if (!bubbles.isConnected || !S.bar?.isConnected) scheduleInject(0);
    });
    bubblesHostObserver.observe(host, { childList: true });
  }

  function watchBarHost(bar) {
    const host = bar.parentElement;
    if (barHost === host && watchedBar === bar) return;
    barHostObserver?.disconnect();
    barHost = host; watchedBar = bar;
    if (!host) return;
    barHostObserver = new MutationObserver(() => scheduleInject(0));
    barHostObserver.observe(host, { childList: true });
  }

  function teardownDisconnectedChat() {
    if (!S.col && !S.bubbles && !S.bar) return;
    stopCtxWatch();
    S.mediaObserver?.disconnect(); S.mediaObserver = null;
    S.scrollCleanup?.(); S.scrollCleanup = null;
    clearTimeout(S.scrollTimer); S.scrollTimer = 0; S.isScrolling = false; S.mediaDirtyDuringScroll = false;
    bubblesHostObserver?.disconnect(); bubblesHostObserver = null; bubblesHost = null; watchedBubbles = null;
    barHostObserver?.disconnect(); barHostObserver = null; barHost = null; watchedBar = null;
    if (S.mediaUpdateFrame) cancelAnimationFrame(S.mediaUpdateFrame);
    if (S.mediaRecheckFrame) cancelAnimationFrame(S.mediaRecheckFrame);
    S.mediaUpdateFrame = 0; S.mediaRecheckFrame = 0;
    S.mediaCount = 0;
    S.mediaCat = new WeakMap();
    S.mediaMid = new WeakMap();
    S.bubbles = null; S.col = null; S.bar = null;
    S.dlPill = null; S.bmPill = null; S.harvestPill = null; S.zipPill = null;
  }

  function inject(col) {
    if (!col) { debug('inject: no column'); return false; }
    let bub, header, chat;
    let detectedNew = false;

    const hasNewList = col.querySelector('.MessageList');
    const hasOldChat = col.querySelector('.chat');

    if (hasNewList) {
      detectedNew = true;
      const layout = col.querySelector('.messages-layout') || col;
      bub = layout.querySelector('.MessageList');
      if (!bub) return false;
      header = layout.querySelector('.MiddleHeader');
      chat = layout;
    } else if (hasOldChat) {
      chat = col.querySelector('.chat');
      const innerLayout = chat.querySelector('.messages-layout');
      if (innerLayout) {
        detectedNew = true;
        bub = innerLayout.querySelector('.MessageList');
        if (!bub) return false;
        header = innerLayout.querySelector('.MiddleHeader');
        chat = innerLayout;
      } else {
        const bubbles = chat.querySelector('.bubbles');
        if (bubbles?.children.length > 0) {
          bub = bubbles;
          header = chat.querySelector('.sidebar-header, .chat-header');
          if (!header) return false;
        } else {
          const scrollable = chat.querySelector('.scrollable-y') || chat.querySelector('.scrollable') || chat.querySelector('.im-history');
          bub = scrollable || chat;
          detectedNew = true;
          header = chat.querySelector('.sidebar-header, .chat-header, .chat-header-container');
        }
      }
    } else return false;

    isNewWebKDOM = detectedNew;

    let bar = col.querySelector('.tf3-ctrl');
    if (bar && !bar.isConnected) bar = null;
    if (!bar) {
      bar = buildBar();
      const isWebKInsert = isNewWebKDOM && bub !== chat && chat.contains(bub);
      if (isWebKInsert) {
        bub.previousElementSibling ? bub.parentElement.insertBefore(bar, bub) : bub.parentElement.prepend(bar);
      } else {
        header?.nextElementSibling ? chat.insertBefore(bar, header.nextElementSibling) : chat.prepend(bar);
      }
    }

    const bubblesChanged = S.bubbles !== bub;
    const barChanged = S.bar !== bar;
    S.bar = bar; S.col = chat;
    if (S.panel && S.panel.parentElement !== bar) bar.appendChild(S.panel);
    S.dlPill = bar.querySelector('#tf3-dlb');
    S.bmPill = bar.querySelector('.tf3-bm-pill');
    S.harvestPill = bar.querySelector('.tf5-harvest-pill');
    S.zipPill = bar.querySelector('.tf5-zip-pill');
    syncBarTheme(bar, chat);
    renderActionButtons();

    if (bubblesChanged) { S.bubbles = bub; setupMediaCounter(bub); watchBubblesHost(bub); }
    else if (barChanged) updateBadge();
    watchBarHost(bar);

    const fPid = normalizePeerId(currentPeerId());
    if (S.fActivePeer !== fPid) {
      const storedF = S.chatFilters.get(fPid);
      S.fActive = new Set(storedF ? [...storedF] : []);
      S.fActivePeer = fPid;
      S.dlSession.clear();
    }
    applyFilterState();
    updateBookmarkPill();
    return true;
  }

  /* ─── LEAN 2-ACTION RIGHT-CLICK (Download & Bookmark) ─── */
  const MSG_SELECTOR = '[data-message-id],[data-mid],[data-msg-id]';
  let ctxObserver = null, ctxTimers = [], ctxCleanupTimer = 0, ctxReqId = 0;

  function stopCtxWatch() {
    ctxObserver?.disconnect();
    ctxObserver = null;
    ctxTimers.forEach(clearTimeout);
    ctxTimers = [];
    clearTimeout(ctxCleanupTimer);
    ctxCleanupTimer = 0;
  }

  function isUsableCtxMenu(menu) {
    if (!menu?.isConnected) return false;
    const style = getComputedStyle(menu);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return Boolean(menu.querySelector('.btn-menu-item:not(.tf3-ctx-action),[role="menuitem"]:not(.tf3-ctx-action)'));
  }

  function findTelegramCtxMenu() {
    const direct = document.getElementById('bubble-contextmenu');
    if (isUsableCtxMenu(direct)) return direct;
    const menus = document.querySelectorAll('.btn-menu,[role="menu"]');
    for (let i = menus.length - 1; i >= 0; i--) {
      if (isUsableCtxMenu(menus[i])) return menus[i];
    }
    return null;
  }

  function ensureCtxAction(menu, id, icon, label, run) {
    const ref = menu.querySelector('.btn-menu-item:not(.tf3-ctx-action),[role="menuitem"]:not(.tf3-ctx-action)');
    if (!ref) return null;
    let item = menu.querySelector('#' + id);
    if (!item) {
      item = document.createElement(ref.tagName === 'BUTTON' ? 'button' : 'div');
      if (item.tagName === 'BUTTON') item.type = 'button';
      if (typeof ref.className === 'string') item.className = ref.className;
      item.classList.add('tf3-ctx-action');
      item.id = id;
      item.tabIndex = 0;
      item.setAttribute('role', 'menuitem');
      const iconEl = document.createElement('span');
      iconEl.className = 'tf3-ctx-icon';
      const textEl = document.createElement('span');
      textEl.className = ref.querySelector('.btn-menu-item-text') ? 'i18n btn-menu-item-text tf3-ctx-text' : 'tf3-ctx-text';
      item.append(iconEl, textEl);
      ref.insertAdjacentElement('beforebegin', item);
    }
    const iconEl = item.querySelector('.tf3-ctx-icon');
    const textEl = item.querySelector('.tf3-ctx-text');
    if (iconEl.textContent !== icon) iconEl.textContent = icon;
    if (textEl.textContent !== label) textEl.textContent = label;
    item.onclick = ev => { ev.preventDefault(); pulseControl(item); stopCtxWatch(); run(); };
    return item;
  }

  async function downloadCtxMedia(peerId, mid) {
    if (S.batchRunning) return;
    try {
      const msg = await lookupMsg(peerId, mid);
      if (!msg || !getMedia(msg)) throw new Error('Media is not available');
      await downloadTargets([msg], 'Downloading 1 item', peerId);
    } catch (err) {
      recordError(`Download #${mid}`, err, mid);
    }
  }

  function patchCtxMenu(ctx) {
    const menu = findTelegramCtxMenu();
    if (!menu) return false;
    const isBm = S.bmKeys.has(mediaKey(ctx.peerId, ctx.mid));

    // 1. Download (only for media)
    if (ctx.isMedia) {
      ensureCtxAction(menu, 'tf3-ctxdl', 'v', S.zipMode ? 'Download (ZIP)' : 'Download', () => {
        showActionAck('Queued for download', ctx.anchor, 'ok');
        void downloadCtxMedia(ctx.peerId, ctx.mid);
      });
    } else {
      menu.querySelector('#tf3-ctxdl')?.remove();
    }

    // 2. Bookmark toggle
    ensureCtxAction(menu, 'tf3-ctxbm', 'B', isBm ? 'Remove bookmark' : 'Bookmark message', () => {
      void addBookmark(ctx.peerId, ctx.mid, ctx.preview);
      showActionAck(isBm ? 'Bookmark removed' : 'Bookmarked', ctx.anchor, isBm ? 'danger' : 'ok');
    });

    return true;
  }

  function watchCtxMenu(ctx, reqId) {
    stopCtxWatch();
    const attempt = () => {
      if (reqId === ctxReqId && patchCtxMenu(ctx)) {
        stopCtxWatch();
      }
    };
    ctxObserver = new MutationObserver(attempt);
    ctxObserver.observe(document.body, { subtree: true, childList: true });
    [20, 60, 140, 300].forEach(delay => {
      ctxTimers.push(setTimeout(attempt, delay));
    });
    ctxCleanupTimer = setTimeout(() => {
      if (reqId === ctxReqId) stopCtxWatch();
    }, UI.contextWatch);
  }

  function prepareCtxMenu(el, reqId) {
    if (reqId !== ctxReqId || !el) return;
    const mid = getMidFromBubble(el);
    const peerId = normalizePeerId(el.dataset?.peerId || currentPeerId());
    if (!mid || !peerId) return;
    const previewEl = el.querySelector('.text-content, .message-text') || el.querySelector('.message-content');
    const preview = previewEl?.textContent?.trim().slice(0, 240) || `Message #${mid}`;
    watchCtxMenu({ peerId, mid: String(mid), preview, isMedia: isMediaBubble(el), anchor: el, locatorCtx: locatorContext() }, reqId);
  }

  document.addEventListener('contextmenu', ev => {
    stopCtxWatch();
    const reqId = ++ctxReqId;
    const bubble = ev.target.closest?.('.Message.message-list-item,.bubble') || ev.target.closest?.(MSG_SELECTOR);
    if (!bubble || !S.bubbles?.contains(bubble)) return;
    prepareCtxMenu(bubble, reqId);
  }, true);

  const findColumn = () => document.getElementById('MiddleColumn') || document.getElementById('column-center');

  let watchedColumn = null, columnObserver = null, columnHost = null, columnHostObserver = null, injectTimer = 0;

  function releaseDisconnectedColumn() {
    if (watchedColumn && !watchedColumn.isConnected) { columnObserver?.disconnect(); columnObserver = null; watchedColumn = null; }
    if (columnHost && !columnHost.isConnected) { columnHostObserver?.disconnect(); columnHostObserver = null; columnHost = null; }
  }

  function scheduleInject(delay = 50, attempt = 0) {
    clearTimeout(injectTimer);
    injectTimer = setTimeout(() => ensureInjected(attempt), delay);
  }

  function ensureInjected(attempt = 0) {
    releaseDisconnectedColumn();
    const col = findColumn();
    if (col) watchColumn(col);
    try {
      if (col && inject(col)) return;
    } catch (err) {
      console.warn('[TF5] inject failed; retrying:', err?.message || err);
      teardownDisconnectedChat();
    }
    if (S.col && (!S.col.isConnected || !S.bubbles?.isConnected || !S.bar?.isConnected)) teardownDisconnectedChat();
    if (attempt < 30) scheduleInject(300, attempt + 1);
  }

  function watchColumn(col) {
    if (!col || watchedColumn === col) return;
    columnObserver?.disconnect();
    watchedColumn = col;
    columnObserver = new MutationObserver(() => scheduleInject(0));
    columnObserver.observe(col, { childList: true });
    const host = col.parentElement;
    columnHostObserver?.disconnect(); columnHost = host;
    if (host) {
      columnHostObserver = new MutationObserver(() => {
        if (findColumn() !== watchedColumn) scheduleInject(0);
      });
      columnHostObserver.observe(host, { childList: true });
    }
  }

  window.addEventListener('hashchange', () => scheduleInject(50));
  window.addEventListener('popstate', () => scheduleInject(50));
  window.addEventListener('pageshow', () => scheduleInject(0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleInject(0); });

  /* ─── STYLES & ANIMATIONS ────── */
  function mountStyles() {
    if (!document.documentElement || document.getElementById('tf3-base-css')) return false;
    const css = document.createElement('style');
    css.id = 'tf3-base-css';
    css.textContent = `
    /* ═══ CONTROL BAR ═══ */
    .tf3-ctrl {
      --tf3-accent: var(--theme-primary-color, var(--color-primary, #3390ec));
      --tf3-text: var(--color-text, var(--text-color, #111418));
      --tf3-muted: var(--color-text-secondary, var(--theme-secondary-color, #707579));
      --tf3-surface: var(--color-background, var(--surface-color, #ffffff));
      --tf3-border: color-mix(in srgb, var(--tf3-text) 8%, transparent);
      --tf3-subtle: color-mix(in srgb, var(--tf3-text) 4%, transparent);
      --tf3-subtle-hover: color-mix(in srgb, var(--tf3-text) 8%, transparent);
      --tf3-active-bg: var(--tf3-accent);
      --tf3-active-text: #ffffff;
      --tf3-shadow-sm: 0 1px 2px rgba(0,0,0,.05);
      --tf3-shadow-md: 0 8px 24px -4px rgba(0,0,0,.12), 0 2px 6px -1px rgba(0,0,0,.04);
      --tf3-radius-sm: 8px;
      --tf3-radius-md: 10px;
      --tf3-radius-lg: 14px;
      position: relative; z-index: 5;
      display: flex; flex-direction:column; box-sizing: border-box;
      width: 100%; min-width: 0; min-height: 40px; padding: 4px 8px;
      background: var(--tf3-surface); border-bottom: 1px solid var(--tf3-border);
      color: var(--tf3-text); contain: layout style paint;
      font: 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      letter-spacing: -0.01em;
    }
    .tf3-ctrl.tf3-dark {
      --tf3-text: #f1f3f5;
      --tf3-muted: #8d9399;
      --tf3-surface: var(--color-background, var(--surface-color, #18191b));
      --tf3-border: rgba(255,255,255,.08);
      --tf3-subtle: rgba(255,255,255,.05);
      --tf3-subtle-hover: rgba(255,255,255,.09);
      --tf3-shadow-sm: 0 1px 2px rgba(0,0,0,.2);
      --tf3-shadow-md: 0 12px 32px -4px rgba(0,0,0,.45), 0 4px 12px rgba(0,0,0,.25);
    }
    .tf3-ctrl button { box-sizing: border-box; font: inherit; -webkit-appearance: none; appearance: none; }

    /* Content Area */
    .tf3-content { display: flex; width:100%; min-width:0; align-items:flex-start; gap:8px; }
    .tf3-pw { display: flex; flex: 1; min-width: 0; gap: 4px; margin-left: 0; flex-wrap:wrap; }
    .tf3-pw::-webkit-scrollbar { display: none; }
    .tf3-aw { position: relative; display: flex; flex: 0 0 auto; align-items: flex-start; gap: 6px; margin-left: auto; padding-left: 6px; }
    .tf3-aw::before { content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 1px; background: var(--tf3-border); }

    /* Filter & Action Pills */
    .tf3-pill {
      flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      min-height: 32px; padding: 0 11px; border: 1px solid transparent; border-radius: var(--tf3-radius-sm);
      background: transparent; color: var(--tf3-muted);
      font-size: 12.5px; font-weight: 550; cursor: pointer; white-space: nowrap; user-select: none;
      transition: background .12s ease, color .12s ease, border-color .12s ease;
    }
    .tf3-pill-label { display: inline-block; }
    .tf3-cat-count { font-size: 10px; font-weight: 700; opacity: .85; padding: 1px 5px; border-radius: 999px; background: color-mix(in srgb, currentColor 14%, transparent); }
    .tf3-cat-count:empty { display: none; }
    .tf3-pill .tgico { font-size: 13.5px; line-height: 1; opacity: .88; }
    .tf3-pill:hover { background: var(--tf3-subtle); color: var(--tf3-text); }
    .tf3-pill:active { transform: scale(.98); }
    .tf3-pill.active { background: var(--tf3-subtle-hover); color: var(--tf3-accent); font-weight: 650; border-color: color-mix(in srgb, var(--tf3-accent) 25%, transparent); }
    .tf3-pill:disabled { opacity: .4; cursor: default; transform: none; }
    .tf3-all-pill { padding-inline: 11px; }

    /* Download Pill */
    .tf3-download-pill {
      min-width: 110px; padding: 0 13px; border: 1px solid color-mix(in srgb, var(--tf3-accent) 30%, transparent);
      background: color-mix(in srgb, var(--tf3-accent) 12%, transparent);
      color: var(--tf3-accent); font-weight: 600;
    }
    .tf3-ctrl.tf3-dark .tf3-download-pill {
      background: color-mix(in srgb, var(--tf3-accent) 18%, transparent);
      border-color: color-mix(in srgb, var(--tf3-accent) 40%, transparent);
      color: #64b5f6;
    }
    .tf3-download-pill:hover { background: var(--tf3-accent); color: #ffffff; border-color: var(--tf3-accent); }
    .tf3-pill.is-running { opacity: .75; }
    .tf3-pill.is-running:not(.tf5-harvest-pill) { pointer-events: none; }

    /* Extra Action Pills (ZIP & Harvest) */
    .tf5-zip-pill { border: 1px solid var(--tf3-border); font-size: 12px; }
    .tf5-zip-pill.active { background: color-mix(in srgb, #ff9800 15%, transparent); color: #e65100; border-color: #ff9800; }
    .tf3-dark .tf5-zip-pill.active { color: #ffb74d; border-color: #ff9800; }
    .tf5-harvest-pill { border: 1px solid var(--tf3-border); font-size: 12px; color: #0288d1; }
    .tf5-harvest-pill:hover { background: color-mix(in srgb, #0288d1 12%, transparent); }

    /* Quiet inline toolbar: native details expand space, never overlay chat. */
    .tf3-disclosure { min-width:32px; }
    .tf3-disclosure > summary { list-style:none; min-height:32px; border:1px solid var(--tf3-border); }
    .tf3-disclosure > summary::-webkit-details-marker { display:none; }
    .tf3-disclosure[open] { border:1px solid var(--tf3-border); border-radius:8px; background:var(--tf3-surface); }
    .tf3-disclosure[open] > button { display:flex; width:100%; justify-content:flex-start; white-space:normal; overflow-wrap:anywhere; }
    .tf3-format { width:40px; }
    .tf3-format[open] { width:110px; }
    .tf3-more[open] { width:140px; }
    .tf3-aw { flex-wrap:wrap; min-width:0; max-width:100%; }
    .tf3-split { max-width:100%; }
    .tf3-disclosure > summary:focus-visible { outline:2px solid var(--tf3-accent); outline-offset:1px; }
    .tf3-split { display:flex; align-items:flex-start; }
    .tf3-split > .tf3-download-pill { border-radius:8px 0 0 8px; }
    .tf3-split > details > summary { border-radius:0 8px 8px 0; }
    .tf3-bm-pill { position:relative; }
    .tf3-cat-count, #tf3-panel { font-variant-numeric:tabular-nums; }
    .tf3-ctrl #tf3-panel { border-radius:0; border:0; border-top:1px solid var(--tf3-border); box-shadow:none!important; animation:none; }
    .tf3-ctrl { container-type:inline-size; }
    @container (max-width:650px) {
      .tf3-content { flex-wrap:wrap; }
      .tf3-pw { flex-basis:100%; }
      .tf3-aw { padding:0; margin-left:0; flex-wrap:wrap; }
      .tf3-aw::before { display:none; }
    }

    /* MediaViewer Action Overlay */
    .tf5-mv-actions {
      display: inline-flex; align-items: center; gap: 8px; margin-left: 12px; z-index: 1000;
    }
    .tf5-mv-actions button { min-height: 28px; padding: 0 10px; font-weight: 600; }

    /* Icon Pills */
    .tf3-icon-pill { position: relative; width: 32px; height: 32px; padding: 0; border: 1px solid var(--tf3-border); border-radius: var(--tf3-radius-sm); background: transparent; }
    .tf3-icon-pill:hover { background: var(--tf3-subtle); border-color: color-mix(in srgb, var(--tf3-text) 14%, transparent); }
    .tf3-icon-pill .tgico { font-size: 14.5px; }
    .tf3-bm-count { position: absolute; top: -3px; right: -3px; display: flex; align-items: center; justify-content: center; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 999px; background: var(--tf3-accent); color: #fff; font-size: 8.5px; font-weight: 700; }
    .tf3-bm-count:empty { display: none; }
    .tf3-row-actions { display:inline-flex; gap:6px; }
    .tf3-btn-sm { min-height:28px; padding:0 10px; border-radius:6px; font-size:11.5px; font-weight:600; }

    /* Bookmark Highlight Flash */
    .tf3-bookmark-flash { animation: tf3-flash-gold 2s cubic-bezier(.2,.8,.2,1); }
    @keyframes tf3-flash-gold {
      0% { box-shadow: inset 0 0 0 2px #e5a50a; background: rgba(229,165,10,.14); }
      100% { box-shadow: inset 0 0 0 0 transparent; background: transparent; }
    }

    /* ═══ FILTERS (Zero DOM mutation — CSS only) ═══ */
    .tf3-f-on .bubble,.tf3-f-on .Message.message-list-item { display: none !important; }

    .tf3-f_text .bubble.is-message:not(.photo):not(.video):not(.round-video):not(.gif):not(.audio):not(.voice-message):not(.document):not(.document-container):not(.sticker):not(.grouped-item) { display: flex !important; }
    .tf3-f_text .Message.message-list-item:not(:has(.message-content.media,.message-content.audio,.message-content.voice,.message-content.document,.message-content.custom-shape)) { display: flex !important; }

    .tf3-f_photo .bubble.photo,.tf3-f_photo .bubble.grouped-item { display: flex !important; }
    .tf3-f_photo .Message.message-list-item:has(.message-content.media > .media-inner):not(:has(.message-content.media video)),.tf3-f_photo .Message.is-album:has(img):not(:has(video)) { display: flex !important; }

    .tf3-f_video .bubble.video,.tf3-f_video .bubble.round-video,.tf3-f_video .bubble.gif,.tf3-f_video .bubble.grouped-item { display: flex !important; }
    .tf3-f_video .Message.message-list-item:has(.message-content.media video),.tf3-f_video .Message.is-album:has(video) { display: flex !important; }

    .tf3-f_other .bubble.audio,.tf3-f_other .bubble.voice-message,.tf3-f_other .bubble.document,.tf3-f_other .bubble.document-container,.tf3-f_other .bubble.sticker { display: flex !important; }
    .tf3-f_other .Message.message-list-item:has(.message-content.audio),.tf3-f_other .Message.message-list-item:has(.message-content.voice),.tf3-f_other .Message.message-list-item:has(.message-content.document),.tf3-f_other .Message.message-list-item:has(.message-content.custom-shape) { display: flex !important; }

    .tf3-f_viral .bubble.tf3-has-reactions, .tf3-f_viral .Message.tf3-has-reactions { display: flex !important; }

    /* ═══ DOWNLOAD STATUS — Inline Row ═══ */
    #tf3-panel {
      --tf3-panel-accent: var(--theme-primary-color, var(--color-primary, #3390ec));
      position: relative;
      display: none; flex-direction: column; box-sizing: border-box; width: 100%; margin-top:4px;
      overflow: hidden; border: 1px solid var(--tf3-border, rgba(0,0,0,.1)); border-radius: 14px;
      background: var(--tf3-surface, #ffffff); color: var(--tf3-text, #111418);
      box-shadow: 0 10px 30px -5px rgba(0,0,0,.18), 0 2px 6px -1px rgba(0,0,0,.08);
      font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: tf3-panel-in .15s cubic-bezier(.16,1,.3,1);
    }
    #tf3-panel.tf3-dark, .theme-dark #tf3-panel {
      background: #1e1f23 !important; color: #f1f3f5 !important;
      border: 1px solid rgba(255,255,255,.1) !important;
      box-shadow: 0 16px 36px -4px rgba(0,0,0,.6), 0 4px 12px rgba(0,0,0,.35) !important;
    }
    @keyframes tf3-panel-in { from { opacity: 0; transform: translateY(8px) scale(.98); } }
    #tf3-panel .h { display:flex; justify-content:space-between; align-items:center; padding:10px 12px 2px 14px; font-weight:650; }
    #tf3-panel .hl,#tf3-panel .hr { display:flex; align-items:center; gap:4px; }
    #tf3-panel .b { padding:4px 14px 12px; }
    #tf3-panel .pb { height:6px; margin:8px 0; overflow:hidden; border-radius:999px; background:color-mix(in srgb, currentColor 10%, transparent); }
    #tf3-panel .pf { width:100%; height:100%; border-radius:inherit; background:var(--tf3-panel-accent); transform:scaleX(0); transform-origin:left center; transition:transform .16s linear; }
    #tf3-panel .fn { margin-top:5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12.5px; font-weight:600; }
    #tf3-panel .st { margin-top:2px; color:var(--tf3-muted, #707579); font-size:11px; }
    #tf3-panel .cc,#tf3-panel .pp,#tf3-panel .rr,#tf3-panel .xx,.tf3-sx { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; padding:0; border:0; border-radius:6px; background:transparent; color:inherit; opacity:.72; cursor:pointer; font-size:15px; transition:background .12s,opacity .12s; }
    #tf3-panel .cc:hover { color:#e0443e; opacity:1; background:rgba(224,68,62,.12); }
    #tf3-panel .pp:hover,#tf3-panel .rr:hover,#tf3-panel .xx:hover,.tf3-sx:hover { opacity:1; background:color-mix(in srgb, currentColor 8%, transparent); }
    #tf3-panel .cc:active,#tf3-panel .pp:active,#tf3-panel .rr:active,#tf3-panel .xx:active,.tf3-sx:active { transform:scale(.95); }

    /* Right-click actions */
    .tf3-ctx-icon { flex:0 0 24px; width:24px; margin-right:16px; text-align:center; font-size:16px; line-height:1; }
    .tf3-ctx-action:not(.btn-menu-item) { display:flex; align-items:center; min-height:38px; padding:6px 14px; border:0; background:transparent; color:inherit; cursor:pointer; font:inherit; }
    .tf3-ctx-action:not(.btn-menu-item):hover { background:color-mix(in srgb, currentColor 6%, transparent); }
    .tf3-ctx-text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; font-weight:500; }

    /* ═══ DIALOG OVERLAYS ═══ */
    #tf3-overlay {
      --tf3-dialog-bg: #ffffff;
      --tf3-dialog-text: #111418;
      --tf3-dialog-muted: #6e7379;
      --tf3-dialog-soft: #f4f5f7;
      --tf3-dialog-line: rgba(0,0,0,.08);
      position: fixed; inset: 0; z-index: 99999; box-sizing: border-box;
      display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 20px;
      background: rgba(0,0,0,.4); animation: tf3-fade-in .12s ease-out;
    }
    #tf3-overlay.tf3-dark {
      --tf3-dialog-bg: #1c1e21;
      --tf3-dialog-text: #f1f3f5;
      --tf3-dialog-muted: #8d9399;
      --tf3-dialog-soft: #26292d;
      --tf3-dialog-line: rgba(255,255,255,.08);
      background: rgba(0,0,0,.62);
    }
    @keyframes tf3-fade-in { from { opacity:0; } }
    .tf3-card {
      box-sizing: border-box; width: min(440px, 92vw); max-height: 85vh; overflow-y: auto; overscroll-behavior: contain;
      padding: 18px 20px; border: 1px solid var(--tf3-dialog-line); border-radius: 16px;
      background: var(--tf3-dialog-bg); color: var(--tf3-dialog-text);
      box-shadow: 0 16px 40px -8px rgba(0,0,0,.22), 0 4px 12px rgba(0,0,0,.06);
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .tf3-card button,.tf3-card input,.tf3-card output { font:inherit; }
    .tf3-sh { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:36px; margin-bottom:14px; }
    .tf3-title-wrap { display:flex; align-items:center; min-width:0; gap:10px; }
    .tf3-title-wrap > span:last-child { display:flex; flex-direction:column; min-width:0; }
    .tf3-title-wrap strong { font-size:14.5px; font-weight:700; letter-spacing:-0.01em; }
    .tf3-title-wrap small { margin-top:1px; color:var(--tf3-dialog-muted); font-size:11px; font-weight:450; }
    .tf3-title-icon { display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; width:32px; height:32px; border-radius:8px; background:color-mix(in srgb,var(--theme-primary-color,#3390ec) 12%,transparent); color:var(--theme-primary-color,#3390ec); font-size:16px; }
    .tf3-sx { flex:0 0 auto; margin:-3px -3px -3px 6px; }

    .tf3-history-link { box-sizing:border-box; width:100%; border:1px solid transparent; border-radius:10px; background:var(--tf3-dialog-soft); display:grid; grid-template-columns:28px minmax(0,1fr) auto; align-items:center; gap:10px; padding:10px 12px; color:var(--tf3-dialog-text); text-align:left; cursor:pointer; transition:background .12s,border-color .12s; }
    .tf3-history-link:hover { border-color:color-mix(in srgb,var(--theme-primary-color,#3390ec) 30%,transparent); background:color-mix(in srgb,var(--theme-primary-color,#3390ec) 8%,var(--tf3-dialog-soft)); }
    .tf3-history-link > span:first-child { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:6px; color:var(--theme-primary-color,#3390ec); background:color-mix(in srgb,var(--theme-primary-color,#3390ec) 12%,transparent); }
    .tf3-chevron { color:var(--tf3-dialog-muted); font-size:20px; line-height:1; }
    .tf3-search { box-sizing:border-box; width:100%; min-height:36px; margin:0 0 10px; padding:8px 12px; border:1px solid var(--tf3-dialog-line); border-radius:8px; outline:none; background:var(--tf3-dialog-soft); color:var(--tf3-dialog-text); font-size:12.5px; transition:border-color .14s; }
    .tf3-search::placeholder { color:var(--tf3-dialog-muted); }
    .tf3-search:focus { border-color:var(--theme-primary-color,#3390ec); }
    .tf3-search:disabled { opacity:.5; }
    .tf3-note { margin:12px 2px 0; color:var(--tf3-dialog-muted); font-size:11px; line-height:1.45; }

    .tf3-hl { display:flex; flex-direction:column; gap:6px; max-height:340px; overflow-y:auto; }
    .tf3-empty { padding:24px 12px; text-align:center; color:var(--tf3-dialog-muted); }
    .tf3-hi { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; padding:9px 11px; border-radius:8px; background:var(--tf3-dialog-soft); font-size:12px; }
    .tf3-ht { color:var(--tf3-dialog-muted); font:600 10.5px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:nowrap; }
    .tf3-hc { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
    .tf3-hf { color:var(--theme-primary-color,#3390ec); font-weight:650; white-space:nowrap; }
    .tf3-hf.has-failures { color:#e58500; }
    .tf3-dialog-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:14px; padding-top:12px; border-top:1px solid var(--tf3-dialog-line); }
    .tf3-dialog-actions-end { justify-content:flex-end; }
    .tf3-btn { min-height:32px; padding:0 14px; border:1px solid transparent; border-radius:8px; cursor:pointer; font-size:12px; font-weight:600!important; transition:background .12s,color .12s; }
    .tf3-btn:active { transform:scale(.98); }
    .tf3-btn:disabled { opacity:.4; cursor:default; }
    .tf3-btn-primary { background:var(--theme-primary-color,#3390ec); color:#fff; }
    .tf3-btn-primary:hover { background:color-mix(in srgb,var(--theme-primary-color,#3390ec) 90%,#000); }
    .tf3-btn-danger { background:rgba(224,68,62,.12); color:#e0443e; }
    .tf3-btn-danger:hover:not(:disabled) { background:#e0443e; color:#fff; }

    .tf3-ctrl button:focus-visible, .tf3-card button:focus-visible, #tf3-panel button:focus-visible {
      outline: 2px solid var(--theme-primary-color, #3390ec); outline-offset: 1px;
    }
    @media (max-width:760px) {
      .tf3-ctrl { padding-inline:6px; }
      .tf3-pw { gap:4px; margin-left:6px; }
      .tf3-aw { gap:4px; margin-left:auto; padding-left:6px; }
      .tf3-pill { padding-inline:8px; }
      .tf3-download-pill { min-width:96px; }
    }
    @media (max-width:560px) {
      .tf3-pill-label { display:none; }
      .tf3-filter-pill { position:relative; width:32px; padding-inline:0; }
      .tf3-all-pill { width:auto; padding-inline:8px; }
      .tf3-cat-count { position:absolute; transform:translate(8px,-8px); padding:1px 4px; }
      .tf3-card { width:min(440px,96vw); padding:14px; }
    }

    /* Library UI */
    .tf3-library-chips { display:flex; flex-wrap:wrap; gap:4px; margin:6px 0 10px; }
    .tf3-mini-chip { min-height:26px; padding:0 9px; border:1px solid var(--tf3-dialog-line); border-radius:6px;
      background:var(--tf3-dialog-soft); color:var(--tf3-dialog-text); cursor:pointer; font-size:11.5px; font-weight:600; transition:background .12s,color .12s; }
    .tf3-mini-chip.active { background:var(--theme-primary-color,#3390ec); border-color:transparent; color:#fff; }
    .tf3-library-card { width:min(680px,94vw); }
    .tf3-library-list { display:flex; flex-direction:column; gap:6px; max-height:min(55vh,500px); overflow:auto; overscroll-behavior:contain; }
    .tf3-library-row { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; background:var(--tf3-dialog-soft); }
    .tf3-library-main { display:flex; flex-direction:column; min-width:0; }
    .tf3-library-main strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:600; }
    .tf3-library-main small { margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--tf3-dialog-muted); font-size:10.5px; }
    .tf3-library-limit { padding:8px 4px 2px; text-align:center; color:var(--tf3-dialog-muted); font-size:10.5px; }
    .tf3-error-list { max-height:300px; }
    .tf3-error-row { display:flex; flex-direction:column; gap:2px; padding:8px 10px; border-radius:8px; background:var(--tf3-dialog-soft); }
    .tf3-error-row strong { font-size:11.5px; }
    .tf3-error-row small { color:var(--tf3-dialog-muted); font-size:10.5px; overflow-wrap:anywhere; }
    @media (max-width:560px) {
      .tf3-library-card { width:96vw; }
      .tf3-library-row { grid-template-columns:1fr; }
      .tf3-library-row .tf3-row-actions { justify-content:flex-end; }
    }

    .tf3-library-toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
    .tf3-library-toolbar .tf3-library-chips { margin:0; }
    .tf3-workspace-card { display:flex; flex-direction:column; gap:3px; margin-bottom:10px; padding:9px 11px; border:1px solid var(--tf3-dialog-line); border-radius:8px; background:var(--tf3-dialog-soft); }
    .tf3-workspace-main { display:flex; flex-direction:column; min-width:0; }
    .tf3-workspace-main strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:650; }
    .tf3-workspace-main small { margin-top:1px; color:var(--tf3-dialog-muted); font-size:10.5px; }
    .tf3-timeline-title { position:sticky; top:0; z-index:1; padding:6px 2px 4px; background:var(--tf3-dialog-bg); color:var(--tf3-dialog-muted); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
    .tf3-tagline { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
    .tf3-tag { padding:1px 6px; border-radius:4px; background:color-mix(in srgb,var(--theme-primary-color,#3390ec) 10%,transparent); color:var(--theme-primary-color,#3390ec); font-size:9.5px; font-weight:600; }

    /* Ack Toast */
    #tf3-action-ack { position:fixed; z-index:100000; min-width:110px; max-width:200px; padding:6px 10px; border-radius:8px; pointer-events:none; text-align:center; background:#1a1c1e; color:#ffffff; border:1px solid rgba(255,255,255,.1); box-shadow:0 6px 18px rgba(0,0,0,.25); font:650 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; will-change:transform,opacity; }
    #tf3-action-ack[data-tone="ok"] { background:#16733c; border-color:transparent; }
    #tf3-action-ack[data-tone="danger"] { background:#b8322d; border-color:transparent; }
    @media (max-width:560px) { .tf3-library-toolbar { align-items:flex-start; flex-direction:column; } }
    @media (prefers-reduced-motion:reduce) { .tf3-pill,#tf3-panel,#tf3-panel .pf,#tf3-overlay,.tf3-sx,.tf3-btn,.tf3-download-pill { animation:none!important; transition:none!important; } }
  `;
    document.documentElement.appendChild(css);

    const adaptCss = document.createElement('style');
    adaptCss.id = 'tf3-adapt-css';
    adaptCss.textContent = `
    #column-center > .chat > .tf3-ctrl,
    #column-center .chat .tf3-ctrl {
      position:relative; z-index:5; flex-shrink:0;
      width:auto; max-width:100%; margin:0; padding:4px 8px; box-sizing:border-box;
      background:var(--surface-color,#fff);
      border-bottom:1px solid color-mix(in srgb,var(--theme-border-color,#e0e0e0) 45%,transparent);
    }
    .theme-dark #column-center > .chat > .tf3-ctrl,
    .theme-dark #column-center .chat .tf3-ctrl { background:var(--surface-color,#1c1c1e); }

    #MiddleColumn .messages-layout > .tf3-ctrl {
      position:relative; z-index:5; flex-shrink:0;
      width:100%; margin-top:var(--middle-panel-inline-padding,.5rem);
      border-radius:0;
      background:var(--color-background,var(--surface-color,#fff));
      box-shadow:none; box-sizing:border-box;
    }

    .theme-dark #MiddleColumn .messages-layout > .tf3-ctrl { background:var(--color-background,var(--surface-color,#1c1c1e)); }
  `;
    document.documentElement.appendChild(adaptCss);
    return true;
  }

  /* ─── TEST HOOKS ──────────────────── */
  if ((W.__TF5_TEST_MODE__ === true || W.__TF4_TEST_MODE__ === true || W.__TF3_TEST_MODE__ === true) && navigator?.userAgent === 'telefilter-node-test') {
    const testExport = Object.freeze({
      VERSION, locatorCtxFrom, sameLocatorContext, makeLocatorOptions,
      messagePeerId, requireRenderedTarget, getNativeSelectedMessages, selectionPeerIds,
      loadStorage,
      setDomMode: value => { isNewWebKDOM = Boolean(value); },
      resetAndScanMedia, reconcileMediaBubble,
      counterSnapshot: () => ({ mediaCount: S.mediaCount, catCounts: { ...S.catCounts } }),
      getBookmarkKeys: () => [...S.bmKeys],
      isMediaBubble,
      patchCtxMenu,
      addBookmark,
      removeBookmark,
      LIMITS,
      // V5 new exports
      createStoredZip, crc32Bytes, CRC32_TABLE, dosTimestamp,
      TelefilterVault, formatSmartFileName, sanitizeFileName,
      getMessageReactionCount, runDeepHarvester,
    });
    W.__TF5_TEST__ = testExport;
    W.__TF4_TEST__ = testExport;
    W.__TF3_TEST__ = testExport;
  }

  /* ─── INITIALIZATION ──────────────── */
  async function init() {
    debug(`v${VERSION} init`);
    loadStorage();
    await TelefilterVault.init();
    mountStyles();
    enableProtectedContentUnblocker();
    watchThemeChanges();
    watchMediaViewer();
    const col = findColumn();
    if (col) { watchColumn(col); scheduleInject(0); }
    else {
      const obs = new MutationObserver(() => {
        const c = findColumn();
        if (c) { obs.disconnect(); watchColumn(c); scheduleInject(0); }
      });
      obs.observe(document.body, { subtree: true, childList: true });
    }
    debug('active');
  }

  function start() {
    if (!document.documentElement) { setTimeout(start, 0); return; }
    mountStyles();
    init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else start();
})();
