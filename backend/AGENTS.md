# Backend

## Purpose

- Provide the Express API served under `/serve-monitor/api`.
- Own the SQLite monitor database, authentication, app CRUD/status endpoints, PM2 integration, system stats, logs, and background monitoring.

## Ownership

- `server.js` owns middleware, API mounting, frontend static serving, and process startup.
- `database.js` owns schema creation, migrations, default users, and seed monitor records.
- `monitor.js` owns background health, PM2, log, metric, and alert collection.
- `routes/` owns HTTP route handlers and request/response contracts.
- `monitor.db` is runtime state and must not be treated as a source schema definition.

## Local Contracts

- Keep public API paths compatible with the deployed `/serve-monitor/api/...` prefix unless deployment config changes with it.
- Keep schema migrations idempotent and safe against existing production databases.
- Do not hard-code local-only paths into server monitoring logic unless they are explicitly production paths.
- Avoid logging secrets or authentication tokens.

## Work Guidance

- Prefer narrow changes in route handlers or monitor helpers before changing API shapes.
- When changing database columns, update schema creation and migration paths together.
- Preserve existing CommonJS style in backend files.

## Verification

- Run backend syntax checks with `node --check <file>` for touched backend JavaScript files.
- When API behavior changes, run the server or exercise the relevant endpoint when practical.

## Child DOX Index

- `routes/` - Authentication and monitor API route handlers; no separate child contract yet.
