# Backend

## Purpose

- Provide the Express API served under `/serve-monitor/api`.
- Own the SQLite monitor database, authentication, app CRUD/status endpoints, PM2 integration, system stats, logs, and background monitoring.

## Ownership

- `server.js` owns middleware, API mounting, frontend static serving, and process startup.
- `database.js` owns schema creation, migrations, default users, and seed monitor records.
- `monitor.js` owns background health, PM2, log, metric, and alert collection.
- `logParser.js` owns host-aware Nginx access-log filtering, visitor parsing, and heuristic bot classification.
- `visitorAnalytics.js` owns cursor-based access-log ingestion, initial bounded backfill, GeoIP enrichment, and raw-event retention.
- `jewelryAnalytics.js` owns canonical Libi product/collection path aggregation, catalog labels, category inference, and equal-period comparisons.
- `resourceUsage.js` owns complete PM2 process-tree attribution and cached, bounded production-storage scans.
- `emailReports.js` owns daily and weekly client comparison reports, Resend delivery, scheduling, and delivery deduplication.
- `routes/` owns HTTP route handlers and request/response contracts.
- `monitor.db` is runtime state and must not be treated as a source schema definition.

## Local Contracts

- Keep public API paths compatible with the deployed `/serve-monitor/api/...` prefix unless deployment config changes with it.
- Keep schema migrations idempotent and safe against existing production databases.
- Do not hard-code local-only paths into server monitoring logic unless they are explicitly production paths.
- Avoid logging secrets or authentication tokens.
- For web apps, `metrics.visitors` and `metrics.requests` are candidate traffic that was not identified as bot traffic. Never describe this heuristic remainder as confirmed human activity; bot-looking traffic remains visible as `agent: "Bot"`.
- Website attribution must use `log_host` against the hostname appended by `nginx-monitor-host-log.conf`. `log_filter` includes paths and `log_exclude` removes paths; do not infer a domain from referrers or a shared hostless access log.
- Keep Libi Diamonds registered as a dedicated monitored website at `https://www.libidiamonds.co.il/`, tied to PM2 process `libi-diamonds-live` and exact hosts `libidiamonds.co.il|www.libidiamonds.co.il`.
- `/apps/:id/unique-visitors` groups the current access-log tail by IP and reports first seen, last seen, request counts, top paths, statuses, and human/bot/mixed classification; it is a bounded log-window view, not a permanent analytics ledger.
- `/apps/:id/traffic-history?days=7|30` returns fixed daily buckets from sampled `metrics` rows for visitor charts; it is monitored traffic history, not exact per-visit or per-day unique analytics.
- `visitor_events` is the persistent 90-day request ledger. It stores the requested host and full IPs for private analysis, and deduplicates by app, source-file identity, and byte offset.
- Initial persistent ingestion backfills at most 30 days or 64 MB, then follows each log by cursor every 30 seconds and finishes an identifiable rotated file before switching.
- `/visitor-analytics/overview` serves cross-site analytics; `/visitor-analytics/apps/:id`, `/visitors`, and `/timeline` serve per-site summary, paginated unique-IP rows, and IP request history.
- The Libi response from `/visitor-analytics/apps/:id` includes `jewelry_interest`: canonical `/product/:slug` and `/jewelry/:category` rankings based only on candidate page views, with distinct candidate counts and previous-period comparisons. Query strings and trailing slashes must not split one product into multiple rows.
- Persistent analytics count unique candidates as distinct non-bot-classified IPs in the selected range. Candidate means “not identified as a bot,” not verified human. GeoIP is local and optional via `GEOIP_DB_PATH`; missing data must remain an explicit unknown rather than failing ingestion.
- A unique candidate must have at least one successful page view. `visitor_events.is_page_view` excludes assets, API calls, robots/sitemaps, failed responses, and non-navigation methods; raw requests remain available for bot and diagnostic totals.
- Version bot and page-view rules through `monitor_metadata`, and reclassify stored events when the ruleset changes so historical dashboards and emails do not keep stale classifications.
- `/apps/server-stats` reports Linux `MemAvailable`-based RAM use, swap details, root-filesystem usage, load, and top processes. Its `resources` payload attributes descendant RSS and `/proc` Swap to every running PM2 app, enriches database-mapped apps with display names, and ranks memory-heavy processes by their combined footprint.
- Storage visibility must scan only the production paths declared in `resourceUsage.js`, run `du` without blocking the Node event loop and at idle I/O priority when available, avoid redundant whole-root scans, cache snapshots for 30 minutes, refresh stale data in the background, distinguish dependency, rollback, backup, log, and cache bytes, and return stale cached data when a refresh fails.
- Sampled `metrics` rows are retained for 90 days; purge maintenance must run at most daily and remain indexed by timestamp.
- Reject analytics ranges longer than 90 days, cap visitor pages at 100 rows, keep all analytics endpoints authenticated, and use parameterized SQL.
- Email reports use completed Israel calendar periods: daily compares yesterday with the day before; weekly compares the previous Monday–Sunday with the preceding week. Reports must use candidate language and state that the classification is an estimate.
- Email report engagement metrics and top pages use page views rather than raw candidate requests. Include only records with a non-empty website URL, keep the HTML responsive and email-client-safe, and link to the production monitor hostname.
- The Libi email row includes its top viewed product and leading collection for the completed period when product traffic exists.
- Daily and weekly client comparison emails must include Libi Diamonds as its own row whenever its seeded monitored-app record is present.
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
- Keep process-tree parsing and descendant-attribution tests passing when resource reporting changes.
- Keep report period, comparison, and HTML escaping tests passing; production delivery uses the existing Resend configuration.

## Child DOX Index

- `routes/` - Authentication and monitor API route handlers; no separate child contract yet.
