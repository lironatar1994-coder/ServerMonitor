const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const db = require('./database');
const { findAppForSiteUrl } = require('./siteIdentity');

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
        body?.webdriver === true ? 1 : 0
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
    validateSignalBody
};
