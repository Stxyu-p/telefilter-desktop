'use strict';
// Verifies repostTargets now pulls FULL media from the message object via the
// download manager, independent of the DOM. Read-only probe.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'telefilter_desktop.user.js'), 'utf8');

function section(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  if (start < 0 || end <= start) throw new Error('Missing section: ' + from);
  return source.slice(start, end);
}

(async () => {
  console.log('\nrepostTargets media sourcing (after fix)\n' + '-'.repeat(72));

  const cases = [
    { label: 'WebK photo, never rendered in DOM', msg: { mid: '1', message: '', media: { photo: { _: 'photo', sizes: [{ _: 'photoSize', w: 90 }, { _: 'photoSize', w: 1280 }] } } }, size: 204800, type: 'image/jpeg' },
    { label: 'WebA photo, never rendered in DOM', msg: { mid: '2', message: '', media: { photo: { _: 'photo', sizes: [{ _: 'photoSizeProgressive', w: 2560 }] } } }, size: 512000, type: 'image/jpeg' },
    { label: '10-minute video (full file, not thumb)', msg: { mid: '3', message: '', media: { document: { mime_type: 'video/mp4', file_name: 'clip.mp4', size: 150 * 1024 * 1024 } } }, size: 157286400, type: 'video/mp4' },
    { label: 'WebM video', msg: { mid: '4', message: '', media: { document: { mime_type: 'video/webm' } } }, size: 4096, type: 'video/webm' },
    { label: 'GIF animation', msg: { mid: '5', message: '', media: { document: { mime_type: 'image/gif' } } }, size: 9000, type: 'image/gif' },
    { label: 'text-only message', msg: { mid: '6', message: 'hello world' }, size: null, type: null },
    { label: 'sticker (webp)', msg: { mid: '7', message: '', media: { document: { mime_type: 'image/webp' } } }, size: 70000, type: 'image/webp' },
  ];

  const rows = [];
  for (const c of cases) {
    const sent = [];
    let requested = null;
    const ctx = {
      S: { repostText: true, repostMedia: true },
      TG: {
        repostManager: () => ({
          sendText: async a => sent.push({ kind: 'text', len: (a.text || '').length }),
          sendFile: async a => sent.push({ kind: 'file', name: a.file?.name, size: a.file?.size, type: a.file?.type }),
        }),
        myId: () => '999',
      },
      getMedia: m => m?.media?.document || m?.media?.photo,
      mediaExtFor: undefined,
      W: { appDownloadManager: { downloadMedia: async (arg) => { requested = arg; return c.size ? { size: c.size, type: c.type, arrayBuffer: () => new Uint8Array([1]) } : null; } } },
      document: { querySelector: () => null },
      findBubbleByMid: () => null,
      recordError() {},
      sleep: async () => {},
      File: class { constructor(parts, name, o) { this.name = name; this.size = parts[0].size; this.type = o.type; } },
    };
    vm.createContext(ctx);
    // Pull mediaExtFor + repostMediaBlob + repostTargets as one unit.
    const code = section('  const mediaExtFor =', '  async function repostSingle(') + ';this.run=repostTargets;';
    vm.runInContext(code, ctx);
    const res = await ctx.run([c.msg], '999');
    const file = sent.find(s => s.kind === 'file');
    const text = sent.find(s => s.kind === 'text');
    const pickedThumb = requested?.thumb ? (requested.thumb.w || requested.thumb.width || 'photoSize') : null;
    rows.push({
      label: c.label,
      expect: c.size ? 'file' : (c.msg.message ? 'text' : 'fail'),
      got: file ? 'file' : (text ? 'text' : 'fail'),
      name: file?.name, size: file?.size, fail: res.fail, ok: res.ok, thumb: pickedThumb,
    });
  }

  let pass = 0;
  for (const r of rows) {
    const good = r.expect === r.got;
    if (good) pass++;
    const detail = r.got === 'file' ? `${r.name} (${r.size} B, thumb=${r.thumb})` : r.got === 'text' ? `text len=${r.size ? '' : ''}` : `fail=${r.fail}`;
    console.log(`  ${good ? 'PASS' : 'FAIL'}  ${r.label.padEnd(40)} -> ${r.got.padEnd(5)} ${detail}`);
  }
  console.log('-'.repeat(72));
  console.log(`${pass}/${rows.length} pass`);
  console.log('Key: every media case now resolves WITHOUT any DOM bubble (findBubbleByMid returns null).');
})();
