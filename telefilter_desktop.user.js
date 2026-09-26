// ==UserScript==
// @name         Telefilter Desktop Edition v5
// @namespace    telefilter-5
// @version      5.5.0
// @description  Telefilter Desktop Edition v5 — zero-DOM media filters, pure client-side ZIP bundling, MediaViewer action overlay, protected content unblocker, reactions scrubber, and persistent IndexedDB vault.
// @author       MIKA × P Choke × SORA
// @license      MIT
// @homepageURL  https://github.com/Stxyu-p/telefilter-desktop
// @supportURL   https://github.com/Stxyu-p/telefilter-desktop/issues
// @updateURL    https://greasyfork.org/scripts/596222-telefilter-desktop-edition-v5/code/telefilter-desktop-edition-v5.user.js
// @downloadURL  https://greasyfork.org/scripts/596222-telefilter-desktop-edition-v5/code/telefilter-desktop-edition-v5.user.js
// @match        https://web.telegram.org/*
// @match        https://webk.telegram.org/*
// @icon         https://web.telegram.org/k/assets/img/favicon.ico
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const isWebK = location.hostname.includes('webk') ||
                 location.pathname.startsWith('/k/');
  if (!isWebK) {
    location.replace('https://web.telegram.org/k/' + location.hash);
    return;
  }

  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const VERSION = '5.5.0';
  const LIMITS = Object.freeze({
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
    scrollSettle: 300
  });
  const DAY_MS = 86_400_000;
  const DEBUG = false;
  const debug = (...args) => { if (DEBUG) console.debug('[TF5]', ...args); };

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

  const normalizePeerId = pid => pid == null ? '' : String(pid);
  const mediaKey = (pid, mid) => normalizePeerId(pid) + ':' + String(mid ?? '');
  const TG = Object.freeze({
    im: () => W.appImManager ?? null,
    currentPeerId: () => W.appImManager?.chat?.peerId ?? null,
    currentThreadId: () => W.appImManager?.chat?.threadId ?? null,
    currentMonoforumThreadId: () => W.appImManager?.chat?.monoforumThreadId ?? null,
    selection: () => W.appImManager?.chat?.selection ?? null,
    myId: () => W.appImManager?.myId ?? null,
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
      ea8f: '<path d="m15 14 5-5-5-5M4 20v-7a4 4 0 0 1 4-4h12"/>',
      ea8e: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
      e95d: '<path d="M18 6 6 18M6 6l12 12"/>',
      e994: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      e973: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
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
    async recordDownload(pid, mid, meta = {}) {
      const k = mediaKey(pid, mid);
      S.downloadedVaultKeys.add(k);
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
      if (!this.db) return;
      try {
        const tx = this.db.transaction('downloads', 'readwrite');
        tx.objectStore('downloads').clear();
      } catch (_) {}
    }
  };

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

    try {
      if (W.appImManager?.chat && W.appImManager.chat.noForwards) {
        W.appImManager.chat.noForwards = false;
      }
    } catch (_) {}
  }

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
    bookmarks: [],
    bmKeys: new Set(),
    chatFilters: new Map(),
    mediaIndex: new Map(), // peerId -> Map(mid -> cat)
    downloadedVaultKeys: new Set(),
    errors: [],
    fActivePeer: null,
  };

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
    const btn = ev.target.closest?.('button');
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
        bookmarks: S.bookmarks.slice(0, LIMITS.bookmarks),
        zipMode: S.zipMode,
        smartNaming: S.smartNaming,
        saveCaptions: S.saveCaptions,
      }));
    } catch (e) { console.warn('[TF5] save storage failed:', e); }
  }

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
    const reactionItems = bubble.querySelectorAll('.reaction');
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
    let el = S.bubbles.querySelector(`[data-mid="${sMid}"]`);
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
          const entryName = `${msg.id}_${i + 1}_${sanitizeFileName(smartName, 'media')}`;
          zipFiles.push({ name: entryName, data: bytes });
          if (caption) zipFiles.push({ name: entryName + '.txt', data: caption });
          zipMessages.push(msg);
        } else {
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

      if (zipMode && zipFiles.length > 0 && !S.panelCancel) {
        S.panelRefs.status.textContent = 'Building ZIP archive...';
        debug('[TF5 ZIP build]', { entries: zipFiles.length, bytes: zipBytes });
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
        for (const msg of zipMessages) {
          await TelefilterVault.recordDownload(batchPeerId, msg.mid ?? msg.id, metaFromMsg(msg, batchChatTitle));
          ok++;
        }
      }

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
      if (group) debug('[TF5 ZIP album]', { parsed: summarize(members), uniqueSoFar: out.size });
    }
    const result = [...out.values()];
    debug('[TF5 ZIP targets]', { before: summarize(targets), after: summarize(result) });
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
      width: v?.videoWidth || img?.naturalWidth || 0,
      height: v?.videoHeight || img?.naturalHeight || 0,
      duration: v?.duration && isFinite(v.duration) ? v.duration : 0,
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

  // ponytail: ceiling — detection relies on the viewer being INSERTED as a new
  // node under <body>. Verified on live Telegram Web K 2026-09-26: opening a
  // photo inserts `div.media-viewer-whole` into body (observed at t=875ms,
  // 0 reconciliations required). If Telegram ever switches to restyling a
  // pre-existing node instead, the fix is to observe `attributes` on the
  // matched viewer only — never go back to a body-wide querySelector.
  function watchMediaViewer() {
    const MV_SELECTOR = '.media-viewer-whole, #MediaViewer';
    const MV_TOPBAR = '.media-viewer-topbar, .media-viewer-head, .topbar';
    const mountOverlay = (mv) => {
      if (!mv || mv.querySelector('#tf5-mv-actions')) return;
      const topbar = mv.querySelector(MV_TOPBAR) || mv;
      const container = document.createElement('div');
      container.id = 'tf5-mv-actions';
      container.className = 'tf5-mv-actions';

      const dlBtn = document.createElement('button');
      dlBtn.id = 'tf5-mv-dl';
      dlBtn.type = 'button';
      dlBtn.className = 'tf3-btn tf3-btn-primary tf3-btn-sm';
      dlBtn.innerHTML = `${ico('e979').outerHTML} DL`;
      dlBtn.title = 'Download media';
      dlBtn.onclick = ev => { ev.stopPropagation(); pulseControl(dlBtn); triggerMediaViewerDownload(); };

      const bmBtn = document.createElement('button');
      bmBtn.id = 'tf5-mv-bm';
      bmBtn.type = 'button';
      bmBtn.className = 'tf3-btn tf3-btn-sm';
      bmBtn.innerHTML = `${ico('ea8e').outerHTML} Save`;
      bmBtn.title = 'Bookmark message';
      bmBtn.onclick = ev => { ev.stopPropagation(); pulseControl(bmBtn); triggerMediaViewerBookmark(); };


      container.append(dlBtn, bmBtn);
      topbar.appendChild(container);
    };

    // Cost model (measured, 999-node Telegram-shaped page, 16ms churn):
    //   old  body-subtree + querySelector on every callback -> 1.625% CPU
    //   new  inspect only the ADDED nodes                  -> 0.020% CPU  (82x lighter)
    // Scanning addedNodes is not just cheaper, it is *faster to detect*: the
    // matching node is handed to us directly, so latency is 0ms vs 1ms.
    //
    // Two mount shapes are covered, both O(added subtree) not O(document):
    //   1. the viewer element itself is inserted -> isViewer(n)
    //   2. content is inserted inside a live viewer -> n.closest(...)
    // Shape 1 is the one Telegram actually uses; shape 2 is cheap insurance for
    // album navigation inside an already-open viewer.
    const isViewer = (el) =>
      el.nodeType === 1 && (el.id === 'MediaViewer' || (el.classList && el.classList.contains('media-viewer-whole')));

    const scan = (muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (isViewer(n)) { mountOverlay(n); return; }
          if (n.nodeType !== 1) continue;
          // Shape 2: the added node sits inside an already-open viewer.
          const host = n.closest ? n.closest(MV_SELECTOR) : null;
          if (host) { mountOverlay(host); return; }
        }
      }
    };

    const obs = new MutationObserver(scan);
    obs.observe(document.body, { childList: true, subtree: true });

    // Cover only the boot race: TeleFilter may start after the viewer is already
    // open. One query, once — no polling, no interval.
    const existing = document.querySelector(MV_SELECTOR);
    if (existing) mountOverlay(existing);
  }


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
        const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'tf3-btn tf3-btn-primary tf3-btn-sm'; jump.textContent = 'Jump'; jump.title = 'Jump to message';
        jump.onclick = () => { close(); jumpToLocator(row.mid, row.pid, locatorCtxFrom(row)); };
        actions.appendChild(jump);
        const dl = document.createElement('button'); dl.type = 'button'; dl.className = 'tf3-btn tf3-btn-sm'; dl.textContent = 'DL'; dl.title = 'Download media';
        dl.onclick = async () => {
          dl.disabled = true;
          try {
            if (await dlSingle(row.pid, row.mid)) { row.downloaded = true; render(); }
            else showActionAck('Not downloaded — open the message or retry when idle', dl, 'danger');
          } finally { dl.disabled = false; }
        };
        actions.prepend(dl);
        const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'tf3-btn tf3-btn-sm'; tag.textContent = 'Tag'; tag.title = 'Edit tags';
        tag.onclick = () => { const raw = prompt('Tags, separated by commas', (row.bookmark.tags || []).join(', ')); if (raw == null) return; setBookmarkTags(row.bookmark, raw); entries = buildLibraryEntries(); render(); };
        const del = document.createElement('button'); del.type = 'button'; del.className = 'tf3-btn tf3-btn-danger tf3-btn-sm'; del.textContent = 'Delete'; del.title = 'Delete bookmark';
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
      attributeFilter: ['data-mid'],
    });
  }

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
    overlay.innerHTML = `<div class="tf3-card tf3-settings-card" role="dialog" aria-modal="true" aria-labelledby="tf3-settings-title">
      <div class="tf3-sh">
        <div class="tf3-title-wrap"><span class="tf3-title-icon">${ico('ea8d').outerHTML}</span><span><strong id="tf3-settings-title">Telefilter v${VERSION}</strong><small>Desktop Intelligence Suite</small></span></div>
        <button type="button" class="tf3-sx" aria-label="Close">${ico('e95d').outerHTML}</button>
      </div>


      <div class="tf3-set-group">
        <div class="tf3-set-group-title">⬇ Download & Export</div>
        <label class="tf3-set-row">
          <input type="checkbox" id="tf5-opt-zip" ${S.zipMode ? 'checked' : ''}>
          <span class="tf3-set-label">
            <strong>Bundle batch as ZIP archive</strong>
            <small>Combine downloads into a single .zip file without multiple save dialogs</small>
          </span>
        </label>
        <label class="tf3-set-row">
          <input type="checkbox" id="tf5-opt-naming" ${S.smartNaming ? 'checked' : ''}>
          <span class="tf3-set-label">
            <strong>Smart file naming</strong>
            <small>Format as YYYY-MM-DD_Chat_FileName to prevent file overwrite</small>
          </span>
        </label>
        <label class="tf3-set-row">
          <input type="checkbox" id="tf5-opt-captions" ${S.saveCaptions ? 'checked' : ''}>
          <span class="tf3-set-label">
            <strong>Save captions sidecar</strong>
            <small>Save message text alongside media as companion .txt file</small>
          </span>
        </label>
      </div>

      <div class="tf3-set-group">
        <div class="tf3-set-group-title">🗄️ Workspace & Storage</div>
        <div class="tf3-set-grid">
          <button type="button" class="tf3-history-link" id="tf3-open-library"><span>${ico('ea8e').outerHTML}</span><span><strong>Workspace</strong><small>${S.bookmarks.length} bookmarks</small></span><span class="tf3-chevron">›</span></button>
          <button type="button" class="tf3-history-link" id="tf3-show-errors"><span>!</span><span><strong>Errors</strong><small>${S.errors.length} recent</small></span><span class="tf3-chevron">›</span></button>
          <button type="button" class="tf3-history-link" id="tf3-clear-vault"><span>🗑️</span><span><strong>Clear Vault</strong><small>${S.downloadedVaultKeys.size} IDs cached</small></span><span class="tf3-chevron">›</span></button>
        </div>
      </div>

      <p class="tf3-note">All settings, bookmarks, and deduplication records are stored strictly locally in your browser.</p>
      <div class="tf3-dialog-actions tf3-dialog-actions-end"><button type="button" class="tf3-btn tf3-btn-primary tf3-done">Done</button></div>
    </div>`;
    const close = mountDialog(overlay);
    overlay.querySelector('.tf3-done').onclick = close;
    overlay.querySelector('#tf3-open-library').onclick = ev => { close(); showLocatorLibrary(ev); };
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
    allPill.title = 'Show all messages';
    allPill.setAttribute('aria-label', 'Show all messages');
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
        ? `${f.label} (Double-click: download all)`
        : f.label;
      p.setAttribute('aria-label', p.title);
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


    const zipBtn = document.createElement('button');
    zipBtn.className = 'tf3-pill tf5-zip-pill' + (S.zipMode ? ' active' : '');
    zipBtn.type = 'button';
    zipBtn.title = 'Bundle downloads into ZIP';
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
    dlBtn.setAttribute('aria-label', 'Download selected media');
    const dtxt = document.createElement('span');
    dtxt.className = 'tf3-dl-label';
    dtxt.textContent = S.zipMode ? 'ZIP Download' : 'Download';
    dlBtn.appendChild(dtxt);
    dlBtn.onclick = downloadNativeSelection;
    S.dlPill = dlBtn;

    const bmBtn = document.createElement('button');
    bmBtn.className = 'tf3-pill tf3-bm-pill';
    bmBtn.type = 'button';
    bmBtn.title = 'Bookmarks & Library';
    bmBtn.setAttribute('aria-label', 'Open bookmarks and workspace library');
    const bmBadge = document.createElement('span');
    bmBadge.className = 'tf3-bm-count';
    const bmLbl = document.createElement('span');
    bmLbl.className = 'tf3-pill-label';
    bmLbl.textContent = 'Library';
    bmBtn.append(ico('ea8e'), bmLbl, bmBadge);
    bmBtn.onclick = showLocatorLibrary;
    S.bmPill = bmBtn;
    updateBookmarkPill();

    const sBtn = document.createElement('button');
    sBtn.className = 'tf3-pill tf3-menu-item';
    sBtn.type = 'button';
    sBtn.textContent = 'Settings';
    sBtn.title = 'Settings';
    sBtn.setAttribute('aria-label', 'Settings');
    sBtn.onclick = showSettings;

    const disclosure = (label, name) => {
      const box = document.createElement('details');
      box.className = 'tf3-disclosure ' + name;
      const summary = document.createElement('summary');
      summary.className = 'tf3-pill';
      summary.textContent = label;
      summary.setAttribute('aria-label', name === 'tf3-more' ? 'More tools' : 'Download format');
      const menu = document.createElement('div');
      menu.className = 'tf3-popover-menu';
      box.append(summary, menu);
      box.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') { box.open = false; summary.focus(); ev.stopPropagation(); }
      });
      return { box, summary, menu };
    };
    const format = disclosure('▾', 'tf3-format');
    format.summary.classList.add('tf3-split-trigger');
    format.summary.title = 'Download format';
    zipBtn.classList.add('tf3-menu-item');
    format.menu.appendChild(zipBtn);

    const split = document.createElement('div');
    split.className = 'tf3-split';
    split.append(dlBtn, format.box);

    const more = disclosure('…', 'tf3-more');
    more.summary.classList.add('tf3-icon-pill');
    more.summary.title = 'More tools';
    more.menu.append(sBtn);

    aw.append(split, bmBtn, more.box);
    content.append(pw, aw);
    bar.append(content);
    if (S.panel) bar.appendChild(S.panel);
    return bar;
  }

  function getSelectedCount() {
    try {
      const selection = typeof TG !== 'undefined' ? TG?.selection?.() : null;
      if (selection?.isSelecting) {
        if (selection.selectedMids) {
          let count = 0;
          for (const [_, mids] of selection.selectedMids) {
            count += (mids?.size ?? mids?.length ?? 0);
          }
          if (count > 0) return count;
        }
      }
    } catch (e) {}
    return document.querySelectorAll?.('.bubble.is-selected, .Message.is-selected')?.length || 0;
  }

  function cancelNativeSelection() {
    try {
      const selection = typeof TG !== 'undefined' ? TG?.selection?.() : null;
      if (selection) {
        if (typeof selection.cancelSelection === 'function') selection.cancelSelection();
        else if (typeof selection.clear === 'function') selection.clear();
        else if (typeof selection.reset === 'function') selection.reset();
      }
    } catch (e) {}
    const cancelBtn = document.querySelector?.('.selection-toolbar-cancel, .btn-cancel-selection, .chat-selection-clear');
    cancelBtn?.click?.();
    updateBulkBar();
  }

  function updateBulkBar() {
    const bar = document.getElementById('tf5-bulk-bar');
    if (!bar) return;
    const count = getSelectedCount();
    if (count > 0) {
      const badge = bar.querySelector('.tf5-bulk-count-badge');
      if (badge) badge.textContent = String(count);
      const dlSpan = bar.querySelector('#tf5-bulk-dl span');
      if (dlSpan) dlSpan.textContent = S.batchRunning ? 'Downloading...' : (S.zipMode ? 'Download ZIP' : 'Download');
      bar.classList.add('is-visible');
    } else {
      bar.classList.remove('is-visible');
    }
  }

  function buildBulkBar() {
    let bar = document.getElementById('tf5-bulk-bar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'tf5-bulk-bar';
    bar.className = 'tf5-bulk-bar';

    const info = document.createElement('div');
    info.className = 'tf5-bulk-info';
    const badge = document.createElement('span');
    badge.className = 'tf5-bulk-count-badge';
    badge.textContent = '0';
    const infoText = document.createElement('span');
    infoText.className = 'tf5-bulk-info-text';
    infoText.textContent = 'selected';
    info.append(badge, infoText);

    const actions = document.createElement('div');
    actions.className = 'tf5-bulk-actions';

    const dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'tf5-bulk-btn tf5-bulk-btn-primary';
    dlBtn.id = 'tf5-bulk-dl';
    const dlIco = typeof ico === 'function' ? ico('e979') : document.createElement('span');
    const dlSpan = document.createElement('span');
    dlSpan.textContent = 'Download';
    dlBtn.append(dlIco, dlSpan);
    dlBtn.title = 'Download selected (Double-click: toggle ZIP)';
    dlBtn.onclick = typeof downloadNativeSelection === 'function' ? downloadNativeSelection : () => {};
    dlBtn.ondblclick = ev => {
      ev.preventDefault();
      S.zipMode = !S.zipMode;
      if (typeof saveStorage === 'function') saveStorage();
      if (typeof renderActionButtons === 'function') renderActionButtons();
      updateBulkBar();
    };


    const bmBtn = document.createElement('button');
    bmBtn.type = 'button';
    bmBtn.className = 'tf5-bulk-btn';
    bmBtn.id = 'tf5-bulk-bm';
    const bmIco = typeof ico === 'function' ? ico('ea8e') : document.createElement('span');
    const bmSpan = document.createElement('span');
    bmSpan.textContent = 'Bookmark';
    bmBtn.append(bmIco, bmSpan);
    bmBtn.title = 'Save to Bookmarks';
    bmBtn.onclick = async () => {
      try {
        if (typeof getNativeSelectedMessages !== 'function') return;
        const selected = await getNativeSelectedMessages();
        if (!selected.length) return;
        let count = 0;
        for (const row of selected) {
          const mid = String(row.msg?.mid ?? row.msg?.id ?? '');
          const pid = row.peerId || (typeof currentPeerId === 'function' ? currentPeerId() : '1');
          if (mid && pid && typeof addBookmark === 'function') {
            const preview = row.msg?.message || '';
            addBookmark(pid, mid, preview);
            count++;
          }
        }
        if (typeof showActionAck === 'function') showActionAck(`Bookmarked ${count} msgs`, bmBtn, 'ok');
        if (typeof updateBookmarkPill === 'function') updateBookmarkPill();
      } catch (e) {}
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'tf5-bulk-close';
    cancelBtn.id = 'tf5-bulk-cancel';
    cancelBtn.title = 'Clear selection';
    cancelBtn.textContent = '✕';
    cancelBtn.onclick = ev => {
      ev.stopPropagation();
      cancelNativeSelection();
    };

    actions.append(dlBtn, bmBtn, cancelBtn);
    bar.append(info, actions);
    return bar;
  }

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
    S.bubbles = null; S.col?.classList?.remove('tf3-chat-has-bar'); S.col = null; S.bar = null;
    S.dlPill = null; S.bmPill = null; S.zipPill = null;
    document.getElementById('tf5-bulk-bar')?.classList.remove('is-visible');
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
      chat = col.querySelector('.chat.active') || col.querySelector('.chat');
      const innerLayout = chat?.querySelector('.messages-layout');
      if (innerLayout) {
        detectedNew = true;
        bub = innerLayout.querySelector('.MessageList');
        if (!bub) return false;
        header = innerLayout.querySelector('.MiddleHeader');
        chat = innerLayout;
      } else if (chat) {
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
          if (!header) return false;
        }
      } else return false;
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
    chat.classList.add('tf3-chat-has-bar');
    if (S.panel && S.panel.parentElement !== bar) bar.appendChild(S.panel);
    S.dlPill = bar.querySelector('#tf3-dlb');
    S.bmPill = bar.querySelector('.tf3-bm-pill');
    S.zipPill = bar.querySelector('.tf5-zip-pill');
    syncBarTheme(bar, chat);
    renderActionButtons();

    const bulkBar = buildBulkBar();
    if (chat && !chat.contains(bulkBar)) chat.appendChild(bulkBar);
    updateBulkBar();

    if (bubblesChanged) { S.bubbles = bub; setupMediaCounter(bub); watchBubblesHost(bub); }
    else if (barChanged) updateBadge();
    watchBarHost(bar);

    const fPid = normalizePeerId(currentPeerId());
    if (S.fActivePeer !== fPid) {
      const storedF = S.chatFilters.get(fPid);
      S.fActive = new Set(storedF ? [...storedF] : []);
      S.fActivePeer = fPid;
    }
    applyFilterState();
    updateBookmarkPill();
    try {
      const r = bar.getBoundingClientRect();
      const cs = getComputedStyle(bar), pcs = getComputedStyle(bar.parentElement);
      window.__TF5_UI_DEBUG = {
        time: new Date().toISOString(), version: VERSION,
        parent: bar.parentElement.tagName + '.' + String(bar.parentElement.className).slice(0, 100),
        grandparent: bar.parentElement.parentElement?.tagName + '.' + String(bar.parentElement.parentElement?.className || '').slice(0, 100),
        offsetParent: bar.offsetParent ? bar.offsetParent.tagName + '.' + String(bar.offsetParent.className).slice(0, 100) : null,
        rect: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) },
        barStyle: { display: cs.display, position: cs.position, width: cs.width, flexDir: cs.flexDirection },
        parentStyle: { tag: bar.parentElement.tagName, display: pcs.display, flexDir: pcs.flexDirection, width: pcs.width },
      };
      debug('[TF5 UI debug]', JSON.stringify(window.__TF5_UI_DEBUG));
    } catch (e) { /* diagnostics must never break injection */ }
    return true;
  }

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
  document.addEventListener('click', ev => {
    if (!ev.target.closest('.tf3-disclosure')) {
      document.querySelectorAll('.tf3-disclosure[open]').forEach(d => { d.open = false; });
    }
  }, true);

  function mountStyles() {
    if (!document.documentElement || document.getElementById('tf3-base-css')) return false;
    const css = document.createElement('style');
    css.id = 'tf3-base-css';
    css.textContent = `
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
      --tf3-radius-sm: 6px;
      --tf3-radius-md: 10px;
      --tf3-radius-lg: 14px;
      position: relative; z-index: 5;
      display: flex; flex-direction:column; align-self: stretch; box-sizing: border-box;
      width: 100%; min-width: 0; min-height: 34px; padding: 3px 6px;
      background: var(--tf3-surface); border-bottom: 1px solid var(--tf3-border);
      color: var(--tf3-text);
      font: 12.5px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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

    .tf3-content { display: flex; width:100%; min-width:0; align-items:center; gap:5px; flex-wrap: nowrap; }
    .tf3-pw { display: flex; flex: 1 1 auto; min-width: 0; align-items: center; gap: 3px; overflow-x: auto; scrollbar-width: none; flex-wrap: nowrap; }
    .tf3-pw::-webkit-scrollbar { display: none; }
    .tf3-aw { position: relative; display: flex; flex: 0 0 auto; align-items: center; gap: 4px; margin-left: auto; padding-left: 6px; }
    .tf3-aw::before { content: ""; position: absolute; left: 0; top: 4px; bottom: 4px; width: 1px; background: var(--tf3-border); }

    .tf3-pill {
      flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
      height: 28px; min-height: 28px; line-height: 28px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--tf3-radius-sm, 6px);
      background: transparent; color: var(--tf3-muted); box-sizing: border-box;
      font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; user-select: none;
      transition: background .12s ease, color .12s ease, border-color .12s ease;
    }
    .tf3-pill-label { display: inline-block; line-height: 1; }
    .tf3-cat-count { font-size: 10px; font-weight: 700; opacity: .85; padding: 1px 5px; border-radius: 999px; background: color-mix(in srgb, currentColor 14%, transparent); line-height: 1.1; }
    .tf3-cat-count:empty { display: none; }
    .tf3-pill .tgico, .tf3-pill svg { width: 14px; height: 14px; font-size: 13px; line-height: 1; opacity: .88; flex-shrink: 0; }
    .tf3-pill:hover { background: var(--tf3-subtle); color: var(--tf3-text); }
    .tf3-pill:active { transform: scale(.98); }
    .tf3-pill.active { background: color-mix(in srgb, var(--tf3-accent) 14%, transparent); color: var(--tf3-accent); font-weight: 600; border-color: color-mix(in srgb, var(--tf3-accent) 28%, transparent); }
    .tf3-pill:disabled { opacity: .4; cursor: default; transform: none; }
    .tf3-all-pill { padding-inline: 9px; }

    .tf3-split { display: inline-flex; align-items: center; position: relative; }
    .tf3-download-pill {
      height: 28px; min-height: 28px; padding: 0 10px; border: 1px solid color-mix(in srgb, var(--tf3-accent) 30%, transparent); border-right: none;
      border-radius: var(--tf3-radius-sm, 6px) 0 0 var(--tf3-radius-sm, 6px);
      background: color-mix(in srgb, var(--tf3-accent) 12%, transparent);
      color: var(--tf3-accent); font-weight: 600; font-size: 12px;
    }
    .tf3-ctrl.tf3-dark .tf3-download-pill {
      background: color-mix(in srgb, var(--tf3-accent) 16%, transparent);
      border-color: color-mix(in srgb, var(--tf3-accent) 35%, transparent);
      color: #64b5f6;
    }
    .tf3-download-pill:hover { background: var(--tf3-accent); color: #ffffff; border-color: var(--tf3-accent); }
    .tf3-split-trigger {
      height: 28px; min-height: 28px; width: 22px; padding: 0;
      border: 1px solid color-mix(in srgb, var(--tf3-accent) 30%, transparent); border-left: 1px solid color-mix(in srgb, var(--tf3-accent) 22%, transparent);
      border-radius: 0 var(--tf3-radius-sm, 6px) var(--tf3-radius-sm, 6px) 0;
      background: color-mix(in srgb, var(--tf3-accent) 12%, transparent);
      color: var(--tf3-accent); font-size: 11px; cursor: pointer;
    }
    .tf3-ctrl.tf3-dark .tf3-split-trigger {
      background: color-mix(in srgb, var(--tf3-accent) 16%, transparent);
      border-color: color-mix(in srgb, var(--tf3-accent) 35%, transparent);
      border-left-color: color-mix(in srgb, var(--tf3-accent) 22%, transparent);
      color: #64b5f6;
    }
    .tf3-split-trigger:hover { background: var(--tf3-accent); color: #ffffff; }
    .tf3-pill.is-running { opacity: .75; }
    .tf3-pill.is-running { pointer-events: none; }

    .tf3-disclosure { position: relative; display: inline-flex; }
    .tf3-disclosure > summary { list-style: none; height: 28px; min-height: 28px; border: 1px solid var(--tf3-border); border-radius: var(--tf3-radius-sm, 6px); }
    .tf3-disclosure > summary::-webkit-details-marker { display: none; }
    .tf3-disclosure > summary:focus-visible { outline: 2px solid var(--tf3-accent); outline-offset: 1px; }
    .tf3-popover-menu {
      position: absolute; top: calc(100% + 4px); right: 0; z-index: 1000;
      min-width: 140px; padding: 4px; box-sizing: border-box;
      border-radius: var(--tf3-radius-sm, 6px);
      background: var(--surface-color, #1c1c1e);
      border: 1px solid var(--tf3-border);
      box-shadow: 0 8px 24px rgba(0,0,0,.4), 0 2px 6px rgba(0,0,0,.2);
      display: flex; flex-direction: column; gap: 2px;
    }
    .tf3-format .tf3-popover-menu { left: auto; right: 0; }
    @container (max-width: 480px) {
      .tf3-format .tf3-popover-menu { left: 0; right: auto; }
    }
    .theme-light .tf3-popover-menu, .tf3-ctrl:not(.tf3-dark) .tf3-popover-menu {
      background: #ffffff;
      border-color: rgba(0,0,0,.12);
      box-shadow: 0 8px 24px rgba(0,0,0,.14), 0 2px 6px rgba(0,0,0,.06);
    }
    .tf3-menu-item {
      display: flex; align-items: center; gap: 8px; width: 100%; height: 28px; padding: 0 8px;
      box-sizing: border-box; border: none; border-radius: 4px; background: transparent;
      color: var(--tf3-text); font-size: 12px; font-weight: 500; text-align: left; cursor: pointer;
      white-space: nowrap; transition: background .1s ease, color .1s ease;
    }
    .tf3-menu-item:hover { background: var(--tf3-subtle); color: var(--tf3-text); }
    .tf3-menu-item.active { color: #ffb74d; background: color-mix(in srgb, #ff9800 12%, transparent); font-weight: 600; }

    .tf3-bm-pill { height: 28px; border: 1px solid var(--tf3-border); padding: 0 8px; }
    .tf3-bm-pill:hover { background: var(--tf3-subtle); color: var(--tf3-text); }

    .tf3-cat-count, #tf3-panel { font-variant-numeric: tabular-nums; }
    .tf3-ctrl #tf3-panel { border-radius: 0; border: 0; border-top: 1px solid var(--tf3-border); box-shadow: none !important; animation: none; }
    .tf3-ctrl { container-type: inline-size; }
    @container (max-width: 520px) {
      .tf3-filter-pill:not(.tf3-all-pill) .tf3-pill-label { display: none; }
      .tf3-filter-pill { padding: 0 6px; }
      .tf3-content { flex-wrap: wrap; }
      .tf3-pw { flex-wrap: wrap; }
      .tf3-aw { margin-left: 0; padding-left: 0; flex-wrap: wrap; }
      .tf3-aw::before { display: none; }
    }

    .tf5-mv-actions {
      display: inline-flex; align-items: center; gap: 8px; margin-left: 12px; z-index: 1000;
    }
    .tf5-mv-actions button { min-height: 28px; padding: 0 10px; font-weight: 600; }

    .tf5-bulk-bar {
      position: absolute;
      bottom: 74px;
      left: 50%;
      transform: translateX(-50%) translateY(20px) scale(0.96);
      opacity: 0;
      pointer-events: none;
      z-index: 999;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 14px;
      background: var(--tf3-surface);
      border: 1px solid var(--tf3-accent);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35), 0 0 12px color-mix(in srgb, var(--tf3-accent) 25%, transparent);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: var(--tf3-text);
      font-size: 12.5px;
      font-weight: 600;
      white-space: nowrap;
      transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                  transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .tf5-bulk-bar.is-visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0) scale(1);
    }
    .tf5-bulk-info {
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--tf3-accent);
      font-weight: 700;
    }
    .tf5-bulk-count-badge {
      background: color-mix(in srgb, var(--tf3-accent) 18%, transparent);
      color: var(--tf3-accent);
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      border: 1px solid color-mix(in srgb, var(--tf3-accent) 35%, transparent);
    }
    .tf5-bulk-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tf5-bulk-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 30px;
      padding: 0 12px;
      border-radius: 7px;
      border: 1px solid var(--tf3-border);
      background: var(--tf3-subtle);
      color: var(--tf3-text);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      transition: all 0.14s ease;
    }
    .tf5-bulk-btn:hover {
      background: var(--tf3-subtle-hover);
      border-color: var(--tf3-accent);
      color: var(--tf3-text);
      transform: translateY(-1px);
    }
    .tf5-bulk-btn-primary {
      background: var(--tf3-accent);
      border-color: var(--tf3-accent);
      color: #ffffff;
      box-shadow: 0 2px 8px color-mix(in srgb, var(--tf3-accent) 40%, transparent);
    }
    .tf5-bulk-btn-primary:hover {
      background: color-mix(in srgb, var(--tf3-accent) 85%, #fff);
      color: #ffffff;
      box-shadow: 0 4px 14px color-mix(in srgb, var(--tf3-accent) 55%, transparent);
    }
    .tf5-bulk-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: var(--tf3-muted);
      cursor: pointer;
      font-size: 13px;
      transition: all 0.14s ease;
    }
    .tf5-bulk-close:hover {
      background: rgba(244, 63, 94, 0.18);
      color: #fda4af;
    }

    .tf3-icon-pill { position: relative; width: 32px; height: 32px; padding: 0; border: 1px solid var(--tf3-border); border-radius: var(--tf3-radius-sm); background: transparent; }
    .tf3-icon-pill:hover { background: var(--tf3-subtle); border-color: color-mix(in srgb, var(--tf3-text) 14%, transparent); }
    .tf3-icon-pill .tgico { font-size: 14.5px; }
    .tf3-bm-count { position: absolute; top: -3px; right: -3px; margin-left: 2px; display: flex; align-items: center; justify-content: center; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 999px; background: var(--tf3-accent); color: #fff; font-size: 8.5px; font-weight: 700; }
    .tf3-bm-count:empty { display: none; }
    .tf3-row-actions { display:inline-flex; gap:6px; }
    .tf3-btn-sm { min-height:28px; padding:0 10px; border-radius:6px; font-size:11.5px; font-weight:600; }

    .tf3-bookmark-flash { animation: tf3-flash-gold 2s cubic-bezier(.2,.8,.2,1); }
    @keyframes tf3-flash-gold {
      0% { box-shadow: inset 0 0 0 2px #e5a50a; background: rgba(229,165,10,.14); }
      100% { box-shadow: inset 0 0 0 0 transparent; background: transparent; }
    }

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

    .tf3-settings-card { width: min(480px, 94vw); }
    .tf3-set-group { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
    .tf3-set-group-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--tf3-dialog-muted); margin-bottom: 1px; }
    .tf3-set-row { display: flex; align-items: flex-start; gap: 10px; padding: 7px 10px; border-radius: 8px; background: var(--tf3-dialog-soft); cursor: pointer; user-select: none; transition: background 0.12s; }
    .tf3-set-row:hover { background: color-mix(in srgb, var(--theme-primary-color, #3390ec) 8%, var(--tf3-dialog-soft)); }
    .tf3-set-row input[type="checkbox"] { position: absolute; opacity: 0; margin: 0; width: 15px; height: 15px; flex-shrink: 0; cursor: pointer; }
    .tf3-set-row::before { content: ''; box-sizing: border-box; width: 15px; height: 15px; margin-top: 3px; flex-shrink: 0; border: 1.5px solid var(--tf3-dialog-muted); border-radius: 4px; background: transparent; transition: background 0.12s, border-color 0.12s; }
    .tf3-set-row:has(input:checked)::before { background: var(--theme-primary-color, #3390ec); border-color: var(--theme-primary-color, #3390ec); background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E"); background-size: 11px 11px; background-repeat: no-repeat; background-position: center; }
    .tf3-set-row:has(input:focus-visible)::before { outline: 2px solid var(--theme-primary-color, #3390ec); outline-offset: 2px; }
    .tf3-set-label { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .tf3-dest-card { width: min(460px, 94vw); }
    .tf3-dest-count { font-size: 10.5px; color: var(--tf3-dialog-muted); }
    .tf3-dest-search-wrap { margin: 2px 0 6px; }
    .tf3-dest-search { width: 100%; box-sizing: border-box; }
    .tf3-dest-list { display: flex; flex-direction: column; gap: 4px; max-height: min(52vh, 380px); overflow-y: auto; overscroll-behavior: contain; margin: 4px 0 10px; padding: 2px; }
    .tf3-dest-item { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid transparent; border-radius: 8px; background: var(--tf3-dialog-soft); color: var(--tf3-dialog-text); cursor: pointer; text-align: left; user-select: none; transition: background .12s, border-color .12s; }
    .tf3-dest-item:hover, .tf3-dest-item:focus-visible { border-color: color-mix(in srgb, var(--theme-primary-color, #3390ec) 35%, transparent); background: color-mix(in srgb, var(--theme-primary-color, #3390ec) 12%, var(--tf3-dialog-soft)); outline: none; }
    .tf3-dest-item[aria-current="true"] { border-color: color-mix(in srgb, var(--theme-primary-color, #3390ec) 55%, transparent); }
    .tf3-dest-icon { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: color-mix(in srgb, var(--theme-primary-color, #3390ec) 15%, transparent); color: var(--theme-primary-color, #3390ec); }
    .tf3-dest-info { display: flex; flex-direction: column; min-width: 0; }
    .tf3-dest-name { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--tf3-dialog-text); }
    .tf3-dest-id { font-size: 10.5px; color: var(--tf3-dialog-muted); margin-top: 1px; }
    .tf3-dest-action { color: var(--tf3-dialog-muted); opacity: .7; display: flex; align-items: center; }
    .tf3-dest-item:hover .tf3-dest-action { color: var(--theme-primary-color, #3390ec); opacity: 1; }
    .tf3-dest-empty { padding: 14px 10px; text-align: center; font-size: 12px; color: var(--tf3-dialog-muted); }
    .tf3-set-current { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 8px; background: var(--tf3-dialog-soft); }
    .tf3-set-current-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .tf3-set-current-text strong { font-size: 12.5px; font-weight: 600; color: var(--tf3-dialog-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tf3-set-current-text small { font-size: 11px; color: var(--tf3-dialog-muted); }
    .tf3-set-label strong { font-size: 12.5px; font-weight: 600; color: var(--tf3-dialog-text); }
    .tf3-set-label small { font-size: 11px; color: var(--tf3-dialog-muted); line-height: 1.3; }
    .tf3-set-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
    @media (max-width: 480px) { .tf3-set-grid { grid-template-columns: 1fr; } }

    .tf3-search { box-sizing:border-box; width:100%; min-height:36px; margin:0 0 10px; padding:8px 12px; border:1px solid var(--tf3-dialog-line); border-radius:8px; outline:none; background:var(--tf3-dialog-soft); color:var(--tf3-dialog-text); font-size:12.5px; transition:border-color .14s; }
    .tf3-search::placeholder { color:var(--tf3-dialog-muted); }
    .tf3-search:focus { border-color:var(--theme-primary-color,#3390ec); }
    .tf3-search:disabled { opacity:.5; }
    .tf3-note { margin:12px 2px 0; color:var(--tf3-dialog-muted); font-size:11px; line-height:1.45; }

    .tf3-hl { display:flex; flex-direction:column; gap:6px; max-height:340px; overflow-y:auto; }
    .tf3-empty { padding:24px 12px; text-align:center; color:var(--tf3-dialog-muted); }
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
    .tf3-library-toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
    .tf3-library-toolbar .tf3-library-chips { margin:0; }
    .tf3-workspace-card { display:flex; flex-direction:column; gap:3px; margin-bottom:10px; padding:9px 11px; border:1px solid var(--tf3-dialog-line); border-radius:8px; background:var(--tf3-dialog-soft); }
    .tf3-workspace-main { display:flex; flex-direction:column; min-width:0; }
    .tf3-workspace-main strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:650; }
    .tf3-workspace-main small { margin-top:1px; color:var(--tf3-dialog-muted); font-size:10.5px; }
    .tf3-timeline-title { position:sticky; top:0; z-index:1; padding:6px 2px 4px; background:var(--tf3-dialog-bg); color:var(--tf3-dialog-muted); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
    .tf3-tagline { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
    .tf3-tag { padding:1px 6px; border-radius:4px; background:color-mix(in srgb,var(--theme-primary-color,#3390ec) 10%,transparent); color:var(--theme-primary-color,#3390ec); font-size:9.5px; font-weight:600; }

    #tf3-action-ack { position:fixed; z-index:100000; min-width:110px; max-width:200px; padding:6px 10px; border-radius:8px; pointer-events:none; text-align:center; background:#1a1c1e; color:#ffffff; border:1px solid rgba(255,255,255,.1); box-shadow:0 6px 18px rgba(0,0,0,.25); font:650 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; will-change:transform,opacity; }
    #tf3-action-ack[data-tone="ok"] { background:#16733c; border-color:transparent; }
    #tf3-action-ack[data-tone="danger"] { background:#b8322d; border-color:transparent; }
    @media (max-width:560px) {
      .tf3-library-card { width:96vw; }
      .tf3-library-row { grid-template-columns:1fr; }
      .tf3-library-row .tf3-row-actions { justify-content:flex-end; }
      .tf3-library-toolbar { align-items:flex-start; flex-direction:column; }
    }
    @media (prefers-reduced-motion:reduce) { .tf3-pill,#tf3-panel,#tf3-panel .pf,#tf3-overlay,.tf3-sx,.tf3-btn,.tf3-download-pill { animation:none!important; transition:none!important; } }
  `;
    document.documentElement.appendChild(css);

    const adaptCss = document.createElement('style');
    adaptCss.id = 'tf3-adapt-css';
    adaptCss.textContent = `
    #column-center > .chat > .tf3-ctrl,
    #column-center .chat .tf3-ctrl {
      position:relative; z-index:5; flex-shrink:0;
      width:100% !important;
      max-width:var(--chat-width, 720px) !important;
      margin-inline:auto !important;
      margin-top:calc(var(--chat-topbar-height, 3rem) + 6px) !important;
      margin-bottom:0 !important;
      padding:3px 6px; box-sizing:border-box;
      border-radius:var(--tf3-radius-md, 10px) !important;
      background:var(--surface-color,#fff);
      border:1px solid color-mix(in srgb,var(--theme-border-color,#e0e0e0) 45%,transparent);
      box-shadow:var(--tf3-shadow-sm, 0 1px 2px rgba(0,0,0,.05));
    }
    .theme-dark #column-center > .chat > .tf3-ctrl,
    .theme-dark #column-center .chat .tf3-ctrl {
      background:var(--surface-color,#1c1c1e);
      border-color:rgba(255,255,255,.08);
      box-shadow:0 2px 8px rgba(0,0,0,.25);
    }

    .chat:has(.tf3-ctrl), .chat.tf3-chat-has-bar {
      --chat-padding-top: calc(var(--chat-topbar-height, 3rem) + var(--page-chats-padding, 0px) + var(--pinned-floating-height, 0px) + 48px) !important;
    }

    #MiddleColumn .messages-layout > .tf3-ctrl {
      position:relative; z-index:5; flex-shrink:0;
      width:100% !important; align-self:stretch !important; margin-top:var(--middle-panel-inline-padding,.5rem);
      border-radius:0;
      background:var(--color-background,var(--surface-color,#fff));
      box-shadow:none; box-sizing:border-box;
    }

    .theme-dark #MiddleColumn .messages-layout > .tf3-ctrl { background:var(--color-background,var(--surface-color,#1c1c1e)); }
  `;
    document.documentElement.appendChild(adaptCss);
    return true;
  }

  if (W.__TF5_TEST_MODE__ === true && navigator?.userAgent === 'telefilter-node-test') {
    const testExport = Object.freeze({
      VERSION, locatorCtxFrom, sameLocatorContext, makeLocatorOptions,
      messagePeerId, requireRenderedTarget, getNativeSelectedMessages, selectionPeerIds,
      loadStorage,
      setDomMode: value => { isNewWebKDOM = Boolean(value); },
      resetAndScanMedia, reconcileMediaBubble,
      counterSnapshot: () => ({ mediaCount: S.mediaCount, catCounts: { ...S.catCounts } }),
      getBookmarkKeys: () => [...S.bmKeys],
      isMediaBubble,
      addBookmark,
      removeBookmark,
      LIMITS,
      createStoredZip, crc32Bytes, CRC32_TABLE, dosTimestamp,
      TelefilterVault, formatSmartFileName, sanitizeFileName,
      getMessageReactionCount,
      buildBulkBar, updateBulkBar, getSelectedCount,
    });
    W.__TF5_TEST__ = testExport;
  }

  async function init() {
    debug(`v${VERSION} init`);
    loadStorage();
    await TelefilterVault.init();
    mountStyles();
    enableProtectedContentUnblocker();
    watchThemeChanges();
    watchMediaViewer();
    document.addEventListener('click', ev => {
      if (ev.target?.closest?.('.bubble, .bubbles, .Message, .MessageList, .time, .selection-container, #column-center, .tf5-bulk-btn, .tf5-bulk-close')) {
        setTimeout(updateBulkBar, 60);
      }
    }, { passive: true });
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
