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

function getAutomationHint({ body, ip, userAgent, path }) {
    if (body?.webdriver === true) return 1;
    const classification = getBotClassification({
        ip,
        userAgent: String(userAgent || ''),
        path,
        method: 'GET',
        status: 200
    });
    return classification.classification === 'candidate' ? 0 : 1;
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
    const automationHint = getAutomationHint({ body, ip: normalizedIp, userAgent, path: signal.path });
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
    const automationHint = getAutomationHint({ body, ip: normalizedIp, userAgent, path: signal.path });
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

    const automationHint = getAutomationHint({ body, ip: normalizedIp, userAgent, path: signal.path });
    const result = db.prepare(`
        INSERT OR IGNORE INTO browser_signals (
            app_id, event_id, occurred_at, ip, visitor_hash, session_hash,
            path, user_agent, automation_hint
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        app.id,
        signal.eventId,
        new Date().toISOString(),
        normalizedIp,
        hashIdentifier(`${app.id}:${signal.visitorId}`, key),
        hashIdentifier(`${app.id}:${signal.sessionId}`, key),
        signal.path,
        String(userAgent || '').slice(0, 1024) || null,
        automationHint
    );

    return { accepted: true, duplicate: result.changes === 0, app: app.name };
}

module.exports = {
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
