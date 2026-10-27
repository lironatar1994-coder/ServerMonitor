// Push insights: new and waiting inquiries, a morning summary, unusual traffic or contact
// clicks, new campaigns, newly popular or missing pages, and slower pages. Every insight has a
// stable key so it is sent once. Numbers are browser estimates and are worded as such.
const DAY = 86400000;
const HOUR = 3600000;
const BASE = '/serve-monitor';
const ORIGINS = { contact: 'טופס יצירת קשר', registrations: 'הרשמה', quotes: 'בקשת הצעת מחיר', dfus_orders: 'הזמנה', dfus_contacts: 'פנייה', leads: 'פנייה' };

const n = (value) => new Intl.NumberFormat('he-IL').format(Math.round(Number(value) || 0));
const israelDate = (time) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(time));
const israelHour = (time) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date(time))) % 24;
const iso = (time) => new Date(time).toISOString();

function metadata(db) {
    return {
        get: (key) => db.prepare('SELECT value FROM monitor_metadata WHERE key = ?').get(key)?.value,
        set: (key, value) => db.prepare(`INSERT INTO monitor_metadata (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).run(key, String(value))
    };
}

const sites = (db) => db.prepare("SELECT id, name FROM apps WHERE analytics_enabled = 1 AND reporting_enabled = 1 AND url IS NOT NULL AND trim(url) <> ''").all();
const sessions = (db, appId, from, to) => db.prepare(`SELECT COUNT(DISTINCT visit_hash) AS n FROM browser_signals
    WHERE app_id = ? AND automation_hint = 0 AND occurred_at >= ? AND occurred_at < ?`).get(appId, from, to).n;
const contacts = (db, appId, from, to) => db.prepare(`SELECT COUNT(*) AS n FROM growth_events
    WHERE app_id = ? AND automation_hint = 0 AND event_type = 'contact_click' AND occurred_at >= ? AND occurred_at < ?`).get(appId, from, to).n;

function leadInsights(db, now, meta) {
    const since = meta.get('insights:leads-since');
    meta.set('insights:leads-since', iso(now));
    if (!since) return [];
    const rows = db.prepare(`SELECT l.id, l.app_id, l.origin, a.name FROM growth_leads l JOIN apps a ON a.id = l.app_id
        WHERE l.archived = 0 AND l.created_at > ? AND l.status = 'new' ORDER BY l.id`).all(since);
    const byApp = new Map();
    rows.forEach((row) => byApp.set(row.app_id, [...(byApp.get(row.app_id) || []), row]));
    return [...byApp.values()].map((items) => ({
        key: `leads:${items[0].app_id}:${items.at(-1).id}`, category: 'leads', app_id: items[0].app_id,
        title: items.length === 1 ? `פנייה חדשה · ${items[0].name}` : `${n(items.length)} פניות חדשות · ${items[0].name}`,
        body: [...new Set(items.map((item) => ORIGINS[item.origin] || 'מקור מחובר'))].join(' · '),
        url: `${BASE}/clients/${items[0].app_id}`
    }));
}

function waitingLeads(db, now) {
    const rows = db.prepare(`SELECT l.app_id, a.name, COUNT(*) AS waiting FROM growth_leads l JOIN apps a ON a.id = l.app_id
        WHERE l.archived = 0 AND l.status = 'new' AND l.first_response_at IS NULL AND l.occurred_at < ? AND l.occurred_at >= ?
        GROUP BY l.app_id`).all(iso(now - DAY), iso(now - 7 * DAY));
    return rows.map((row) => ({
        key: `waiting:${row.app_id}:${israelDate(now)}`, category: 'leads', app_id: row.app_id,
        title: `${row.waiting === 1 ? 'פנייה ממתינה' : `${n(row.waiting)} פניות ממתינות`} מעל יום · ${row.name}`,
        body: 'עדיין לא סומנו כמטופלות.', url: `${BASE}/clients/${row.app_id}`
    }));
}

function trafficInsights(db, now) {
    const day = israelDate(now);
    const items = [];
    for (const site of sites(db)) {
        const current = sessions(db, site.id, iso(now - DAY), iso(now));
        const baseline = sessions(db, site.id, iso(now - 8 * DAY), iso(now - DAY)) / 7;
        if (baseline >= 5 && current >= 30 && current >= 2 * baseline) {
            items.push({ key: `traffic:${site.id}:up:${day}`, category: 'traffic', app_id: site.id, title: `יותר ביקורים מהרגיל · ${site.name}`,
                body: `${n(current)} ביקורים משוערים ב־24 שעות, לעומת ממוצע של ${n(baseline)} ביום.`, url: `${BASE}/visitors/${site.id}` });
        } else if (baseline >= 30 && current <= 0.4 * baseline) {
            items.push({ key: `traffic:${site.id}:down:${day}`, category: 'traffic', app_id: site.id, title: `פחות ביקורים מהרגיל · ${site.name}`,
                body: `${n(current)} ביקורים משוערים ב־24 שעות, לעומת ממוצע של ${n(baseline)} ביום.`, url: `${BASE}/visitors/${site.id}` });
        }
        const clicks = contacts(db, site.id, iso(now - DAY), iso(now));
        const usual = contacts(db, site.id, iso(now - 8 * DAY), iso(now - DAY)) / 7;
        if (clicks >= 5 && clicks >= 2 * Math.max(1, usual)) {
            items.push({ key: `contacts:${site.id}:${day}`, category: 'contacts', app_id: site.id, title: `הרבה לחיצות קשר · ${site.name}`,
                body: `${n(clicks)} לחיצות על טלפון, וואטסאפ או טופס ב־24 שעות (בדרך כלל ${n(usual)}). לחיצה אינה פנייה שנשלחה.`, url: `${BASE}/visitors/${site.id}` });
        }
    }
    return items;
}

function campaignInsights(db, now) {
    return db.prepare(`SELECT g.app_id, a.name, g.campaign, MIN(g.occurred_at) AS first_seen, COUNT(DISTINCT g.session_hash) AS visits
        FROM growth_events g JOIN apps a ON a.id = g.app_id WHERE g.campaign <> '' AND g.automation_hint = 0
        GROUP BY g.app_id, g.campaign HAVING first_seen >= ?`).all(iso(now - 2 * HOUR)).map((row) => ({
        key: `campaign:${row.app_id}:${row.campaign}`, category: 'campaigns', app_id: row.app_id, title: `קמפיין חדש מביא תנועה · ${row.name}`,
        body: `"${row.campaign}": ${n(row.visits)} ביקורים ראשונים.`, url: `${BASE}/clients/${row.app_id}`
    }));
}

function pageInsights(db, now) {
    const { notFoundPages } = require('./observability');
    const items = [];
    const day = israelDate(now);
    const popular = db.prepare(`SELECT b.app_id, a.name, b.path, COUNT(*) AS views FROM browser_signals b JOIN apps a ON a.id = b.app_id
        WHERE b.automation_hint = 0 AND b.occurred_at >= ? AND a.reporting_enabled = 1 GROUP BY b.app_id, b.path HAVING views >= 20`).all(iso(now - DAY));
    const before = db.prepare('SELECT 1 FROM browser_signals WHERE app_id = ? AND path = ? AND automation_hint = 0 AND occurred_at >= ? AND occurred_at < ? LIMIT 1');
    for (const row of popular) {
        if (before.get(row.app_id, row.path, iso(now - 8 * DAY), iso(now - DAY))) continue;
        items.push({ key: `page:${row.app_id}:${row.path}`, category: 'pages', app_id: row.app_id, title: `עמוד חדש מקבל תנועה · ${row.name}`,
            body: `${row.path}: ${n(row.views)} צפיות ב־24 שעות.`, url: `${BASE}/visitors/${row.app_id}?view=pages` });
    }
    for (const site of sites(db)) {
        for (const page of notFoundPages(db, site.id, iso(now - DAY), iso(now), 3).filter((item) => item.visitors >= 10)) {
            items.push({ key: `404:${site.id}:${page.path}:${day}`, category: 'pages', app_id: site.id, title: `עמוד שלא נמצא · ${site.name}`,
                body: `${n(page.visitors)} גולשים קיבלו "לא נמצא" ב־${page.path}.`, url: `${BASE}/visitors/${site.id}?view=pages` });
        }
    }
    return items;
}

function speedInsights(db, now) {
    const { vitalsSummary } = require('./observability');
    const items = [];
    for (const site of sites(db)) {
        const recent = vitalsSummary(db, site.id, iso(now - DAY), iso(now)).overall;
        if (recent.samples < 20 || recent.lcp_ms == null || recent.lcp_ms <= 4000) continue;
        const before = vitalsSummary(db, site.id, iso(now - 8 * DAY), iso(now - DAY)).overall;
        if (before.samples < 20 || before.lcp_ms == null || before.lcp_ms > 4000) continue;
        items.push({ key: `speed:${site.id}:${israelDate(now)}`, category: 'speed', app_id: site.id, title: `האתר נטען לאט יותר · ${site.name}`,
            body: `טעינת התוכן הראשי: ${(recent.lcp_ms / 1000).toFixed(1)} שניות (קודם ${(before.lcp_ms / 1000).toFixed(1)}).`, url: `${BASE}/visitors/${site.id}` });
    }
    return items;
}

/** The morning summary of yesterday (Israel time), once per day from 08:00. */
function digest(db, now) {
    if (israelHour(now) < 8) return [];
    const today = israelDate(now);
    const midnight = (date) => {
        const probe = new Date(`${date}T12:00:00Z`);
        const offset = Date.parse(probe.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })) - Date.parse(probe.toLocaleString('en-US', { timeZone: 'UTC' }));
        return Date.parse(`${date}T00:00:00Z`) - offset;
    };
    const end = midnight(today);
    const start = midnight(israelDate(end - HOUR));
    const previous = midnight(israelDate(start - HOUR));
    let visits = 0, before = 0, clicks = 0;
    for (const site of sites(db)) {
        visits += sessions(db, site.id, iso(start), iso(end));
        before += sessions(db, site.id, iso(previous), iso(start));
        clicks += contacts(db, site.id, iso(start), iso(end));
    }
    const open = db.prepare("SELECT COUNT(*) AS n FROM growth_leads WHERE archived = 0 AND status IN ('new','working','contacted','qualified')").get().n;
    const down = db.prepare("SELECT COUNT(*) AS n FROM apps WHERE status <> 'online' AND alerts_enabled <> 0").get().n;
    const delta = visits - before;
    return [{
        key: `digest:${today}`, category: 'digest', app_id: null, title: 'סיכום אתמול',
        body: [`${n(visits)} ביקורים (${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${n(Math.abs(delta))})`, `${n(clicks)} לחיצות קשר`,
            `${n(open)} פניות פתוחות`, down ? `${n(down)} שירותים לא זמינים` : 'הכול זמין'].join(' · '),
        url: `${BASE}/visitors`
    }];
}

function detectInsights(db, now = Date.now()) {
    const meta = metadata(db);
    return [...leadInsights(db, now, meta), ...waitingLeads(db, now), ...trafficInsights(db, now), ...campaignInsights(db, now),
        ...pageInsights(db, now), ...speedInsights(db, now), ...digest(db, now)];
}

/** Stores new insights and pushes each one; returns the insights that were new. */
async function runInsights(db, now = Date.now(), push = require('./push')) {
    const insert = db.prepare(`INSERT OR IGNORE INTO insight_notifications (key, category, app_id, title, body, url, created_at)
        VALUES (@key, @category, @app_id, @title, @body, @url, @created_at)`);
    const fresh = detectInsights(db, now).filter((item) => insert.run({ ...item, created_at: iso(now) }).changes > 0);
    for (const item of fresh) {
        const message = item.category !== 'digest' ? { title: item.title, body: item.body, url: item.url } : (row) => {
            // Insights held back by quiet hours or the daily cap are counted in the summary.
            const missed = db.prepare(`SELECT COUNT(*) AS n FROM insight_notifications i WHERE i.category NOT IN ('outage', 'digest')
                AND i.created_at >= ? AND NOT EXISTS (SELECT 1 FROM push_deliveries d WHERE d.subscription_id = ? AND d.notification_key = i.key)`)
                .get(iso(now - DAY), row.id).n;
            return { title: item.title, body: missed ? `${item.body} · עוד ${n(missed)} עדכונים במוניטור` : item.body, url: item.url };
        };
        await push.sendPush(message, { category: item.category, key: item.key });
    }
    return fresh;
}

module.exports = { detectInsights, runInsights, israelDate };
