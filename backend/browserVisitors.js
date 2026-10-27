const db = require('./database');
const { getAgentType } = require('./logParser');

const number = value => Math.min(100000, Math.max(1, Math.floor(Number(value) || 1)));
const retention = () => new Date(Date.now() - 90 * 86400000).toISOString();

function browserVisitors(app, range, query) {
    const page = number(query.page);
    const search = String(query.search || '').trim().slice(0, 160);
    const params = [app.id, range.from, range.to];
    const filter = search ? 'AND (visitor_hash LIKE ? OR path LIKE ?)' : '';
    if (search) params.push(`%${search}%`, `%${search}%`);
    // Search selects browsers; their counts still include every measured page in the period.
    const cohort = `SELECT DISTINCT visitor_hash FROM browser_signals WHERE app_id=?
        AND occurred_at>=? AND occurred_at<? AND automation_hint=0 ${filter}`;
    const total = db.prepare(`SELECT COUNT(*) AS n FROM (${cohort})`).get(...params).n;
    const visitors = db.prepare(`SELECT b.visitor_hash AS visitor_id,
        MIN(b.occurred_at) AS first_seen, MAX(b.occurred_at) AS last_seen,
        COUNT(*) AS page_views, COUNT(DISTINCT b.visit_hash) AS visits,
        (SELECT MIN(h.occurred_at) FROM browser_signals h WHERE h.app_id=b.app_id
            AND h.visitor_hash=b.visitor_hash AND h.automation_hint=0 AND h.occurred_at<?) AS history_first_seen,
        (SELECT COUNT(DISTINCT h.visit_hash) FROM browser_signals h WHERE h.app_id=b.app_id
            AND h.visitor_hash=b.visitor_hash AND h.automation_hint=0 AND h.occurred_at<?) AS history_visits,
        (SELECT path FROM browser_signals h WHERE h.app_id=b.app_id AND h.visitor_hash=b.visitor_hash
            AND h.automation_hint=0 AND h.occurred_at>=? AND h.occurred_at<? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 1) AS latest_path,
        (SELECT user_agent FROM browser_signals h WHERE h.app_id=b.app_id AND h.visitor_hash=b.visitor_hash
            AND h.automation_hint=0 AND h.occurred_at<? ORDER BY h.occurred_at DESC,h.id DESC LIMIT 1) AS user_agent
        FROM browser_signals b WHERE b.app_id=? AND b.occurred_at>=? AND b.occurred_at<?
            AND b.automation_hint=0 AND b.visitor_hash IN (${cohort})
        GROUP BY b.visitor_hash ORDER BY last_seen DESC LIMIT 25 OFFSET ?`)
        .all(range.to, range.to, range.from, range.to, range.to, app.id, range.from, range.to, ...params, (page - 1) * 25)
        .map(({ user_agent, ...row }) => ({ ...row, device: getAgentType({ userAgent: user_agent || '' }),
            returning: row.history_visits > 1, seen_before_period: row.history_first_seen < range.from }));
    return { visitors, total, page, limit: 25, range, retention_days: 90 };
}

function browserHistory(app, range, query) {
    const visitor = String(query.visitor || '');
    if (!/^[a-f0-9]{64}$/.test(visitor)) throw Object.assign(new Error('Invalid browser identifier'), { status: 400 });
    const page = number(query.page);
    const from = retention();
    const summary = db.prepare(`SELECT MIN(occurred_at) AS first_seen,MAX(occurred_at) AS last_seen,
        COUNT(*) AS page_views,COUNT(DISTINCT visit_hash) AS visits,
        COUNT(DISTINCT CASE WHEN occurred_at>=? THEN visit_hash END) AS period_visits
        FROM browser_signals WHERE app_id=? AND visitor_hash=? AND automation_hint=0 AND occurred_at>=? AND occurred_at<?`)
        .get(range.from, app.id, visitor, from, range.to);
    const visits = db.prepare(`SELECT visit_hash,session_hash,MIN(occurred_at) AS first_seen,
        MAX(occurred_at) AS last_seen,COUNT(*) AS page_views FROM browser_signals
        WHERE app_id=? AND visitor_hash=? AND automation_hint=0 AND occurred_at>=? AND occurred_at<?
        GROUP BY visit_hash,session_hash ORDER BY first_seen DESC LIMIT 10 OFFSET ?`)
        .all(app.id, visitor, from, range.to, (page - 1) * 10);
    for (const visit of visits) {
        visit.pages = db.prepare(`SELECT occurred_at,path FROM browser_signals WHERE app_id=? AND visitor_hash=?
            AND visit_hash=? AND automation_hint=0 AND occurred_at>=? AND occurred_at<?
            ORDER BY occurred_at,id LIMIT 80`).all(app.id, visitor, visit.visit_hash, from, range.to);
        const until = new Date(Math.min(Date.parse(range.to), Date.parse(visit.last_seen) + 30 * 60000)).toISOString();
        visit.actions = db.prepare(`SELECT occurred_at,event_type,label,path FROM growth_events WHERE app_id=?
            AND browser_session_hash=? AND automation_hint=0 AND event_type!='page_view'
            AND occurred_at>=? AND occurred_at<? ORDER BY occurred_at,id LIMIT 80`)
            .all(app.id, visit.session_hash, visit.first_seen, until);
        const product = db.prepare(`SELECT occurred_at,event_type,label,path FROM product_events WHERE app_id=?
            AND session_hash=? AND automation_hint=0 AND occurred_at>=? AND occurred_at<? ORDER BY occurred_at,id LIMIT 80`)
            .all(app.id, visit.session_hash, visit.first_seen, until);
        visit.actions = [...visit.actions, ...product].sort((a,b) => a.occurred_at.localeCompare(b.occurred_at)).slice(0,80);
        visit.in_period = visit.last_seen >= range.from;
        delete visit.session_hash;
        delete visit.visit_hash;
    }
    return { visitor_id: visitor, summary, visits, page, limit: 10, has_more: page * 10 < summary.visits,
        retention_days: 90, history_from: from, history_to: range.to,
        identity: 'anonymous_browser', action_attribution: 'shared_session_only' };
}

module.exports = { browserVisitors, browserHistory };
