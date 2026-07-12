const express = require('express');
const db = require('../database');
const { authenticateToken } = require('./auth');

const router = express.Router();
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

router.use(authenticateToken);

function parseRange(query) {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const from = query.from ? new Date(query.from) : defaultFrom;
    const to = query.to ? new Date(query.to) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
        const error = new Error('Invalid date range');
        error.status = 400;
        throw error;
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
        const error = new Error('Date range cannot exceed 90 days');
        error.status = 400;
        throw error;
    }
    return { from: from.toISOString(), to: to.toISOString(), duration: to - from };
}

function getSummary(appId, range) {
    const appClause = appId ? 'AND app_id = ?' : '';
    const params = appId ? [range.from, range.to, appId] : [range.from, range.to];
    const summary = db.prepare(`
        SELECT
            COUNT(*) AS total_requests,
            SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) AS human_requests,
            SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_requests,
            COUNT(DISTINCT CASE WHEN is_bot = 0 THEN ip END) AS unique_humans,
            COUNT(DISTINCT CASE WHEN is_bot = 1 THEN ip END) AS unique_bots
        FROM visitor_events
        WHERE occurred_at >= ? AND occurred_at < ? ${appClause}
    `).get(...params);
    const activeParams = [new Date(Date.now() - 5 * 60 * 1000).toISOString()];
    if (appId) activeParams.push(appId);
    const active = db.prepare(`
        SELECT COUNT(DISTINCT ip) AS active_humans
        FROM visitor_events
        WHERE is_bot = 0 AND occurred_at >= ?
        ${appId ? 'AND app_id = ?' : ''}
    `).get(...activeParams);
    const mix = db.prepare(`
        SELECT
            SUM(CASE WHEN first_seen >= @from THEN 1 ELSE 0 END) AS new_humans,
            SUM(CASE WHEN first_seen < @from THEN 1 ELSE 0 END) AS returning_humans
        FROM (
            SELECT e.ip, (
                SELECT MIN(previous.occurred_at) FROM visitor_events previous
                WHERE previous.ip = e.ip AND previous.is_bot = 0
                ${appId ? 'AND previous.app_id = @appId' : ''}
            ) AS first_seen
            FROM visitor_events e
            WHERE e.is_bot = 0 AND e.occurred_at >= @from AND e.occurred_at < @to
            ${appId ? 'AND e.app_id = @appId' : ''}
            GROUP BY e.ip
        )
    `).get({ from: range.from, to: range.to, appId: appId || null });
    return {
        total_requests: Number(summary.total_requests) || 0,
        human_requests: Number(summary.human_requests) || 0,
        bot_requests: Number(summary.bot_requests) || 0,
        unique_humans: Number(summary.unique_humans) || 0,
        unique_bots: Number(summary.unique_bots) || 0,
        active_humans: Number(active.active_humans) || 0,
        new_humans: Number(mix.new_humans) || 0,
        returning_humans: Number(mix.returning_humans) || 0
    };
}

function getComparison(appId, range, summary) {
    const from = new Date(range.from);
    const previous = {
        from: new Date(from.getTime() - range.duration).toISOString(),
        to: range.from
    };
    const previousSummary = getSummary(appId, previous);
    const delta = (current, before) => before > 0 ? ((current - before) / before) * 100 : current > 0 ? 100 : 0;
    return {
        unique_humans_percent: delta(summary.unique_humans, previousSummary.unique_humans),
        human_requests_percent: delta(summary.human_requests, previousSummary.human_requests),
        previous: previousSummary
    };
}

function getSeries(appId, range) {
    const hourly = range.duration <= 48 * 60 * 60 * 1000;
    const bucket = hourly
        ? "strftime('%Y-%m-%dT%H:00:00Z', occurred_at)"
        : "strftime('%Y-%m-%d', occurred_at)";
    const params = appId ? [range.from, range.to, appId] : [range.from, range.to];
    return db.prepare(`
        SELECT ${bucket} AS bucket,
            COUNT(DISTINCT CASE WHEN is_bot = 0 THEN ip END) AS unique_humans,
            SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) AS human_requests,
            SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_requests
        FROM visitor_events
        WHERE occurred_at >= ? AND occurred_at < ? ${appId ? 'AND app_id = ?' : ''}
        GROUP BY bucket ORDER BY bucket ASC
    `).all(...params);
}

function getRankedDimension(appId, range, column, limit = 8) {
    const allowed = new Set(['path', 'referrer', 'device_type', 'city', 'region', 'status']);
    if (!allowed.has(column)) return [];
    const params = [range.from, range.to];
    if (appId) params.push(appId);
    params.push(limit);
    return db.prepare(`
        SELECT COALESCE(NULLIF(${column}, ''), 'לא ידוע') AS label,
            COUNT(*) AS requests,
            COUNT(DISTINCT ip) AS unique_visitors
        FROM visitor_events
        WHERE occurred_at >= ? AND occurred_at < ? AND is_bot = 0
          ${appId ? 'AND app_id = ?' : ''}
        GROUP BY label ORDER BY requests DESC, label ASC LIMIT ?
    `).all(...params);
}

function getRecent(appId, range, limit = 12) {
    const params = [range.from, range.to];
    if (appId) params.push(appId);
    params.push(limit);
    return db.prepare(`
        SELECT e.ip, e.occurred_at, e.path, e.referrer, e.device_type,
               e.city, e.region, a.id AS app_id, a.name AS app_name
        FROM visitor_events e
        JOIN apps a ON a.id = e.app_id
        WHERE e.occurred_at >= ? AND e.occurred_at < ? AND e.is_bot = 0
          ${appId ? 'AND e.app_id = ?' : ''}
        ORDER BY e.occurred_at DESC LIMIT ?
    `).all(...params);
}

function getSiteRanking(range) {
    return db.prepare(`
        SELECT a.id AS app_id, a.name, a.url,
            COUNT(DISTINCT CASE WHEN e.is_bot = 0 THEN e.ip END) AS unique_humans,
            SUM(CASE WHEN e.is_bot = 0 THEN 1 ELSE 0 END) AS human_requests,
            SUM(CASE WHEN e.is_bot = 1 THEN 1 ELSE 0 END) AS bot_requests
        FROM apps a
        LEFT JOIN visitor_events e ON e.app_id = a.id
            AND e.occurred_at >= ? AND e.occurred_at < ?
        WHERE a.log_path IS NOT NULL
        GROUP BY a.id ORDER BY unique_humans DESC, human_requests DESC, a.name ASC
    `).all(range.from, range.to);
}

function getHourly(appId, range) {
    return db.prepare(`
        SELECT CAST(strftime('%H', occurred_at, '+3 hours') AS INTEGER) AS hour,
            COUNT(*) AS requests, COUNT(DISTINCT ip) AS unique_visitors
        FROM visitor_events
        WHERE app_id = ? AND occurred_at >= ? AND occurred_at < ? AND is_bot = 0
        GROUP BY hour ORDER BY hour ASC
    `).all(appId, range.from, range.to);
}

function assertApp(appId) {
    const app = db.prepare('SELECT id, name, url, status FROM apps WHERE id = ?').get(appId);
    if (!app) {
        const error = new Error('App not found');
        error.status = 404;
        throw error;
    }
    return app;
}

function respondError(res, error) {
    res.status(error.status || 500).json({ error: error.message });
}

router.get('/overview', (req, res) => {
    try {
        const range = parseRange(req.query);
        const summary = getSummary(null, range);
        res.json({
            timezone: 'Asia/Jerusalem',
            generated_at: new Date().toISOString(),
            range: { from: range.from, to: range.to },
            summary,
            comparison: getComparison(null, range, summary),
            series: getSeries(null, range),
            sites: getSiteRanking(range),
            locations: getRankedDimension(null, range, 'city'),
            pages: getRankedDimension(null, range, 'path'),
            referrers: getRankedDimension(null, range, 'referrer'),
            devices: getRankedDimension(null, range, 'device_type', 4),
            recent: getRecent(null, range)
        });
    } catch (error) {
        respondError(res, error);
    }
});

router.get('/apps/:id', (req, res) => {
    try {
        const app = assertApp(req.params.id);
        const range = parseRange(req.query);
        const summary = getSummary(app.id, range);
        res.json({
            timezone: 'Asia/Jerusalem',
            generated_at: new Date().toISOString(),
            range: { from: range.from, to: range.to },
            app,
            summary,
            comparison: getComparison(app.id, range, summary),
            series: getSeries(app.id, range),
            hourly: getHourly(app.id, range),
            locations: getRankedDimension(app.id, range, 'city'),
            regions: getRankedDimension(app.id, range, 'region'),
            pages: getRankedDimension(app.id, range, 'path'),
            referrers: getRankedDimension(app.id, range, 'referrer'),
            devices: getRankedDimension(app.id, range, 'device_type', 4),
            statuses: getRankedDimension(app.id, range, 'status', 6),
            recent: getRecent(app.id, range)
        });
    } catch (error) {
        respondError(res, error);
    }
});

router.get('/apps/:id/visitors', (req, res) => {
    try {
        const app = assertApp(req.params.id);
        const range = parseRange(req.query);
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
        const search = (req.query.search || '').trim();
        const classification = ['human', 'bot', 'all'].includes(req.query.classification) ? req.query.classification : 'human';
        const sortMap = {
            last_seen: 'last_seen', first_seen: 'first_seen', requests: 'requests', ip: 'ip'
        };
        const sort = sortMap[req.query.sort] || 'last_seen';
        const direction = req.query.direction === 'asc' ? 'ASC' : 'DESC';
        const clauses = ['app_id = ?', 'occurred_at >= ?', 'occurred_at < ?'];
        const params = [app.id, range.from, range.to];
        if (classification !== 'all') {
            clauses.push('is_bot = ?');
            params.push(classification === 'bot' ? 1 : 0);
        }
        if (search) {
            clauses.push('(ip LIKE ? OR path LIKE ? OR city LIKE ? OR region LIKE ?)');
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }
        const where = clauses.join(' AND ');
        const total = db.prepare(`SELECT COUNT(DISTINCT ip) AS count FROM visitor_events WHERE ${where}`).get(...params).count;
        const rows = db.prepare(`
            SELECT ip, MIN(occurred_at) AS first_seen, MAX(occurred_at) AS last_seen,
                COUNT(*) AS requests,
                SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) AS human_requests,
                SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_requests,
                MAX(device_type) AS device_type, MAX(city) AS city, MAX(region) AS region,
                (SELECT path FROM visitor_events p
                 WHERE p.app_id = visitor_events.app_id AND p.ip = visitor_events.ip
                 ORDER BY p.occurred_at DESC LIMIT 1) AS latest_path
            FROM visitor_events WHERE ${where}
            GROUP BY ip ORDER BY ${sort} ${direction} LIMIT ? OFFSET ?
        `).all(...params, limit, (page - 1) * limit);
        res.json({ app, range: { from: range.from, to: range.to }, page, limit, total: Number(total), visitors: rows });
    } catch (error) {
        respondError(res, error);
    }
});

router.get('/apps/:id/timeline', (req, res) => {
    try {
        const app = assertApp(req.params.id);
        const range = parseRange(req.query);
        if (!req.query.ip) return res.status(400).json({ error: 'IP is required' });
        const events = db.prepare(`
            SELECT occurred_at, method, path, status, referrer, device_type,
                   is_bot, bot_reason, city, region
            FROM visitor_events
            WHERE app_id = ? AND ip = ? AND occurred_at >= ? AND occurred_at < ?
            ORDER BY occurred_at DESC LIMIT 250
        `).all(app.id, req.query.ip, range.from, range.to);
        res.json({ app, ip: req.query.ip, range: { from: range.from, to: range.to }, events });
    } catch (error) {
        respondError(res, error);
    }
});

module.exports = router;
