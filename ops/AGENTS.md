# Production operations

## Purpose
- Own the single host-maintenance implementation and installation contract.

## Ownership

- `portfolio-tracker.js` owns LA webs engagement on `/` and the eight known `/work/:project/` pages. `browser-check.cjs` verifies portfolio flows, live signal receipts, internal exclusion and authenticated monitor routes on desktop/mobile.

- `growth-tracker.js` and `install-growth-coverage.py` collect anonymous contact actions and allow-listed campaign tags on twelve canonical public sites. They compose with the existing navigation injection and add no second native navigation signal.
- `maintenance.py` is installed as `/usr/local/sbin/lawebs-maintenance`.
- `test_maintenance.py` covers safe cleanup and verified SQLite backups.

- `install-maintenance.sh` owns the systemd timers and removes the legacy cron entry.
- `install-visitor-coverage.py` and `visitor-tracker.js` add missing navigation signals at the Nginx boundary, preserving application builds and CMS content.

## Local Contracts

- Portfolio internal browsing is an explicit `monitor_internal=1` cookie set by `?monitor_internal=1` and cleared by `?monitor_internal=0`. Exclude its root/project navigations from the monitor access log and all portfolio browser collectors; retain ordinary server diagnostics. This is prospective and per browser, not a retrospective IP filter.
- Portfolio engagement sends bounded 15-second deltas, pauses while hidden or after 30 seconds without activity, and contains only named zones, coarse 12x12 click cells, scroll reach and durations. Never collect page text, form content or full outbound URLs.
- The existing 15-minute health timer runs one browser check at most hourly with a 180-second timeout. Use a single headless browser, identify automated visits, confirm their exclusion in SQLite, never send contact messages, and write an atomic root-only `browser-check.json`. Results older than two hours or failing checks produce dashboard alerts; zero traffic is not a failure.
- The browser check creates only a five-minute JWT from the existing server-side authentication configuration and existing user. Never log or persist the token. Playwright/Chromium is installed by deployment; no new scheduler is added.

- Growth instrumentation must leave customer builds and CMS content untouched. Exclude private/admin routes, never read field values, and preserve Maavar's privacy. Nginx fixes the site identity and keeps the integration key server-only; POST bridges remain bounded at 16 KB.
- Apply growth installation after visitor installation because the combined head substitution includes both map variables. The 15-minute health probe verifies both installed markers. Back up Nginx edits and roll back failed validation.
- Keep the existing `/var/lib/lawebs-maintenance/backups` manifest layout and PC acknowledgement protocol compatible.
- Never remove current releases, releases used by a running process, shared data, uploads, secrets, or the most recent three release candidates.
- Pre-backup cleanup may remove only disposable caches; release retention runs only after a verified backup succeeds.
- Maintenance must not send additional messages or restart applications, clear Linux kernel caches, or cycle swap.
- Health checks every 15 minutes verify visitor-ingestion freshness and the presence of installed browser trackers without interpreting low or zero traffic as failure. Publish the latest cleanup result to `/var/log/server_cleanup_summary.log` for ServerMonitor.
- Keep Maavar exports encrypted; do not copy its plaintext document/database store into general backups.
- Use explicit bounded roots, reject symlink escapes, expose a dry-run plan, and report failures truthfully.

## Verification
- Run `node ops/browser-check.cjs` on production after deployment; check both monitor hostnames, desktop/mobile routes, page drill-down, all eight project pages, live beacon storage and internal exclusion. Its runtime user must be able to read the existing server authentication configuration and write the protected result file.
- Run `python3 -m unittest discover -s ops -p 'test_*.py'` on Linux.
- Inspect the cleanup plan before an applied run and verify backup integrity, protected release hashes, services, and actual freed disk space afterward.

## Child DOX Index
- No child contracts.

- Visitor installation must back up changed Nginx files, keep the shared key server-only, validate before reload, and roll back on validation failure. Native working trackers must not receive an additional tracker. Libi preview rewrites only its misrouted telemetry request.
