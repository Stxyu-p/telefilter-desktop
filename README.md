# Telefilter Desktop

Telegram WebK userscript. Install `telefilter_desktop_v4.user.js` in a userscript manager; its internal version is 5.0.0.

## Checks

Requires Node.js with `node:test` support. No npm install needed.

    node --check telefilter_desktop_v4.user.js
    node --test test_telefilter_regressions.js
    node test_telefilter_v5.js

Regression checks use simulated Telegram boundaries. The older v5 suite includes source-presence checks and does not establish end-to-end correctness.

## Baseline and limitations

- The owner reported the mixed-album ZIP fix working in Telegram. Browser execution was not independently verified by MIKA.
- ZIP payload is limited to 128 MiB; browser memory use can exceed this. Larger jobs require native download.
- Telegram internal APIs are not stable public contracts.
- Browser download handoff is not proof of disk completion.
- Album diagnostics remain enabled pending the quality audit.

This repository is a clean snapshot of the userscript and its two applicable test files. It intentionally excludes unrelated scripts, earlier extension history, local backups, and account data.
