# Backend

## Purpose

- Provide the Express API served under `/serve-monitor/api`.
- Own the SQLite monitor database, authentication, app CRUD/status endpoints, PM2 integration, system stats, logs, and background monitoring.

## Ownership

- `server.js` owns middleware, API mounting, frontend static serving, and process startup.
- `database.js` owns schema creation, migrations, default users, and seed monitor records.
- `monitor.js` owns background health, PM2, log, metric, and alert collection.
- `logParser.js` owns Nginx access-log filtering, visitor parsing, and heuristic bot classification.
- `visitorAnalytics.js` owns cursor-based access-log ingestion, initial bounded backfill, GeoIP enrichment, and raw-event retention.
- `emailReports.js` owns daily and weekly client comparison reports, Resend delivery, scheduling, and delivery deduplication.
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
- `visitor_events` is the persistent 90-day request ledger. It stores full IPs for private analysis and deduplicates by app, source-file identity, and byte offset.
- Initial persistent ingestion backfills at most 30 days or 64 MB, then follows each log by cursor every 30 seconds and finishes an identifiable rotated file before switching.
- `/visitor-analytics/overview` serves cross-site analytics; `/visitor-analytics/apps/:id`, `/visitors`, and `/timeline` serve per-site summary, paginated unique-IP rows, and IP request history.
- Persistent analytics count unique visitors as distinct human-classified IPs in the selected range. GeoIP is local and optional via `GEOIP_DB_PATH`; missing data must remain an explicit unknown rather than failing ingestion.
- Reject analytics ranges longer than 90 days, cap visitor pages at 100 rows, keep all analytics endpoints authenticated, and use parameterized SQL.
- Email reports use completed Israel calendar periods: daily compares yesterday with the day before; weekly compares the previous Monday–Sunday with the preceding week.
- Daily delivery defaults to 08:00 and weekly delivery to Monday at 08:05 Israel time. `email_report_deliveries` prevents duplicate sends after restarts.
- Keep mail credentials and `REPORT_EMAIL_TO` in `backend/.env`; never commit recipient configuration or provider secrets.

## Work Guidance

- Prefer narrow changes in route handlers or monitor helpers before changing API shapes.
- When changing database columns, update schema creation and migration paths together.
- Preserve existing CommonJS style in backend files.
- Keep SQLite WAL and foreign keys enabled. Schema additions and retention behavior must remain safe for existing production databases.

## Verification

- Run backend syntax checks with `node --check <file>` for touched backend JavaScript files.
- When API behavior changes, run the server or exercise the relevant endpoint when practical.
- Run `npm test` for visitor parser, ingestion, deduplication, and retention behavior.
- Keep report period, comparison, and HTML escaping tests passing; production delivery uses the existing Resend configuration.

## Child DOX Index

- `routes/` - Authentication and monitor API route handlers; no separate child contract yet.
