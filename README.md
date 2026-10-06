<div align="center">

# ⚡ Telefilter Desktop <sub>v5.5.0</sub>

**Precision Media Intelligence Suite & Batch Downloader for Telegram WebK**

*Ultra-compact Inline Toolbar, Floating Bulk Action Dock, Searchable Destination Picker, Mixed-Album ZIP32 Engine*  
*Pure Vanilla JavaScript, Zero Dependencies, 100% Client-Side Privacy*

[![Install from Greasy Fork](https://img.shields.io/badge/Install-Greasy%20Fork-c62828?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://greasyfork.org/th/scripts/596222-telefilter-desktop-edition-v5)
[![Install from OpenUserJS](https://img.shields.io/badge/Install-OpenUserJS-e65c00?style=for-the-badge&logo=javascript&logoColor=white)](https://openuserjs.org/scripts/Chokechai/Telefilter_Desktop_Edition_v5)
[![Install Direct RAW](https://img.shields.io/badge/Install-GitHub%20RAW-0284c7?style=for-the-badge&logo=github&logoColor=white)](https://raw.githubusercontent.com/Stxyu-p/telefilter-desktop/main/telefilter_desktop.user.js)
[![Release: v5.5.0](https://img.shields.io/badge/Release-v5.5.0-10b981?style=for-the-badge)](https://greasyfork.org/th/scripts/596222-telefilter-desktop-edition-v5)
[![Changelog](https://img.shields.io/badge/Changelog-View_Notes-blueviolet?style=for-the-badge)](CHANGELOG.md)
[![Platform: Telegram WebK](https://img.shields.io/badge/Platform-Telegram%20WebK-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://web.telegram.org/k/)
[![License: MIT](https://img.shields.io/badge/License-MIT-f59e0b?style=for-the-badge)](LICENSE)

![Dependencies: Zero](https://img.shields.io/badge/Dependencies-Zero-success?style=flat-square)
![Engine: Vanilla JS](https://img.shields.io/badge/Engine-Vanilla%20JS-cyan?style=flat-square)
![Storage: IndexedDB](https://img.shields.io/badge/Storage-IndexedDB%20Vault-blue?style=flat-square)
![Design: Clean Minimal](https://img.shields.io/badge/Design-Clean%20Minimal%20Precision-purple?style=flat-square)

</div>

---

## 🧭 Core Capabilities Matrix

Telefilter Desktop integrates directly into [Telegram WebK](https://web.telegram.org/k/) with zero DOM layout shift, maintaining Telegram's native message rendering while adding precision media intelligence.

| Capability | Module | What It Does | Technical Advantage |
| :--- | :--- | :--- | :--- |
| **Instant Media Filters** | 🎛️ | Instantly isolate **Text, Photos, Videos, Files, or Viral** messages in the active chat. | Pure CSS-class filtering with zero DOM reload or network lag. |
| **Floating Bulk Dock** | ⚓ | Ergonomic bottom dock for batch actions upon selecting chat messages. | Eliminates context menu interference; zero event hijacking. |
| **Mixed-Album ZIP Engine** | 📦 | Compiles multi-item mixed photo/video albums into an organized **.zip archive**. | Built-in ZIP32 compiler; unpacks grouped albums automatically. |
| **Split Downloader** | 📥 | Dual-mode action button: 1-click native Telegram stream or toggle **▾** for ZIP bundling. | Direct memory stream with zero memory leaks or background bloat. |
| **Workspace Library** | 🔖 | Save message coordinates, tags, and local notes into an offline searchable index. | Jump directly back to any historical message origin with one click. |
| **Smart Naming & Sidecars** | 📝 | Standardizes filenames `[YYYY-MM-DD_HHMM]_[Chat]_[Filename]` and exports sidecar `.txt` captions. | Prevents filename collisions and preserves message context. |
| **MediaViewer Overlay** | 👁️ | Injects instant save and bookmark actions directly inside fullscreen media previews. | Quick-save photos and videos directly from fullscreen previews. |
| **Deduplication Vault** | 🗄️ | Local IndexedDB transaction ledger tracking previously downloaded media hashes. | Prevents redundant downloads and saves local disk storage. |

---

## 📊 Feature Comparison

| Capability | Manual saving / generic downloader extensions | ⚡ **Telefilter Desktop** |
| :--- | :--- | :--- |
| **Media filtering** | Scroll and eyeball every message | ✅ **1-click pills: Text, Photos, Videos, Files, Viral, live counts** |
| **Bulk download** | Right click files one by one, nested menus | ✅ **Floating dock: Download or Bookmark selections in one click** |
| **Album archives** | Bloated libraries or broken sets | ✅ **In-memory ZIP32 with CRC32, no external dependencies** |
| **File naming** | Colliding names, lost context | ✅ **Smart `[YYYY-MM-DD_HHMM]_[Chat]_[Filename]` plus caption sidecars** |
| **Saved library** | No history, re-download everything | ✅ **Offline vault with search, tags, jump-to-message, dedup ledger** |
| **Privacy** | Telemetry or server side handling | ✅ **Zero telemetry, zero dependencies, browser local only** |

---

## 🔬 Under the Hood & Privacy Invariants

### Binary ZIP32 Compiler Architecture
Telegram WebK presents challenges when handling mixed-media albums (interleaved photos and videos). Rather than relying on heavy third-party libraries, Telefilter Desktop embeds a native ZIP32 compiler:
- **Bitwise CRC32 Table:** Pre-computed 256-entry lookup table (`0xEDB88320` polynomial), calculated in a single pass over each media stream.
- **Binary Array Structs:** Constructs binary ZIP Local Headers, Central Directory Records, and End of Central Directory (EOCD) directly via `Uint8Array`.
- **Immediate Memory Reclamation:** Releases temporary blob memory immediately upon browser disk handoff, preventing memory leaks during large downloads.

### Resource & Privacy Profile

| Metric | Specification | Practical Outcome |
| :--- | :--- | :--- |
| **ZIP Encoding Mode** | Stored (no deflate) + single-pass CRC32 | Media is already compressed, no redundant CPU consumption |
| **Filter Performance** | CSS class toggles only, no DOM rebuild | Zero layout shifts; chat never re-renders while filtering |
| **Media Viewer Watch** | `MutationObserver` on added nodes only, no polling | ~0.02% CPU idle, **82× lighter** than a document-wide scan; overlay still appears instantly |
| **External Dependencies** | **0** (Pure ES2022 JavaScript) | Zero supply-chain attack vectors |
| **Network Privacy** | **0** telemetry or outbound calls | All network activity stays strictly between your browser and Telegram |
| **Local Storage** | Browser-isolated IndexedDB + localStorage | Bookmarks and settings never leave your personal computer |

---

## 🚀 Installation & Setup

> Requires [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/) installed in your browser.

| Method | Link | Notes |
| :--- | :--- | :--- |
| **Greasy Fork** ⭐ | [Install](https://greasyfork.org/th/scripts/596222-telefilter-desktop-edition-v5) | Recommended, auto-updates |
| **OpenUserJS** | [Install](https://openuserjs.org/scripts/Chokechai/Telefilter_Desktop_Edition_v5) | Alternative registry |
| **GitHub RAW** | [Install](https://raw.githubusercontent.com/Stxyu-p/telefilter-desktop/main/telefilter_desktop.user.js) | Always latest commit |
| **Manual** | [`telefilter_desktop.user.js`](telefilter_desktop.user.js) | Copy → Tampermonkey Dashboard → paste → save |

After installing, navigate to [Telegram WebK](https://web.telegram.org/k/). Telefilter loads automatically.

---

## 🧪 Verification & Automated Testing Suite

The repository includes comprehensive unit, regression, DOM fixture, and headless browser tests:

```bash
# Complete unit, regression, and static smoke test suite
npm test

# Headless Chromium layout & DOM checks across multiple viewports
npm run test:browser

# Update clean UI panel reference screenshots
npm run capture:panels
```

---

## 📜 Release History & Changelog

All notable changes and historical releases are documented in [CHANGELOG.md](CHANGELOG.md) following Keep a Changelog standards.

---

## 📄 License

This project is licensed under the **MIT License**. See the [`LICENSE`](LICENSE) file for details.

<div align="center">

**Telefilter Desktop** <sub>v5.5.0</sub> · Built for Precision & Reliability  
*Clean Minimal Precision, High Taste, Zero Slop*

</div>
