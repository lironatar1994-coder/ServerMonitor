// Availability history, response times, deployments, chart notes, web vitals and
// silent-tracker detection. Everything runs inside the existing 10-minute monitor cycle
// or on authenticated reads; nothing here adds a scheduler of its own.
const DAY = 86400000;

function initializeObservability(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS status_events (
            id INTEGER PRIMARY KEY, app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            status TEXT NOT NULL, started_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS status_events_app_time ON status_events(app_id, started_at);
        CREATE TABLE IF NOT EXISTS deploy_events (
            id INTEGER PRIMARY KEY, app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            at TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', UNIQUE(app_id, at, kind)
        );
        CREATE INDEX IF NOT EXISTS deploy_events_app_time ON deploy_events(app_id, at);
        CREATE TABLE IF NOT EXISTS chart_notes (
            id INTEGER PRIMARY KEY, app_id INTEGER REFERENCES apps(id) ON DELETE CASCADE,
            at TEXT NOT NULL, text TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS chart_notes_time ON chart_notes(at);
        CREATE TABLE IF NOT EXISTS web_vitals (
            id INTEGER PRIMARY KEY, app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            event_id TEXT NOT NULL, occurred_at TEXT NOT NULL, path TEXT NOT NULL, device TEXT NOT NULL DEFAULT '',
            lcp_ms INTEGER, inp_ms INTEGER, cls REAL, ttfb_ms INTEGER, automation_hint INTEGER NOT NULL DEFAULT 0,
            UNIQUE(app_id, event_id)
        );
        CREATE INDEX IF NOT EXISTS web_vitals_app_time ON web_vitals(app_id, occurred_at);
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE,
            p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL, last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_metrics_app_time ON metrics(app_id, timestamp DESC);
        CREATE TABLE IF NOT EXISTS insight_notifications (
            id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, category TEXT NOT NULL, app_id INTEGER,
            title TEXT NOT NULL, body TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS insight_notifications_time ON insight_notifications(created_at);
    `);
    // Push devices: per-device categories, quiet hours (Israel time) and a daily insight cap.
    db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL, last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS push_deliveries (
    id INTEGER PRIMARY KEY, subscription_id INTEGER NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    category TEXT NOT NULL, notification_key TEXT NOT NULL DEFAULT '', sent_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS push_deliveries_sub_time ON push_deliveries(subscription_id, sent_at);
    `);
    const columns = db.pragma('table_info(push_subscriptions)').map((column) => column.name);
    if (!columns.includes('categories')) db.exec("ALTER TABLE push_subscriptions ADD COLUMN categories TEXT NOT NULL DEFAULT ''");
    if (!columns.includes('quiet_start')) db.exec('ALTER TABLE push_subscriptions ADD COLUMN quiet_start INTEGER NOT NULL DEFAULT 22');
    if (!columns.includes('quiet_end')) db.exec('ALTER TABLE push_subscriptions ADD COLUMN quiet_end INTEGER NOT NULL DEFAULT 7');
    if (!columns.includes('daily_cap')) db.exec('ALTER TABLE push_subscriptions ADD COLUMN daily_cap INTEGER NOT NULL DEFAULT 5');
    if (!db.pragma('table_info(metrics)').some((column) => column.name === 'response_ms')) {
        db.exec('ALTER TABLE metrics ADD COLUMN response_ms INTEGER');
    }
}

const sqliteTime = (value) => new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`).getTime();

/** Records a status transition; seeds the first known status from the catalog. */
function recordStatus(db, app, status, now = new Date()) {
    const last = db.prepare('SELECT status FROM status_events WHERE app_id = ? ORDER BY started_at DESC, id DESC LIMIT 1').get(app.id);
    if (last?.status === status) return false;
    db.prepare('INSERT INTO status_events (app_id, status, started_at) VALUES (?, ?, ?)').run(app.id, status, now.toISOString());
    return true;
}

/** Share of observed time spent online within [from, to); unknown time before the first record is excluded. */
function availability(db, appId, from, to) {
    const start = Date.parse(from), end = Date.parse(to);
    const before = db.prepare('SELECT status, started_at FROM status_events WHERE app_id = ? AND started_at < ? ORDER BY started_at DESC, id DESC LIMIT 1').get(appId, from);
    const inside = db.prepare('SELECT status, started_at FROM status_events WHERE app_id = ? AND started_at >= ? AND started_at < ? ORDER BY started_at, id').all(appId, from, to);
    const events = [...(before ? [{ ...before, started_at: from }] : []), ...inside];
    let observed = 0, online = 0;
    const outages = [];
    events.forEach((event, index) => {
        const segmentStart = Math.max(start, Date.parse(event.started_at));
        const segmentEnd = Math.min(end, Date.now(), index + 1 < events.length ? Date.parse(events[index + 1].started_at) : end);
        if (segmentEnd <= segmentStart) return;
        observed += segmentEnd - segmentStart;
        if (event.status === 'online') online += segmentEnd - segmentStart;
        else outages.push({ status: event.status, from: new Date(segmentStart).toISOString(), to: new Date(segmentEnd).toISOString(),
            ongoing: index + 1 === events.length && segmentEnd >= Math.min(end, Date.now()) - 1000 });
    });
    return { percent: observed ? Math.round((online / observed) * 10000) / 100 : null, observed_ms: observed, outages: outages.slice(-20).reverse() };
}

function availabilitySummary(db, now = Date.now()) {
    const apps = db.prepare('SELECT id, name, status, status_changed_at, url, pm2_name, systemd_unit, analytics_enabled FROM apps ORDER BY name').all();
    const range = (days) => [new Date(now - days * DAY).toISOString(), new Date(now).toISOString()];
    return apps.map((app) => {
        const week = availability(db, app.id, ...range(7));
        const month = availability(db, app.id, ...range(30));
        const latency = db.prepare(`SELECT AVG(response_ms) AS avg, MAX(response_ms) AS max FROM metrics
            WHERE app_id = ? AND response_ms IS NOT NULL AND timestamp >= datetime('now', '-1 day')`).get(app.id);
        const last = db.prepare('SELECT response_ms FROM metrics WHERE app_id = ? ORDER BY timestamp DESC LIMIT 1').get(app.id);
        return { ...app, week: week.percent, month: month.percent, outages: month.outages.slice(0, 5),
            response_ms: last?.response_ms ?? null, response_avg_ms: latency?.avg == null ? null : Math.round(latency.avg), response_max_ms: latency?.max ?? null };
    });
}

/** Records runtime starts (PM2 restarts, systemd activations) so charts can mark deployments. */
function recordRuntimeStarts(db, starts) {
    const insert = db.prepare('INSERT OR IGNORE INTO deploy_events (app_id, at, kind, detail) VALUES (?, ?, ?, ?)');
    const key = db.prepare('SELECT value FROM monitor_metadata WHERE key = ?');
    const save = db.prepare('INSERT INTO monitor_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const { appId, startedAt, detail } of starts) {
        if (!startedAt || !Number.isFinite(Date.parse(startedAt))) continue;
        const name = `runtime-start:${appId}`;
        const previous = key.get(name)?.value;
        // Start times jitter by a second between samples; only a real restart moves them further.
        if (previous && Math.abs(Date.parse(previous) - Date.parse(startedAt)) < 60000) continue;
        save.run(name, startedAt);
        if (previous) insert.run(appId, new Date(startedAt).toISOString(), 'start', detail || '');
    }
}

function timeline(db, appId, from, to) {
    const scope = appId ? 'AND (app_id = ? OR app_id IS NULL)' : '';
    const params = appId ? [from, to, appId] : [from, to];
    const notes = db.prepare(`SELECT id, app_id, at, text, author FROM chart_notes WHERE at >= ? AND at < ? ${scope} ORDER BY at`).all(...params);
    const deploys = db.prepare(`SELECT d.app_id, d.at, d.kind, d.detail, a.name FROM deploy_events d JOIN apps a ON a.id = d.app_id
        WHERE d.at >= ? AND d.at < ? ${appId ? 'AND d.app_id = ?' : ''} ORDER BY d.at`).all(...params);
    return { notes, deploys };
}

function validateNote(body) {
    const text = String(body?.text || '').trim();
    const at = new Date(body?.at || Date.now());
    if (!text || text.length > 200) throw Object.assign(new Error('ההערה צריכה להכיל עד 200 תווים.'), { status: 400 });
    if (!Number.isFinite(at.getTime()) || Math.abs(Date.now() - at.getTime()) > 400 * DAY) throw Object.assign(new Error('תאריך לא תקין.'), { status: 400 });
    const appId = body?.app_id == null || body.app_id === '' ? null : Number(body.app_id);
    if (appId !== null && !Number.isInteger(appId)) throw Object.assign(new Error('אתר לא תקין.'), { status: 400 });
    return { text, at: at.toISOString(), appId };
}

/** Pages real visitors reached that answered 404 (assets and automation excluded). */
function notFoundPages(db, appId, from, to, limit = 20) {
    return db.prepare(`SELECT path, COUNT(*) AS hits, COUNT(DISTINCT ip) AS visitors, MAX(occurred_at) AS last_seen,
            (SELECT referrer FROM visitor_events r WHERE r.app_id = e.app_id AND r.path = e.path AND r.status = 404
                AND r.referrer IS NOT NULL AND r.referrer NOT IN ('', '-') ORDER BY r.occurred_at DESC LIMIT 1) AS referrer
        FROM visitor_events e
        WHERE app_id = ? AND is_bot = 0 AND is_page_view = 0 AND occurred_at >= ? AND occurred_at < ?
          AND status = 404 AND method IN ('GET', 'HEAD')
          AND path NOT GLOB '*.[a-zA-Z0-9]*' AND path NOT LIKE '/.well-known/%' AND path NOT LIKE '%/wp-%'
        GROUP BY path ORDER BY visitors DESC, hits DESC LIMIT ?`).all(appId, from, to, limit);
}

const VITALS_LIMITS = { lcp_ms: [0, 120000], inp_ms: [0, 60000], cls: [0, 10], ttfb_ms: [0, 120000] };

function cleanVitals(body) {
    const values = {};
    for (const [field, [min, max]] of Object.entries(VITALS_LIMITS)) {
        const value = body?.[field.replace(/_ms$/, '')] ?? body?.[field];
        values[field] = value == null || value === '' ? null : Number(value);
        if (values[field] !== null && (!Number.isFinite(values[field]) || values[field] < min || values[field] > max)) values[field] = null;
        if (values[field] !== null && field !== 'cls') values[field] = Math.round(values[field]);
    }
    return values;
}

/** p75 per metric, the threshold Google uses for "good" Core Web Vitals. */
function vitalsSummary(db, appId, from, to) {
    const rows = db.prepare(`SELECT path, device, lcp_ms, inp_ms, cls, ttfb_ms FROM web_vitals
        WHERE app_id = ? AND automation_hint = 0 AND occurred_at >= ? AND occurred_at < ?`).all(appId, from, to);
    const p75 = (values) => {
        const sorted = values.filter((value) => value != null).sort((a, b) => a - b);
        return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))] : null;
    };
    const summarise = (items) => ({ samples: items.length, lcp_ms: p75(items.map((r) => r.lcp_ms)), inp_ms: p75(items.map((r) => r.inp_ms)),
        cls: p75(items.map((r) => r.cls)), ttfb_ms: p75(items.map((r) => r.ttfb_ms)) });
    const byPath = new Map();
    rows.forEach((row) => byPath.set(row.path, [...(byPath.get(row.path) || []), row]));
    return {
        overall: summarise(rows),
        mobile: summarise(rows.filter((row) => row.device === 'mobile')),
        desktop: summarise(rows.filter((row) => row.device !== 'mobile')),
        pages: [...byPath.entries()].map(([path, items]) => ({ path, ...summarise(items) }))
            .filter((item) => item.samples >= 3).sort((a, b) => (b.lcp_ms || 0) - (a.lcp_ms || 0)).slice(0, 10)
    };
}

/**
 * Real visitors reached the server but no browser signal arrived: the tracker probably
 * stopped working. Requires prior browser activity so new or quiet sites never trigger it.
 */
function silentTrackers(db, now = Date.now()) {
    const recentFrom = new Date(now - 6 * 3600000).toISOString();
    const priorFrom = new Date(now - 7 * DAY).toISOString();
    const apps = db.prepare("SELECT id, name FROM apps WHERE analytics_enabled = 1 AND reporting_enabled = 1 AND url IS NOT NULL AND trim(url) <> ''").all();
    return apps.filter((app) => {
        const prior = db.prepare('SELECT COUNT(*) AS n FROM browser_signals WHERE app_id = ? AND automation_hint = 0 AND occurred_at >= ? AND occurred_at < ?').get(app.id, priorFrom, recentFrom).n;
        if (prior < 30) return false;
        const recent = db.prepare('SELECT COUNT(*) AS n FROM browser_signals WHERE app_id = ? AND automation_hint = 0 AND occurred_at >= ?').get(app.id, recentFrom).n;
        if (recent > 0) return false;
        const server = db.prepare('SELECT COUNT(DISTINCT ip) AS n FROM visitor_events WHERE app_id = ? AND is_bot = 0 AND is_page_view = 1 AND occurred_at >= ?').get(app.id, recentFrom).n;
        return server >= 3;
    });
}

module.exports = { initializeObservability, recordStatus, availability, availabilitySummary, recordRuntimeStarts, timeline,
    validateNote, notFoundPages, cleanVitals, vitalsSummary, silentTrackers, sqliteTime };
