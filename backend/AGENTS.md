# Backend

## Purpose

- Provide the Express API served under `/serve-monitor/api`.
- Own the SQLite monitor database, authentication, app CRUD/status endpoints, PM2 integration, system stats, logs, and background monitoring.

## Ownership

- `server.js` owns middleware, API mounting, frontend static serving, and process startup.
- `database.js` owns schema creation, migrations, default users, and seed monitor records.
- `monitor.js` owns background health, PM2, log, metric, and alert collection.
- `logParser.js` owns Nginx access-log filtering, visitor parsing, and heuristic bot classification.
- `routes/` owns HTTP route handlers and request/response contracts.
- `monitor.db` is runtime state and must not be treated as a source schema definition.

## Local Contracts

- Keep public API paths compatible with the deployed `/serve-monitor/api/...` prefix unless deployment config changes with it.
- Keep schema migrations idempotent and safe against existing production databases.
- Do not hard-code local-only paths into server monitoring logic unless they are explicitly production paths.
- Avoid logging secrets or authentication tokens.
- For web apps, `metrics.visitors` and `metrics.requests` are human-looking traffic only; bot-looking traffic should remain visible in live visitor rows as `agent: "Bot"` rather than being counted as visitors.
- `/apps/:id/unique-visitors` groups the current access-log tail by IP and reports first seen, last seen, request counts, top paths, statuses, and human/bot/mixed classification; it is a bounded log-window view, not a permanent analytics ledger.
- `/apps/:id/traffic-history?days=7|30` returns fixed daily buckets from sampled `metrics` rows for visitor charts; it is monitored traffic history, not exact per-visit or per-day unique analytics.

## Work Guidance

- Prefer narrow changes in route handlers or monitor helpers before changing API shapes.
- When changing database columns, update schema creation and migration paths together.
- Preserve existing CommonJS style in backend files.

## Verification

- Run backend syntax checks with `node --check <file>` for touched backend JavaScript files.
- When API behavior changes, run the server or exercise the relevant endpoint when practical.

## Child DOX Index

- `routes/` - Authentication and monitor API route handlers; no separate child contract yet.
