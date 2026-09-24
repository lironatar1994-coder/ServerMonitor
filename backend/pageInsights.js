const db = require('./database');

function getPageInsights(app, range, path) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.length > 500 || /[?#\\\s]/.test(path)) {
        throw Object.assign(new Error('Invalid page path'), { status: 400 });
    }
    const args = [app.id, range.from, range.to, path];
    const log = db.prepare(`SELECT COUNT(*) AS views,COUNT(DISTINCT ip) AS connections
        FROM visitor_events WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND path=? AND is_bot=0 AND is_page_view=1`).get(...args);
    // A cohort is one recorded session on this page, never an IP or a claimed person.
    const cohort = `WITH cohort AS (SELECT session_hash,MIN(occurred_at) AS started
        FROM growth_events WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND path=?
        AND event_type='page_view' AND automation_hint=0 GROUP BY session_hash)`;
    const visits = db.prepare(`${cohort} SELECT COUNT(*) AS n FROM cohort`).get(...args).n;
    const actions = db.prepare(`${cohort}
        SELECT e.event_type,e.label,e.placement,e.path,COUNT(*) AS actions,COUNT(DISTINCT e.session_hash) AS visits
        FROM growth_events e JOIN cohort c ON c.session_hash=e.session_hash AND e.occurred_at>=c.started
        WHERE e.app_id=? AND e.occurred_at<? AND e.automation_hint=0 AND e.event_type IN ('contact_click','outbound_click')
        GROUP BY e.event_type,e.label,e.placement,e.path ORDER BY visits DESC LIMIT 20`).all(...args, app.id, range.to);
    const contacts = db.prepare(`${cohort} SELECT COUNT(DISTINCT e.session_hash) AS n
        FROM growth_events e JOIN cohort c ON c.session_hash=e.session_hash AND e.occurred_at>=c.started
        WHERE e.app_id=? AND e.occurred_at<? AND e.automation_hint=0 AND e.event_type='contact_click'`).get(...args, app.id, range.to).n;
    const next = db.prepare(`WITH steps AS (
        SELECT path,session_hash,LEAD(path) OVER (PARTITION BY session_hash ORDER BY occurred_at,id) AS next_path
        FROM growth_events WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND automation_hint=0 AND event_type='page_view')
        SELECT next_path AS path,COUNT(*) AS transitions,COUNT(DISTINCT session_hash) AS visits FROM steps
        WHERE path=? AND next_path IS NOT NULL AND next_path<>path GROUP BY next_path ORDER BY visits DESC LIMIT 10`).all(...args);
    const engagement = app.name === 'LA webs' ? db.prepare(`SELECT COUNT(*) AS visits,AVG(dwell) AS active_ms,AVG(depth) AS scroll
        FROM (SELECT session_hash,SUM(dwell_ms) AS dwell,MAX(scroll_depth) AS depth FROM engagement_signals
        WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND path=? AND automation_hint=0 GROUP BY session_hash)`).get(...args) : null;
    return { path, log, visits, contact_visits: contacts, actions, next, engagement,
        coverage_since: db.prepare('SELECT MIN(occurred_at) AS first FROM growth_events WHERE app_id=?').get(app.id).first,
        low_sample: visits < 30 };
}
module.exports = { getPageInsights };
