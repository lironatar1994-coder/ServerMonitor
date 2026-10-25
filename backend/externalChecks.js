// Availability as visitors see it: the owner's PC agents fetch each public address from outside
// the server and report the result. Only the latest result per site and source is stored, so the
// table never grows; the monitor cycle turns repeated outside-only failures into one alert.
const FRESH_MS = 30 * 60000;
const MAX_TARGETS = 60;

function initializeExternalChecks(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS external_checks (
        app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE, source TEXT NOT NULL,
        checked_at TEXT NOT NULL, ok INTEGER NOT NULL, status_code INTEGER, ms INTEGER, error TEXT,
        failures INTEGER NOT NULL DEFAULT 0, failing_since TEXT, PRIMARY KEY (app_id, source)
    )`);
}

/** Public HTTPS addresses worth checking from outside (alert-silenced legacy endpoints excluded). */
function probeTargets(db) {
    return db.prepare(`SELECT id, url FROM apps WHERE url LIKE 'https://%' AND COALESCE(alerts_enabled, 1) != 0
        ORDER BY id LIMIT ${MAX_TARGETS}`).all();
}

const cleanSource = (value) => String(value || '').replace(/[^\w.-]/g, '').slice(0, 40) || 'PC';

/**
 * Stores one probe run. When most targets fail at once the probe's own connection is the likely
 * cause, so the run is kept as inconclusive and no site is marked failing.
 */
function recordProbeRun(db, source, results, now = new Date()) {
    if (!Array.isArray(results)) throw Object.assign(new Error('Expected results'), { status: 400 });
    const name = cleanSource(source);
    const known = new Set(probeTargets(db).map((target) => target.id));
    const rows = results.slice(0, MAX_TARGETS).filter((row) => known.has(Number(row?.id))).map((row) => ({
        id: Number(row.id),
        ok: row.ok === true,
        status: Number.isInteger(row.status) && row.status >= 100 && row.status < 600 ? row.status : null,
        ms: Number.isFinite(row.ms) && row.ms >= 0 && row.ms < 120000 ? Math.round(row.ms) : null,
        error: row.ok === true ? null : String(row.error || '').replace(/https?:\/\/\S+/g, '').slice(0, 120) || null,
    }));
    const failed = rows.filter((row) => !row.ok).length;
    const inconclusive = rows.length >= 4 && failed > rows.length / 2;
    const at = now.toISOString();
    db.prepare(`INSERT INTO monitor_metadata (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
        .run(`external-run:${name}`, JSON.stringify({ at, total: rows.length, failed, inconclusive }));
    if (inconclusive) return { stored: 0, inconclusive: true };
    const previous = db.prepare('SELECT failures, failing_since FROM external_checks WHERE app_id = ? AND source = ?');
    const upsert = db.prepare(`INSERT INTO external_checks (app_id, source, checked_at, ok, status_code, ms, error, failures, failing_since)
        VALUES (@id, @source, @at, @ok, @status, @ms, @error, @failures, @since)
        ON CONFLICT(app_id, source) DO UPDATE SET checked_at = excluded.checked_at, ok = excluded.ok, status_code = excluded.status_code,
        ms = excluded.ms, error = excluded.error, failures = excluded.failures, failing_since = excluded.failing_since`);
    db.transaction(() => {
        for (const row of rows) {
            const before = previous.get(row.id, name);
            upsert.run({ ...row, ok: row.ok ? 1 : 0, source: name, at,
                failures: row.ok ? 0 : (before?.failures || 0) + 1,
                since: row.ok ? null : before?.failing_since || at });
        }
    })();
    return { stored: rows.length, inconclusive: false };
}

/** Latest outside view per app, plus each source's last run. */
function externalSummary(db, now = Date.now()) {
    const byApp = new Map();
    for (const row of db.prepare('SELECT * FROM external_checks').all()) {
        const list = byApp.get(row.app_id) || [];
        list.push({ source: row.source, ok: Boolean(row.ok), status_code: row.status_code, ms: row.ms, error: row.error,
            checked_at: row.checked_at, failures: row.failures, failing_since: row.failing_since,
            fresh: now - Date.parse(row.checked_at) < FRESH_MS });
        byApp.set(row.app_id, list);
    }
    const sources = db.prepare("SELECT key, value FROM monitor_metadata WHERE key LIKE 'external-run:%'").all()
        .map(({ key, value }) => { try { return { source: key.slice(13), ...JSON.parse(value) }; } catch { return null; } })
        .filter(Boolean);
    return { byApp, sources };
}

/** Sites the server reaches but an outside probe failed twice in a row, within the last half hour. */
function outsideOnlyFailures(db, apps, now = Date.now()) {
    const { byApp } = externalSummary(db, now);
    return apps.filter((app) => app.status === 'online' && app.alerts_enabled !== 0)
        .map((app) => ({ app, failing: (byApp.get(app.id) || []).filter((row) => row.fresh && row.failures >= 2) }))
        .filter(({ failing }) => failing.length)
        .map(({ app, failing }) => ({ id: app.id, name: app.name, sources: failing.map((row) => row.source), error: failing[0].error || (failing[0].status_code ? `HTTP ${failing[0].status_code}` : '') }));
}

module.exports = { initializeExternalChecks, probeTargets, recordProbeRun, externalSummary, outsideOnlyFailures, cleanSource };
