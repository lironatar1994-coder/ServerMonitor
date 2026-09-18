# Production operations

## Purpose
- Own the single host-maintenance implementation and installation contract.

## Ownership
- `maintenance.py` is installed as `/usr/local/sbin/lawebs-maintenance`.
- `test_maintenance.py` covers safe cleanup and verified SQLite backups.

- `install-maintenance.sh` owns the systemd timers and removes the legacy cron entry.
- `install-visitor-coverage.py` and `visitor-tracker.js` add missing navigation signals at the Nginx boundary, preserving application builds and CMS content.

## Local Contracts
- Keep the existing `/var/lib/lawebs-maintenance/backups` manifest layout and PC acknowledgement protocol compatible.
- Never remove current releases, releases used by a running process, shared data, uploads, secrets, or the most recent three release candidates.
- Pre-backup cleanup may remove only disposable caches; release retention runs only after a verified backup succeeds.
- Maintenance must not send additional messages or restart applications, clear Linux kernel caches, or cycle swap.
- Keep Maavar exports encrypted; do not copy its plaintext document/database store into general backups.
- Use explicit bounded roots, reject symlink escapes, expose a dry-run plan, and report failures truthfully.

## Verification
- Run `python3 -m unittest discover -s ops -p 'test_*.py'` on Linux.
- Inspect the cleanup plan before an applied run and verify backup integrity, protected release hashes, services, and actual freed disk space afterward.

## Child DOX Index
- No child contracts.

- Visitor installation must back up changed Nginx files, keep the shared key server-only, validate before reload, and roll back on validation failure. Native working trackers must not receive an additional tracker. Libi preview rewrites only its misrouted telemetry request.
