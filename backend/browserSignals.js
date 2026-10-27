const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const db = require('./database');
const { findAppForSiteUrl } = require('./siteIdentity');
const { getBotClassification } = require('./logParser');

const DEFAULT_KEY_PATH = '/root/.visitor-signal-key';
const ID_PATTERN = /^[A-Za-z0-9_-]{16,96}$/;

function getSignalKey() {
    const environmentKey = (process.env.VISITOR_SIGNAL_KEY || '').trim();
    if (environmentKey) return environmentKey;

    const keyPath = process.env.VISITOR_SIGNAL_KEY_FILE || DEFAULT_KEY_PATH;
    try {
        return fs.readFileSync(keyPath, 'utf8').trim();
    } catch {
        return '';
    }
}

function isAuthorizedSignal(provided) {
    const expected = getSignalKey();
    const candidate = String(provided || '');
    const expectedBuffer = Buffer.from(expected);
    const candidateBuffer = Buffer.from(candidate);
    return Boolean(
        expected &&
        expectedBuffer.length === candidateBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, candidateBuffer)
    );
}

function normalizeIp(value) {
    const candidate = String(value || '').split(',')[0].trim().replace(/^::ffff:/, '');
    return net.isIP(candidate) ? candidate : '';
}

function normalizePath(value) {
    const candidate = String(value || '').trim();
    if (!candidate.startsWith('/') || candidate.length > 2048) return '';
    const path = candidate.split('?')[0].replace(/\/{2,}/g, '/');
    if (/^\/(?:api|_next)(?:\/|$)/i.test(path)) return '';
    return path || '/';
}

function hashIdentifier(value, key) {
    return crypto.createHmac('sha256', key).update(value).digest('hex');
}

function validateSignalBody(body) {
    const eventId = String(body?.event_id || '').trim();
    const visitorId = String(body?.visitor_id || '').trim();
    const sessionId = String(body?.session_id || '').trim();
    const path = normalizePath(body?.path);

    if (!ID_PATTERN.test(eventId) || !ID_PATTERN.test(visitorId) || !ID_PATTERN.test(sessionId) || !path) {
        const error = new Error('Invalid browser signal');
        error.status = 400;
        throw error;
    }
    return { eventId, visitorId, sessionId, path };
}

const ZONE_PATTERN = /^[A-Za-z0-9_.:\-֐-׿ ]{1,64}$/;
const MAX_ZONES_PER_EVENT = 30;
const MAX_VIEWS_PER_EVENT = 24;
const MAX_HEATMAP_CELLS_PER_EVENT = 60;
const PRODUCT_EVENT_TYPES = new Set([
    'editor_saved',
    'file_downloaded',
    'file_opened',
    'operation_failed',
    'session_restored',
    'tool_completed',
    'tool_opened'
]);
const PRODUCT_LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;
const VIEWPORT_CLASSES = new Set(['mobile', 'tablet', 'desktop']);

function clampInteger(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.min(max, Math.max(min, Math.round(number)));
}

function validateEngagementBody(body) {
    const base = validateSignalBody(body);
    const scrollDepth = clampInteger(body?.scroll_depth, 0, 100);
    if (scrollDepth === null) {
        const error = new Error('Invalid engagement signal');
        error.status = 400;
        throw error;
    }
    const zones = [];
    const seen = new Set();
    for (const entry of Array.isArray(body?.zones) ? body.zones : []) {
        const zone = String(entry?.zone || '').trim().slice(0, 64);
        const taps = clampInteger(entry?.taps, 1, 500);
        if (!zone || !ZONE_PATTERN.test(zone) || taps === null || seen.has(zone)) continue;
        seen.add(zone);
        zones.push({ zone, taps });
        if (zones.length >= MAX_ZONES_PER_EVENT) break;
    }
    const views = [];
    const seenViews = new Set();
    for (const entry of Array.isArray(body?.views) ? body.views : []) {
        const zone = String(entry?.zone || '').trim().slice(0, 64);
        const count = clampInteger(entry?.views, 1, 100);
        const dwellMs = clampInteger(entry?.dwell_ms, 0, 86400000);
        if (!zone || !ZONE_PATTERN.test(zone) || count === null || dwellMs === null || seenViews.has(zone)) continue;
        seenViews.add(zone);
        views.push({ zone, views: count, dwellMs });
        if (views.length >= MAX_VIEWS_PER_EVENT) break;
    }
    const heatmap = [];
    const seenCells = new Set();
    for (const entry of Array.isArray(body?.heatmap) ? body.heatmap : []) {
        const x = clampInteger(entry?.x, 0, 11);
        const y = clampInteger(entry?.y, 0, 11);
        const taps = clampInteger(entry?.taps, 1, 500);
        const cellKey = `${x}:${y}`;
        if (x === null || y === null || taps === null || seenCells.has(cellKey)) continue;
        seenCells.add(cellKey);
        heatmap.push({ x, y, taps });
        if (heatmap.length >= MAX_HEATMAP_CELLS_PER_EVENT) break;
    }
    return {
        ...base,
        scrollDepth,
        zones,
        views,
        heatmap,
        dwellMs: clampInteger(body?.dwell_ms, 0, 86400000) ?? 0,
        viewportWidth: clampInteger(body?.viewport_width, 0, 10000),
        viewportClass: VIEWPORT_CLASSES.has(body?.viewport_class) ? body.viewport_class : 'desktop'
    };
}

function validateProductEventBody(body) {
    const base = validateSignalBody(body);
    const eventType = String(body?.event_type || '').trim();
    const label = String(body?.label || '').trim().toLowerCase();
    if (!PRODUCT_EVENT_TYPES.has(eventType) || !PRODUCT_LABEL_PATTERN.test(label)) {
        const error = new Error('Invalid product event');
        error.status = 400;
        throw error;
    }
    const value = body?.value === undefined || body?.value === null
        ? null
        : clampInteger(body.value, 0, 1000000000);
    if (body?.value !== undefined && body?.value !== null && value === null) {
        const error = new Error('Invalid product event value');
        error.status = 400;
        throw error;
    }
    return { ...base, eventType, label, value };
}

function getAutomationHint({ body, ip, userAgent, path, appId }) {
    if (body?.webdriver === true) return 1;
    const classification = getBotClassification({
        ip,
        userAgent: String(userAgent || ''),
        path,
        method: 'GET',
        status: 200
    });
    if (classification.classification === 'candidate') return 0;
    // 2 = hosting network, pending: counted once the same session shows real interaction.
    if (classification.reason !== 'hosting network') return 1;
    if (appId && ID_PATTERN.test(String(body?.session_id || ''))) {
        const scope = body?.kind === 'growth' ? 'growth' : 'browser';
        const hash = hashIdentifier(`${appId}:${scope === 'growth' ? 'growth:' : ''}${body.session_id}`, getSignalKey());
        const since = new Date(Date.now() - 30 * 60000).toISOString();
        if (db.prepare('SELECT 1 FROM browser_interactions WHERE app_id=? AND session_hash=? AND scope=? AND occurred_at>=?')
            .get(appId, hash, scope, since)) return 0;
    }
    return 2;
}

/* Engagement is a second, later beacon for the same page view. It must never
   create visitor or page-view rows, or one visit would be counted twice. */
function recordEngagementSignal({ body, ip, userAgent, siteUrl }) {
    const key = getSignalKey();
    if (!key) {
        const error = new Error('Browser signal integration is not configured');
        error.status = 503;
        throw error;
    }
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp) {
        const error = new Error('Invalid visitor address');
        error.status = 400;
        throw error;
    }
    const signal = validateEngagementBody(body);
    const app = findSignalApp(siteUrl);
    if (!app) {
        const error = new Error('Browser signal site is not configured');
        error.status = 400;
        throw error;
    }
    const automationHint = getAutomationHint({ body, ip: normalizedIp, userAgent, path: signal.path, appId: app.id });
    const occurredAt = new Date().toISOString();

    const result = db.prepare(`
        INSERT OR IGNORE INTO engagement_signals (
            app_id, event_id, occurred_at, session_hash, path,
            scroll_depth, dwell_ms, viewport_width, automation_hint
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        app.id,
        signal.eventId,
        occurredAt,
        hashIdentifier(`${app.id}:${signal.sessionId}`, key),
        signal.path,
        signal.scrollDepth,
        signal.dwellMs,
        signal.viewportWidth,
        automationHint
    );

    if (result.changes > 0 && signal.zones.length) {
        const insertZone = db.prepare(`
            INSERT OR IGNORE INTO engagement_zones (
                app_id, event_id, occurred_at, path, zone, taps, automation_hint
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        db.transaction((rows) => {
            for (const row of rows) {
                insertZone.run(app.id, signal.eventId, occurredAt, signal.path, row.zone, row.taps, automationHint);
            }
        })(signal.zones);
    }

    if (result.changes > 0 && signal.views.length) {
        const insertView = db.prepare(`
            INSERT OR IGNORE INTO engagement_zone_views (
                app_id, event_id, occurred_at, path, zone, views, dwell_ms, automation_hint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        db.transaction((rows) => {
            for (const row of rows) {
                insertView.run(app.id, signal.eventId, occurredAt, signal.path, row.zone, row.views, row.dwellMs, automationHint);
            }
        })(signal.views);
    }

    if (result.changes > 0 && signal.heatmap.length) {
        const insertCell = db.prepare(`
            INSERT OR IGNORE INTO engagement_heatmap_cells (
                app_id, event_id, occurred_at, path, viewport_class, cell_x, cell_y, taps, automation_hint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        db.transaction((rows) => {
            for (const row of rows) {
                insertCell.run(app.id, signal.eventId, occurredAt, signal.path, signal.viewportClass, row.x, row.y, row.taps, automationHint);
            }
        })(signal.heatmap);
    }

    return { accepted: true, duplicate: result.changes === 0, app: app.name };
}

function recordProductEvent({ body, ip, userAgent, siteUrl }) {
    const key = getSignalKey();
    if (!key) {
        const error = new Error('Browser signal integration is not configured');
        error.status = 503;
        throw error;
    }
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp) {
        const error = new Error('Invalid visitor address');
        error.status = 400;
        throw error;
    }
    const signal = validateProductEventBody(body);
    const app = findSignalApp(siteUrl);
    if (!app) {
        const error = new Error('Browser signal site is not configured');
        error.status = 400;
        throw error;
    }
    const automationHint = getAutomationHint({ body, ip: normalizedIp, userAgent, path: signal.path, appId: app.id });
    const result = db.prepare(`
        INSERT OR IGNORE INTO product_events (
            app_id, event_id, occurred_at, visitor_hash, session_hash, path,
            event_type, label, value, automation_hint
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        app.id,
        signal.eventId,
        new Date().toISOString(),
        hashIdentifier(`${app.id}:${signal.visitorId}`, key),
        hashIdentifier(`${app.id}:${signal.sessionId}`, key),
        signal.path,
        signal.eventType,
        signal.label,
        signal.value,
        automationHint
    );

    return { accepted: true, duplicate: result.changes === 0, app: app.name };
}

function findSignalApp(siteUrl) {
    const apps = db.prepare(`
        SELECT id, name, url
        FROM apps
        WHERE analytics_enabled = 1 AND url IS NOT NULL
    `).all();
    return findAppForSiteUrl(apps, siteUrl);
}

function recordBrowserSignal({ body, ip, userAgent, siteUrl }) {
    const key = getSignalKey();
    if (!key) {
        const error = new Error('Browser signal integration is not configured');
        error.status = 503;
        throw error;
    }
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp) {
        const error = new Error('Invalid visitor address');
        error.status = 400;
        throw error;
    }
    const signal = validateSignalBody(body);
    const app = findSignalApp(siteUrl);
    if (!app) {
        const error = new Error('Browser signal site is not configured');
        error.status = 400;
        throw error;
    }

    const automationHint = getAutomationHint({ body, ip: normalizedIp, userAgent, path: signal.path, appId: app.id });
    const occurredAt = new Date().toISOString();
    const visitorHash = hashIdentifier(`${app.id}:${signal.visitorId}`, key);
    const sessionHash = hashIdentifier(`${app.id}:${signal.sessionId}`, key);
    const previous = db.prepare(`SELECT visit_hash, occurred_at FROM browser_signals
        WHERE app_id=? AND visitor_hash=? AND session_hash=? ORDER BY occurred_at DESC, id DESC LIMIT 1`)
        .get(app.id, visitorHash, sessionHash);
    const visitHash = previous && Date.parse(occurredAt) - Date.parse(previous.occurred_at) < 30 * 60000
        ? previous.visit_hash : signal.eventId;
    const result = db.prepare(`
        INSERT OR IGNORE INTO browser_signals (
            app_id, event_id, occurred_at, ip, visitor_hash, session_hash,
            path, user_agent, automation_hint, visit_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        app.id,
        signal.eventId,
        occurredAt,
        normalizedIp,
        visitorHash,
        sessionHash,
        signal.path,
        String(userAgent || '').slice(0, 1024) || null,
        automationHint,
        visitHash
    );

    return { accepted: true, duplicate: result.changes === 0, app: app.name };
}

/**
 * A first pointer, key, touch or scroll in a session. Signals from hosting networks wait as
 * automation_hint 2 and count only once their own session interacts; scripted browsers
 * (bot user agents, webdriver) never release them.
 */
function recordInteraction({ body, ip, userAgent, siteUrl }) {
    const key = getSignalKey();
    const normalizedIp = normalizeIp(ip);
    const sessionId = String(body?.session_id || '').trim();
    if (!key || !normalizedIp || !ID_PATTERN.test(sessionId) || !ID_PATTERN.test(String(body?.event_id || ''))) {
        const error = new Error('Invalid interaction');
        error.status = 400;
        throw error;
    }
    const app = findSignalApp(siteUrl);
    if (!app) {
        const error = new Error('Browser signal site is not configured');
        error.status = 400;
        throw error;
    }
    if (getAutomationHint({ body, ip: normalizedIp, userAgent, path: '/' }) === 1) return { accepted: true, released: 0, app: app.name };
    let released = 0;
    const scope = body.scope === 'growth' ? 'growth' : 'browser';
    const sessionHash = hashIdentifier(`${app.id}:${scope === 'growth' ? 'growth:' : ''}${sessionId}`, key);
    const occurredAt = new Date().toISOString();
    db.prepare(`INSERT INTO browser_interactions(app_id,session_hash,scope,occurred_at) VALUES(?,?,?,?)
        ON CONFLICT(app_id,session_hash,scope) DO UPDATE SET occurred_at=excluded.occurred_at`)
        .run(app.id, sessionHash, scope, occurredAt);
    const since = new Date(Date.now() - 30 * 60000).toISOString();
    if (body.scope === 'growth') {
        const hash = crypto.createHmac('sha256', key).update(`${app.id}:growth:${sessionId}`).digest('hex');
        released += db.prepare('UPDATE growth_events SET automation_hint = 0 WHERE app_id = ? AND session_hash = ? AND automation_hint = 2 AND occurred_at >= ?').run(app.id, hash, since).changes;
    } else {
        const hash = hashIdentifier(`${app.id}:${sessionId}`, key);
        for (const table of ['browser_signals', 'engagement_signals', 'product_events']) {
            released += db.prepare(`UPDATE ${table} SET automation_hint = 0 WHERE app_id = ? AND session_hash = ? AND automation_hint = 2 AND occurred_at >= ?`).run(app.id, hash, since).changes;
        }
        for (const table of ['engagement_zones', 'engagement_zone_views', 'engagement_heatmap_cells']) {
            db.prepare(`UPDATE ${table} SET automation_hint=0 WHERE app_id=? AND automation_hint=2 AND event_id IN
                (SELECT event_id FROM engagement_signals WHERE app_id=? AND session_hash=? AND automation_hint=0 AND occurred_at>=?)`)
                .run(app.id, app.id, hash, since);
        }
    }
    return { accepted: true, released, app: app.name };
}

/** One page's Core Web Vitals (LCP, INP, CLS, TTFB); no identifiers beyond the event ID. */
function recordWebVitals({ body, ip, userAgent, siteUrl }) {
    const normalizedIp = normalizeIp(ip);
    const eventId = String(body?.event_id || '').trim();
    const path = normalizePath(body?.path);
    if (!normalizedIp || !ID_PATTERN.test(eventId) || !path) {
        const error = new Error('Invalid web vitals');
        error.status = 400;
        throw error;
    }
    const app = findSignalApp(siteUrl);
    if (!app) {
        const error = new Error('Browser signal site is not configured');
        error.status = 400;
        throw error;
    }
    const values = require('./observability').cleanVitals(body);
    if (Object.values(values).every((value) => value === null)) {
        const error = new Error('Invalid web vitals');
        error.status = 400;
        throw error;
    }
    const device = VIEWPORT_CLASSES.has(body?.viewport_class) ? body.viewport_class : '';
    const result = db.prepare(`INSERT OR IGNORE INTO web_vitals
        (app_id, event_id, occurred_at, path, device, lcp_ms, inp_ms, cls, ttfb_ms, automation_hint)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(app.id, eventId, new Date().toISOString(), path, device,
        values.lcp_ms, values.inp_ms, values.cls, values.ttfb_ms, getAutomationHint({ body, ip: normalizedIp, userAgent, path }));
    return { accepted: true, duplicate: result.changes === 0, app: app.name };
}

module.exports = {
    recordInteraction,
    recordWebVitals,
    getAutomationHint,
    getSignalKey,
    findSignalApp,
    isAuthorizedSignal,
    normalizeIp,
    normalizePath,
    recordBrowserSignal,
    recordEngagementSignal,
    recordProductEvent,
    validateSignalBody,
    validateEngagementBody,
    validateProductEventBody
};
