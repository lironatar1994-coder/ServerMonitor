const express = require('express');
const crypto = require('crypto');
const db = require('../database');
const { authenticateToken } = require('./auth');
const { getLibiJewelryInterest } = require('../jewelryAnalytics');
const { findAppForSiteUrl } = require('../siteIdentity');

const router = express.Router();
const managerSiteRouter = express.Router();
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

managerSiteRouter.use(authenticateManagerSite);
managerSiteRouter.get('/site', handleManagerSiteAnalytics);
managerSiteRouter.get('/site/visitors', handleManagerSiteVisitors);
managerSiteRouter.get('/site/timeline', handleManagerSiteTimeline);
router.use('/manager-site', managerSiteRouter);
router.use(authenticateToken);

function authenticateManagerSite(req, res, next) {
    const expected = process.env.MANAGER_SITE_ANALYTICS_KEY || '';
    const provided = req.get('x-manager-site-analytics-key') || '';
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    if (!expected || expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
        return res.status(401).json({ error: 'Unauthorized analytics integration' });
    }
    next();
}

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
            SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) AS candidate_requests,
            SUM(CASE WHEN is_bot = 0 AND is_page_view = 1 THEN 1 ELSE 0 END) AS page_views,
            SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_requests,
            COUNT(DISTINCT CASE WHEN is_bot = 0 AND is_page_view = 1 THEN ip END) AS unique_candidates,
            COUNT(DISTINCT CASE WHEN is_bot = 1 THEN ip END) AS unique_bots
        FROM visitor_events
        WHERE occurred_at >= ? AND occurred_at < ? ${appClause}
    `).get(...params);
    const activeParams = [new Date(Date.now() - 5 * 60 * 1000).toISOString()];
    if (appId) activeParams.push(appId);
    const active = db.prepare(`
        SELECT COUNT(DISTINCT ip) AS active_candidates
        FROM visitor_events
        WHERE is_bot = 0 AND is_page_view = 1 AND occurred_at >= ?
        ${appId ? 'AND app_id = ?' : ''}
    `).get(...activeParams);
    const mix = db.prepare(`
        SELECT
            SUM(CASE WHEN first_seen >= @from THEN 1 ELSE 0 END) AS new_candidates,
            SUM(CASE WHEN first_seen < @from THEN 1 ELSE 0 END) AS returning_candidates
        FROM (
            SELECT e.ip, (
                SELECT MIN(previous.occurred_at) FROM visitor_events previous
                WHERE previous.ip = e.ip AND previous.is_bot = 0 AND previous.is_page_view = 1
                ${appId ? 'AND previous.app_id = @appId' : ''}
            ) AS first_seen
            FROM visitor_events e
            WHERE e.is_bot = 0 AND e.is_page_view = 1 AND e.occurred_at >= @from AND e.occurred_at < @to
            ${appId ? 'AND e.app_id = @appId' : ''}
            GROUP BY e.ip
        )
    `).get({ from: range.from, to: range.to, appId: appId || null });
    return {
        total_requests: Number(summary.total_requests) || 0,
        candidate_requests: Number(summary.candidate_requests) || 0,
        page_views: Number(summary.page_views) || 0,
        bot_requests: Number(summary.bot_requests) || 0,
        unique_candidates: Number(summary.unique_candidates) || 0,
        unique_bots: Number(summary.unique_bots) || 0,
        active_candidates: Number(active.active_candidates) || 0,
        new_candidates: Number(mix.new_candidates) || 0,
        returning_candidates: Number(mix.returning_candidates) || 0
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
        unique_candidates_percent: delta(summary.unique_candidates, previousSummary.unique_candidates),
        page_views_percent: delta(summary.page_views, previousSummary.page_views),
        candidate_requests_percent: delta(summary.candidate_requests, previousSummary.candidate_requests),
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
            COUNT(DISTINCT CASE WHEN is_bot = 0 AND is_page_view = 1 THEN ip END) AS unique_candidates,
            SUM(CASE WHEN is_bot = 0 AND is_page_view = 1 THEN 1 ELSE 0 END) AS page_views,
            SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) AS candidate_requests,
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
        WHERE occurred_at >= ? AND occurred_at < ? AND is_bot = 0 AND is_page_view = 1
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
        WHERE e.occurred_at >= ? AND e.occurred_at < ? AND e.is_bot = 0 AND e.is_page_view = 1
          ${appId ? 'AND e.app_id = ?' : ''}
        ORDER BY e.occurred_at DESC LIMIT ?
    `).all(...params);
}

function getSiteRanking(range) {
    return db.prepare(`
        SELECT a.id AS app_id, a.name, a.url,
            COUNT(DISTINCT CASE WHEN e.is_bot = 0 AND e.is_page_view = 1 THEN e.ip END) AS unique_candidates,
            SUM(CASE WHEN e.is_bot = 0 AND e.is_page_view = 1 THEN 1 ELSE 0 END) AS page_views,
            SUM(CASE WHEN e.is_bot = 0 THEN 1 ELSE 0 END) AS candidate_requests,
            SUM(CASE WHEN e.is_bot = 1 THEN 1 ELSE 0 END) AS bot_requests
        FROM apps a
        LEFT JOIN visitor_events e ON e.app_id = a.id
            AND e.occurred_at >= ? AND e.occurred_at < ?
        WHERE a.analytics_enabled = 1 AND a.log_path IS NOT NULL
        GROUP BY a.id ORDER BY unique_candidates DESC, candidate_requests DESC, a.name ASC
    `).all(range.from, range.to);
}

function getHourly(appId, range) {
    return db.prepare(`
        SELECT CAST(strftime('%H', occurred_at, '+3 hours') AS INTEGER) AS hour,
            COUNT(*) AS page_views, COUNT(DISTINCT ip) AS unique_visitors
        FROM visitor_events
        WHERE app_id = ? AND occurred_at >= ? AND occurred_at < ? AND is_bot = 0 AND is_page_view = 1
        GROUP BY hour ORDER BY hour ASC
    `).all(appId, range.from, range.to);
}

function assertApp(appId) {
    const app = db.prepare('SELECT id, name, url, status, analytics_enabled FROM apps WHERE id = ?').get(appId);
    if (!app) {
        const error = new Error('App not found');
        error.status = 404;
        throw error;
    }
    if (!app.analytics_enabled) {
        const error = new Error('Visitor analytics is not enabled for this app');
        error.status = 400;
        throw error;
    }
    return app;
}

function getManagerSiteApp(siteUrl) {
    if (!siteUrl) {
        const error = new Error('Website URL is required');
        error.status = 400;
        error.code = 'website_url_required';
        throw error;
    }
    const apps = db.prepare(`
        SELECT id, name, url, status
        FROM apps
        WHERE url IS NOT NULL AND TRIM(url) <> ''
          AND log_path IS NOT NULL AND TRIM(log_path) <> ''
    `).all();
    const app = findAppForSiteUrl(apps, siteUrl);
    if (!app) {
        const error = new Error('No monitored app matches this website');
        error.status = 404;
        error.code = 'analytics_not_configured';
        throw error;
    }
    return app;
}

function buildAppAnalytics(app, range) {
    const summary = getSummary(app.id, range);
    return {
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
        recent: getRecent(app.id, range),
        jewelry_interest: app.name === 'Libi Diamonds'
            ? getLibiJewelryInterest(db, app.id, range)
            : null
    };
}

function getVisitorPage(app, range, query) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(query.limit) || 25));
    const search = String(query.search || '').trim().slice(0, 160);
    const classification = ['candidate', 'bot', 'all'].includes(query.classification)
        ? query.classification
        : 'candidate';
    const sortMap = {
        last_seen: 'last_seen', first_seen: 'first_seen', requests: 'requests', ip: 'ip'
    };
    const sort = sortMap[query.sort] || 'last_seen';
    const direction = query.direction === 'asc' ? 'ASC' : 'DESC';
    const clauses = ['app_id = ?', 'occurred_at >= ?', 'occurred_at < ?'];
    const params = [app.id, range.from, range.to];
    if (classification !== 'all') {
        clauses.push('is_bot = ?');
        params.push(classification === 'bot' ? 1 : 0);
        if (classification === 'candidate') clauses.push('is_page_view = 1');
    }
    if (search) {
        clauses.push('(ip LIKE ? OR path LIKE ? OR city LIKE ? OR region LIKE ?)');
        const term = `%${search}%`;
        params.push(term, term, term, term);
    }
    const where = clauses.join(' AND ');
    const latestPathFilter = classification === 'candidate'
        ? 'AND p.is_page_view = 1 AND p.is_bot = 0'
        : classification === 'bot'
            ? 'AND p.is_bot = 1'
            : '';
    const total = db.prepare(`SELECT COUNT(DISTINCT ip) AS count FROM visitor_events WHERE ${where}`).get(...params).count;
    const rows = db.prepare(`
        SELECT ip, MIN(occurred_at) AS first_seen, MAX(occurred_at) AS last_seen,
            COUNT(*) AS requests,
            SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) AS candidate_requests,
            SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_requests,
            MAX(CASE WHEN is_bot = 1 THEN bot_reason END) AS bot_reason,
            MAX(device_type) AS device_type, MAX(city) AS city, MAX(region) AS region,
            (SELECT path FROM visitor_events p
             WHERE p.app_id = visitor_events.app_id AND p.ip = visitor_events.ip
             AND p.occurred_at >= ? AND p.occurred_at < ?
             ${latestPathFilter}
             ORDER BY p.occurred_at DESC LIMIT 1) AS latest_path
        FROM visitor_events WHERE ${where}
        GROUP BY ip ORDER BY ${sort} ${direction} LIMIT ? OFFSET ?
    `).all(range.from, range.to, ...params, limit, (page - 1) * limit);
    return {
        app,
        range: { from: range.from, to: range.to },
        classification,
        page,
        limit,
        total: Number(total) || 0,
        visitors: rows
    };
}

function getVisitorTimeline(app, range, query) {
    const ip = String(query.ip || '').trim().slice(0, 160);
    if (!ip) {
        const error = new Error('IP is required');
        error.status = 400;
        throw error;
    }
    const events = db.prepare(`
        SELECT occurred_at, method, path, status, referrer, device_type,
               is_bot, bot_reason, city, region
        FROM visitor_events
        WHERE app_id = ? AND ip = ? AND occurred_at >= ? AND occurred_at < ?
        ORDER BY occurred_at DESC LIMIT 250
    `).all(app.id, ip, range.from, range.to);
    return { app, ip, range: { from: range.from, to: range.to }, events };
}

function handleManagerSiteAnalytics(req, res) {
    try {
        const app = getManagerSiteApp(req.query.site_url);
        res.json(buildAppAnalytics(app, parseRange(req.query)));
    } catch (error) {
        respondError(res, error);
    }
}

function handleManagerSiteVisitors(req, res) {
    try {
        const app = getManagerSiteApp(req.query.site_url);
        const range = parseRange(req.query);
        res.json(getVisitorPage(app, range, req.query));
    } catch (error) {
        respondError(res, error);
    }
}

function handleManagerSiteTimeline(req, res) {
    try {
        const app = getManagerSiteApp(req.query.site_url);
        const range = parseRange(req.query);
        res.json(getVisitorTimeline(app, range, req.query));
    } catch (error) {
        respondError(res, error);
    }
}

function respondError(res, error) {
    const payload = { error: error.message };
    if (error.code) payload.code = error.code;
    res.status(error.status || 500).json(payload);
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
        res.json(buildAppAnalytics(app, range));
    } catch (error) {
        respondError(res, error);
    }
});

router.get('/apps/:id/visitors', (req, res) => {
    try {
        const app = assertApp(req.params.id);
        const range = parseRange(req.query);
        res.json(getVisitorPage(app, range, req.query));
    } catch (error) {
        respondError(res, error);
    }
});

router.get('/apps/:id/timeline', (req, res) => {
    try {
        const app = assertApp(req.params.id);
        const range = parseRange(req.query);
        res.json(getVisitorTimeline(app, range, req.query));
    } catch (error) {
        respondError(res, error);
    }
});

module.exports = router;
