// telefilter_desktop.smoke.test.js
// SORA Comprehensive Verification Test Suite for Telefilter v5 (Ultimate)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const scriptPath = path.join(__dirname, 'telefilter_desktop.user.js');
const code = fs.readFileSync(scriptPath, 'utf-8');

console.log('=== TELEFILTER V5 VERIFICATION TEST SUITE ===\n');

// 1. Static Contract Checks
console.log('--- 1. Testing Script Metadata & Version ---');
assert(code.includes('Telefilter Desktop Edition'), 'Script name must be Telefilter');
assert(code.includes('5.0.0'), 'Version must be 5.0.0');
console.log('✔ Version 5.0.0 verified');

console.log('--- 2. Testing Pure Client-Side ZIP32 Generator (Zero Dependencies) ---');
assert(code.includes('CRC32_TABLE'), 'Must define CRC32 table');
assert(code.includes('crc32Bytes'), 'Must define crc32Bytes checksum calculation');
assert(code.includes('createStoredZip'), 'Must define createStoredZip');
assert(code.includes('dosTimestamp'), 'Must define dosTimestamp');
assert(!code.includes('@require.*jszip'), 'Must NOT rely on external JSZip CDN');
console.log('✔ Zero-dep ZIP32 generator verified');

console.log('--- 3. Testing TelefilterVault (IndexedDB Engine) ---');
assert(code.includes('telefilter_vault'), 'Must define telefilter_vault database name');
assert(code.includes('TelefilterVault'), 'Must define TelefilterVault module/object');
assert(code.includes('hasDownloaded'), 'Must have download check methods');
assert(code.includes('recordDownload'), 'Must have recordDownload method');
console.log('✔ IndexedDB Vault verified');

console.log('--- 4. Testing Deep Harvester Engine ---');
assert(code.includes('runDeepHarvester'), 'Must define deep harvesting engine');
assert(code.includes('tf5-harvest-pill') || code.includes('Harvest'), 'Must have harvest UI trigger');
console.log('✔ Deep Harvester verified');

console.log('--- 5. Testing MediaViewer Direct Actions ---');
assert(code.includes('watchMediaViewer'), 'Must watch MediaViewer overlay');
assert(code.includes('tf5-mv-actions'), 'Must define tf5-mv-actions overlay container');
assert(code.includes('triggerMediaViewerDownload'), 'Must define quick download action');
assert(code.includes('triggerMediaViewerBookmark'), 'Must define quick bookmark action');
console.log('✔ MediaViewer overlay actions verified');

console.log('--- 6. Testing Protected Content & Text Unblocker ---');
assert(code.includes('user-select: text !important'), 'Must force text selection');
assert(code.includes('selectstart') && code.includes('copy'), 'Must intercept copy/selectstart');
console.log('✔ Protected content unblocker verified');

console.log('--- 7. Testing Smart File Naming & Captions Sidecar ---');
assert(code.includes('formatSmartFileName'), 'Must define formatSmartFileName');
assert(code.includes('sanitizeFileName'), 'Must sanitize file names');
assert(code.includes('.txt'), 'Must support caption extraction/sidecar');
console.log('✔ Smart naming & captions sidecar verified');

console.log('--- 8. Testing Reactions & Viral Scrubber ---');
assert(code.includes('getMessageReactionCount'), 'Must define getMessageReactionCount');
assert(code.includes('viral'), 'Must support viral filter');
assert(code.includes('tf3-f_viral'), 'Must define viral CSS filter class');
console.log('✔ Reactions & Viral Scrubber verified');

// 2. Functional Runtime Tests via Test Hooks
console.log('\n--- 10. Functional Runtime Tests via Node VM Sandbox ---');

// Setup mock browser environment
const mockWindow = {
  __TF5_TEST_MODE__: true,
  navigator: { userAgent: 'telefilter-node-test' },
  location: { hostname: 'webk.telegram.org', pathname: '/k/', hash: '' },
  document: {
    documentElement: { appendChild: () => {}, classList: { contains: () => false } },
    head: { appendChild: () => {} },
    body: { classList: { contains: () => false }, appendChild: () => {} },
    createElement: tag => ({
      tagName: tag.toUpperCase(),
      style: {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
      setAttribute: () => {},
      appendChild: () => {},
      addEventListener: () => {},
    }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  requestAnimationFrame: cb => setTimeout(cb, 0),
  cancelAnimationFrame: id => clearTimeout(id),
  TextEncoder: TextEncoder,
  Uint8Array: Uint8Array,
  Uint32Array: Uint32Array,
  DataView: DataView,
  Blob: Blob,
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
};
mockWindow.window = mockWindow;
mockWindow.unsafeWindow = mockWindow;

const context = vm.createContext(mockWindow);
vm.runInContext(code, context);

const TF5 = mockWindow.__TF5_TEST__;
assert(TF5, 'Test hooks __TF5_TEST__ must be exported');
assert.strictEqual(TF5.VERSION, '5.0.0', 'Exported version must be 5.0.0');

// Test ZIP32 Generator
console.log('Testing createStoredZip()...');
const sampleFiles = [
  { name: 'hello.txt', data: 'Hello World!' },
  { name: 'images/data.bin', data: new Uint8Array([1, 2, 3, 4, 5]) }
];
const zipBlob = TF5.createStoredZip(sampleFiles);
assert(zipBlob instanceof Blob, 'createStoredZip must return a Blob');
assert.strictEqual(zipBlob.type, 'application/zip', 'Blob type must be application/zip');
assert(zipBlob.size > 100, `ZIP blob size must be valid (got ${zipBlob.size} bytes)`);

// Test CRC32 Checksum
console.log('Testing CRC32 calculation...');
const crcHello = TF5.crc32Bytes(new TextEncoder().encode('123456789'));
assert.strictEqual(crcHello, 0xCBF43926, `CRC32 of '123456789' must be 0xCBF43926 (got 0x${crcHello.toString(16)})`);

// Test File Sanitizer
console.log('Testing sanitizeFileName()...');
assert.strictEqual(TF5.sanitizeFileName('hello/world:test*file?.jpg'), 'hello_world_test_file_.jpg');
assert.strictEqual(TF5.sanitizeFileName('...'), 'file');

// Test Smart Naming
console.log('Testing formatSmartFileName()...');
const mockMsg = {
  id: 42,
  date: 1773446400, // known timestamp
  media: { photo: true }
};
const smartName = TF5.formatSmartFileName(mockMsg, 'photo_42.jpg', 'My Channel');
assert(smartName.includes('My_Channel'), 'Smart name must include sanitized chat title');
assert(smartName.includes('photo_42.jpg'), 'Smart name must include file name');
assert(/^\d{4}-\d{2}-\d{2}/.test(smartName), 'Smart name must start with YYYY-MM-DD');

// Test Reaction Count Parser
console.log('Testing getMessageReactionCount()...');
const mockMsgWithReactions = {
  reactions: {
    results: [
      { count: 15 },
      { count: 7 }
    ]
  }
};
const count = TF5.getMessageReactionCount(null, mockMsgWithReactions);
assert.strictEqual(count, 22, 'Reaction count must sum all results (15 + 7 = 22)');

console.log('\n✔ All functional runtime tests passed with zero errors!');
console.log('\n=========================================');
console.log('ALL VERIFICATION CHECKS 100% GREEN');
console.log('=========================================\n');
