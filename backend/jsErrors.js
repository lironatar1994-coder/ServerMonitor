// Anonymous JavaScript error counts from the first-party visitor tracker. Each error is folded
// into one daily row per site, page and signature, so storage stays bounded however often it
// repeats. Messages lose URLs, e-mail addresses and long numbers before they are stored.
const crypto = require('crypto');

const MAX_ROWS_PER_APP_DAY = 200;
const RETENTION_DAYS = 30;

function initializeJsErrors(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS js_errors (
        app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE, day TEXT NOT NULL, path TEXT NOT NULL,
        signature TEXT NOT NULL, name TEXT NOT NULL, message TEXT NOT NULL, source TEXT NOT NULL DEFAULT '',
        line INTEGER, count INTEGER NOT NULL DEFAULT 0, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
        PRIMARY KEY (app_id, day, path, signature)
    )`);
}

function cleanMessage(value) {
    return String(value || '')
        .replace(/https?:\/\/\S+/gi, '<url>')
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
        .replace(/\d{4,}/g, '<n>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
}

/** Only a script's file name, never its query string or another origin's path. */
function cleanSource(value) {
    const name = String(value || '').split(/[?#]/)[0].split('/').pop();
    return /^[\w.-]{1,80}$/.test(name) ? name : '';
}

function recordJsError({ body, ip, userAgent, siteUrl }, now = new Date()) {
    const { findSignalApp, normalizeIp, normalizePath, getAutomationHint } = require('./browserSignals');
    const fail = (message) => Object.assign(new Error(message), { status: 400 });
    const normalizedIp = normalizeIp(ip);
    const path = normalizePath(body?.path);
    const message = cleanMessage(body?.message);
    if (!normalizedIp || !path || !message || message === 'Script error.') throw fail('Invalid error report');
    const app = findSignalApp(siteUrl);
    if (!app) throw fail('Browser signal site is not configured');
    if (getAutomationHint({ body, ip: normalizedIp, userAgent, path }) === 1) return { accepted: true, ignored: 'automation', app: app.name };
    const name = /^[A-Za-z]{1,40}$/.test(body?.name) ? body.name : 'Error';
    const source = cleanSource(body?.source);
    const line = Number.isInteger(body?.line) && body.line > 0 && body.line < 1e7 ? body.line : null;
    const signature = crypto.createHash('sha256').update(`${name}|${message}|${source}|${line ?? ''}`).digest('hex').slice(0, 16);
    const day = now.toISOString().slice(0, 10);
    const at = now.toISOString();
    const update = db().prepare('UPDATE js_errors SET count = count + 1, last_seen = ? WHERE app_id = ? AND day = ? AND path = ? AND signature = ?')
        .run(at, app.id, day, path, signature);
    if (!update.changes) {
        const rows = db().prepare('SELECT COUNT(*) AS n FROM js_errors WHERE app_id = ? AND day = ?').get(app.id, day).n;
        if (rows >= MAX_ROWS_PER_APP_DAY) return { accepted: true, ignored: 'daily limit', app: app.name };
        db().prepare(`INSERT INTO js_errors (app_id, day, path, signature, name, message, source, line, count, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(app.id, day, path, signature, name, message, source, line, at, at);
    }
    return { accepted: true, app: app.name };
}

/** The most frequent errors in a period, across pages. */
function jsErrorSummary(database, appId, from, to, limit = 15) {
    const errors = database.prepare(`SELECT signature, name, message, source, line, SUM(count) AS count,
            COUNT(DISTINCT path) AS pages, MIN(first_seen) AS first_seen, MAX(last_seen) AS last_seen,
            (SELECT path FROM js_errors p WHERE p.app_id = e.app_id AND p.signature = e.signature AND p.day BETWEEN ? AND ?
                GROUP BY path ORDER BY SUM(count) DESC LIMIT 1) AS top_path
        FROM js_errors e WHERE app_id = ? AND day BETWEEN ? AND ?
        GROUP BY signature ORDER BY count DESC LIMIT ?`)
        .all(from.slice(0, 10), to.slice(0, 10), appId, from.slice(0, 10), to.slice(0, 10), limit);
    const total = database.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM js_errors WHERE app_id = ? AND day BETWEEN ? AND ?')
        .get(appId, from.slice(0, 10), to.slice(0, 10)).n;
    return { total, errors };
}

const db = () => require('./database');

module.exports = { initializeJsErrors, recordJsError, jsErrorSummary, cleanMessage, cleanSource, RETENTION_DAYS };
