<div align="center">

# ⚡ Telefilter Desktop <sub>v5.0.0</sub>

**Precision Media Intelligence Suite & Batch Downloader for Telegram WebK**

*Ultra-compact Inline Toolbar · Mixed-Album ZIP32 Engine · Local Bookmark Vault*  
*Pure Vanilla JavaScript · Zero Dependencies · 100% Client-Side Privacy*

[![Install from Greasy Fork](https://img.shields.io/badge/Install-Greasy%20Fork-c62828?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://greasyfork.org/th/scripts/596222-telefilter-desktop-edition-v5)
[![Install Direct RAW](https://img.shields.io/badge/Install-GitHub%20RAW-0284c7?style=for-the-badge&logo=github&logoColor=white)](https://raw.githubusercontent.com/Stxyu-p/telefilter-desktop/main/telefilter_desktop.user.js)
[![Release: v5.0.0](https://img.shields.io/badge/Release-v5.0.0-10b981?style=for-the-badge)](https://greasyfork.org/th/scripts/596222-telefilter-desktop-edition-v5)
[![Platform: Telegram WebK](https://img.shields.io/badge/Platform-Telegram%20WebK-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://web.telegram.org/k/)
[![License: MIT](https://img.shields.io/badge/License-MIT-f59e0b?style=for-the-badge)](LICENSE)

![Dependencies: Zero](https://img.shields.io/badge/Dependencies-Zero-success?style=flat-square)
![Engine: Vanilla JS](https://img.shields.io/badge/Engine-Vanilla%20JS-cyan?style=flat-square)
![Storage: IndexedDB](https://img.shields.io/badge/Storage-IndexedDB%20Vault-blue?style=flat-square)
![Design: Clean Minimal](https://img.shields.io/badge/Design-Clean%20Minimal%20Precision-purple?style=flat-square)

</div>

---

## 🧭 Visual Interface Map

The ultra-compact **Inline Toolbar** sits seamlessly beneath the active chat header (34px height). Disclosures open as non-intrusive floating popovers with zero layout shift or chat occlusion.

<p align="center">
  <img src="assets/toolbar-map.svg" alt="Telefilter Desktop Interface Map" width="100%">
</p>

---

## ⚡ Core Capabilities

| Capability | Module | What It Does | Technical Advantage |
| :--- | :---: | :--- | :--- |
| **Instant Media Filters** | 🎛️ | Instantly isolate **Text, Photos, Videos, Files, or Viral** messages in the active chat. | Pure CSS-class filtering with zero DOM reload or network lag. |
| **Mixed-Album ZIP Engine** | 📦 | Unpacks multi-item mixed photo/video albums into an organized, single **.zip archive**. | Built-in ZIP32 compiler; automatically deduplicates shared media keys. |
| **Split Downloader** | 📥 | Dual-mode action button: 1-click native Telegram stream or toggle **▾** for ZIP bundling. | Direct memory stream with zero memory leaks or background bloat. |
| **Deep Harvester** | ⚡ | Automated virtual scroller that traverses historical messages to build a media index. | Bypasses Telegram's Virtual DOM pruning limits for large chats. |
| **Workspace Library** | 🔖 | Save message coordinates, tags, and local notes into an offline searchable index. | Jump directly back to any historical message origin with one click. |
| **Smart Naming & Sidecars** | 📝 | Standardizes filenames `[YYYY-MM-DD]_[Chat]_[Sender]_[ID]` and exports sidecar `.txt` captions. | Prevents filename collisions and preserves message context. |
| **MediaViewer Overlay** | 👁️ | Injects instant save and bookmark actions directly inside fullscreen media previews. | Quick-save media while browsing stories, photos, and full-screen clips. |
| **Deduplication Vault** | 🗄️ | Local IndexedDB transaction ledger tracking previously downloaded media hashes. | Prevents redundant downloads and saves local disk storage. |

---

## 🎯 Quick Workflow

```
[ 1. Filter & Inspect ] ──▶ [ 2. Select Direct / ZIP ] ──▶ [ 3. Save & Organize ]
```

### 1. Filter & Isolate
Click any media pill (**Photos**, **Videos**, **Files**) on the toolbar:
- Irrelevant chat bubbles are instantly hidden via CSS.
- Badge counters display real-time media counts in the current view.
- **Pro-tip:** Double-click any filter pill to batch-select all items in that category.

### 2. Choose Download Mode
- **Direct Stream:** Select messages and click `Download` for standard browser download handling.
- **ZIP Archive:** Click the **`▾`** split arrow and toggle `Bundle as ZIP`. The button changes to `ZIP Download` and compresses all selected media into one organized archive.

### 3. Bookmark & Harvest
- Click **`Library`** to view saved message pins, search custom tags, or jump directly to chat coordinates.
- Click **`…`** to launch the automated Deep Harvester or configure custom naming rules.

---

## 🛠️ Design & Engineering Principles

| Principle | Specification |
| :--- | :--- |
| **Zero Dependencies** | 100% pure vanilla ES2022 JavaScript. No jQuery, React, or external CDN dependencies. |
| **Solid Neutral Surface** | High-taste dark palette (`#131922`), hairline borders (`1px solid #2b3543`), and dual-layer shadows. |
| **Strict Baseline Rhythm** | Standardized 28px button heights and a low-profile 34px toolbar to maximize chat viewport space. |
| **Floating Popovers** | Sub-menus render out-of-flow as absolute popovers with click-outside auto-dismissal. |
| **100% Local Privacy** | In-memory compression and IndexedDB transactions stay strictly local within the user's browser sandbox. |

---

## 🚀 Installation & Distribution

### Option A: Install via Greasy Fork (Fastest · Auto-Updating)
1. Ensure you have [Tampermonkey](https://www.tampermonkey.net/) installed in your browser (Brave, Chrome, Firefox, or Edge).
2. Click to install directly from Greasy Fork:  
   👉 **[Install from Greasy Fork (v5.0.0)](https://greasyfork.org/th/scripts/596222-telefilter-desktop-edition-v5)**
3. Tampermonkey will prompt you to confirm. Click **Install**.
4. *(Bonus)* Automatically receive future version updates directly within Tampermonkey!

### Option B: One-Click Direct Install (GitHub RAW)
1. Click the GitHub raw distribution link:  
   👉 **[Install via GitHub RAW](https://raw.githubusercontent.com/Stxyu-p/telefilter-desktop/main/telefilter_desktop.user.js)**
2. Tampermonkey will open its installation dialog. Click **Install**.

### Option C: Manual Setup
1. Copy the source code from [`telefilter_desktop.user.js`](telefilter_desktop.user.js).
2. Open Tampermonkey Dashboard → click **Add a new script (+)**.
3. Paste the code, press **Ctrl + S** (or **Cmd + S**) to save.
4. Navigate to [Telegram WebK](https://web.telegram.org/k/) to start using Telefilter.

---

## 🧪 Verification & Test Suite

Run the built-in test suite to verify script syntax, regression coverage, and WebK flexbox layout integrity:

```bash
# 1. Syntax and lexical validation
node --check telefilter_desktop.user.js

# 2. Engine, ZIP32, and album-unpacking regression tests (15/15 passing)
node --test telefilter_desktop.regression.test.js

# 3. Headless browser UI layout & popover validation
node telefilter_desktop.ui.check.cjs

# 4. Telegram WebK Flexbox geometry & column constraint tests
node telefilter_desktop.webk_layout.test.cjs
```

---

## 📄 License

This project is licensed under the **MIT License**. See the [`LICENSE`](LICENSE) file for details.

---

## 🌟 Featured Engineering Projects

A curated collection of local-first, zero-telemetry, and performance-critical systems built by [@Stxyu-p](https://github.com/Stxyu-p):

| Project | Platform / Target | Architecture & Core Highlights | Links & Distribution |
| :--- | :--- | :--- | :--- |
| **🐾 [NovelClaw](https://github.com/Stxyu-p/NovelClaw)** | Web Novels / AI Reader | Single-binary Go application (`novelclaw.exe`) with embedded zero-dependency web reader, 9Router/LLM translation pipeline, persistent glossary & context memory, and SSE job streaming. | [![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat-square&logo=go&logoColor=white)](https://github.com/Stxyu-p/NovelClaw) · [GitHub](https://github.com/Stxyu-p/NovelClaw) |
| **⚡ [IG MaxPland](https://github.com/Stxyu-p/ig-maxpland)** | Instagram Web | Clean Architecture (18 decoupled modules), stealth seen-telemetry interceptor (`fetch`/`XHR`/`sendBeacon`), zero-bounce clean feed engine, and safe dormant radar with randomized jitter pacing. | [![Greasy Fork](https://img.shields.io/badge/Greasy%20Fork-v3.0.0-red?style=flat-square&logo=greasyfork&logoColor=white)](https://greasyfork.org/th/scripts/595787-ig-maxpland) · [GitHub](https://github.com/Stxyu-p/ig-maxpland) |
| **⚡ [Telefilter Desktop](https://github.com/Stxyu-p/telefilter-desktop)** | Telegram WebK | Ultra-compact 34px inline toolbar, pure client-side ZIP32 multi-album packing engine, deep virtualized DOM harvester, and 100% client-side privacy vault. | [![Greasy Fork](https://img.shields.io/badge/Greasy%20Fork-v5.0.0-red?style=flat-square&logo=greasyfork&logoColor=white)](https://greasyfork.org/th/scripts/596222-telefilter-desktop-edition-v5) · [GitHub](https://github.com/Stxyu-p/telefilter-desktop) |
| **⚡ [ThreadMax](https://github.com/Stxyu-p/threadmax)** | Threads Web | 1-Click carousel & bulk media extraction with in-memory ZIP32 compiler, video speed booster & PiP, clean link tracking sanitizer, and clean reader thread unroller. | [![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscript-00485B?style=flat-square&logo=tampermonkey&logoColor=white)](https://github.com/Stxyu-p/threadmax) · [GitHub](https://github.com/Stxyu-p/threadmax) |
| **🧠 [memcore](https://github.com/Stxyu-p/memcore)** | Multi-Agent Memory | Governed, local-first memory engine for multi-agent workflows — SQLite + WAL + FTS5, immutable versioning, tombstone guards, and journal-first admission. | [![GitHub](https://img.shields.io/badge/Release-v0.6.0-10b981?style=flat-square&logo=github&logoColor=white)](https://github.com/Stxyu-p/memcore) · [GitHub](https://github.com/Stxyu-p/memcore) |

---

<div align="center">

**Telefilter Desktop** <sub>v5.0.0</sub> · Maintained with high standards  
*Clean Minimal Precision · High Taste · Zero Slop*

</div>

