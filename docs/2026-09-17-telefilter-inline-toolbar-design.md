# Telefilter Desktop — Inline Toolbar

P Choke approved the inline-toolbar direction in chat: primary actions remain directly reachable, controls do not float over messages, and styling follows clean MaxPland principles. This document records the current implementation, not a new major version.

## Implementation

- Always-visible toolbar below the host header; no expand/collapse launcher.
- All existing filters retained, including Viral. Category actions and download logic unchanged.
- Filter icons use local stroke SVGs. Neutral surfaces, hairline borders, 8px radii, system font, tabular counts; Telegram light/dark adaptation retained.
- Main Download button invokes native selection immediately. Adjacent chevron opens a ZIP toggle; the main label indicates the stored format.
- More exposes Harvest, History and Settings. Library remains a direct action. Destructive clearing remains inside Settings with its existing confirmation.
- Native details disclosures expand within layout rather than overlaying chat. Escape closes them and returns focus. Opening one closes the other.
- Existing download status node moves inside the toolbar, keeping progress and pause/cancel/retry handlers. The same node is retained across toolbar remounts.
- Toolbar target height is approximately 40px when controls fit. Below 650px container width it wraps; at viewport widths up to 560px filter labels collapse to icons with accessible names. Extra rows are an intentional space-for-no-overlap tradeoff, not a claim of one-row layout on every screen.
- Existing Library/Settings dialogs, viewer actions and short feedback toasts remain. This is not a full Studio/dashboard redesign.

## Scope

No new framework, runtime dependency, download mode, storage migration, or changes to protected-content handling. Userscript version remains 5.0.0; this work does not claim a v6 release.

## Verification

- Syntax and existing Node regression/smoke checks.
- `telefilter_desktop.ui.check.cjs` extracts the shipped builder, CSS, filter definitions, icons and panel functions into an isolated Chromium fixture.
- Four container widths (320, 560, 760, 1100px), light/dark: direct action wiring, format state, native disclosure Escape handling, visible-control bounds, message non-overlap, inline progress, and panel remount identity.
- Browser tests stub Telegram actions: they do not prove Telegram integration, successful downloads, theme contrast, or real-chat scroll anchoring.

## Remaining live acceptance

Reload the userscript in a real Telegram WebK chat. Verify header placement, message scroll position when opening tools/progress, switching chats during work, light/dark theme changes, and one download with pause/cancel/retry as applicable. Browser fixture success must not be reported as this live check.
