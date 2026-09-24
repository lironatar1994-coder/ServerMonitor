const db = require('./database');
const { campaignTag } = require('./growthSignals');
const DAY = 86400000;
const METRICS = ['contact_click', 'form_start', 'form_submit', 'lead_received', 'won', 'tool_completed', 'file_downloaded'];
const LEAD_STATUSES = ['new', 'working', 'contacted', 'qualified', 'completed', 'won', 'lost', 'irrelevant'];
const TASK_STATUSES = ['planned', 'working', 'waiting_client', 'published', 'done', 'cancelled'];
const now = () => new Date().toISOString();
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function text(value, max = 160, required = false) {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008]/.test(value)) fail('טקסט חסר או ארוך מדי');
    const clean = value.trim();
    if (required && !clean) fail('יש למלא את השדה');
    return clean;
}
function choice(value, options) { if (!options.includes(value)) fail('ערך לא תקין'); return value; }
function date(value) {
    if (!value) return null;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('תאריך לא תקין');
    return new Date(value).toISOString();
}
function number(value, max = 100000000, integer = false) {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > max || (integer && !Number.isInteger(n))) fail('מספר לא תקין');
    return n;
}
function pagePath(value = '') {
    if (!value) return '';
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > 500 || /[?#\\\s]/.test(value)) fail('יש להזין נתיב באתר ללא פרמטרים');
    return value;
}
function appFor(id) {
    const app = db.prepare('SELECT id,name,url FROM apps WHERE id=? AND analytics_enabled=1 AND reporting_enabled=1').get(Number(id));
    if (!app) fail('האתר לא נמצא ברשימת הלקוחות', 404);
    return app;
}
function rangeFor(query = {}) {
    const days = Number(query.days || 30);
    if (![7, 30, 90].includes(days)) fail('טווח הזמן אינו נתמך');
    const to = now(), from = new Date(Date.now() - days * DAY).toISOString();
    return { from, to, days, previousFrom: new Date(Date.now() - 2 * days * DAY).toISOString() };
}
function activity(appId, actor, kind, entity, summary) {
    db.prepare('INSERT INTO growth_activity(app_id,occurred_at,actor,kind,entity_id,summary) VALUES(?,?,?,?,?,?)')
        .run(appId, now(), String(actor || 'מערכת').slice(0, 80), kind, entity, summary);
}
function metrics(appId, from, to, path = '') {
    const events = db.prepare(`SELECT event_type,COUNT(*) AS events,COUNT(DISTINCT session_hash) AS sessions
        FROM growth_events WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND automation_hint=0
        AND (?='' OR path=?) GROUP BY event_type`).all(appId, from, to, path, path);
    const out = { sessions: 0, contact_click: 0, form_start: 0, form_submit: 0, form_error: 0, form_success_observed: 0 };
    for (const row of events) out[row.event_type === 'page_view' ? 'sessions' : row.event_type] = row.sessions;
    const leads = db.prepare(`SELECT COUNT(*) AS lead_received,SUM(origin='manual') AS manual,
        SUM(origin<>'manual') AS confirmed,SUM(status='won') AS won,
        SUM(CASE WHEN status='won' THEN COALESCE(value,0) ELSE 0 END) AS revenue
        FROM growth_leads WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND archived=0`).get(appId, from, to);
    Object.assign(out, Object.fromEntries(Object.entries(leads).map(([k, v]) => [k, Number(v) || 0])));
    for (const row of db.prepare(`SELECT event_type,COUNT(*) AS total FROM product_events
        WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND automation_hint=0 AND (?='' OR path=?) GROUP BY event_type`)
        .all(appId, from, to, path, path)) out[row.event_type] = row.total;
    return out;
}
function coverage(appId) {
    const row = db.prepare(`SELECT MIN(occurred_at) AS first,MAX(occurred_at) AS latest,
        SUM(automation_hint=1) AS excluded FROM growth_events WHERE app_id=?`).get(appId);
    return { ...row, source: db.prepare('SELECT * FROM growth_sources WHERE app_id=?').get(appId) || null };
}
function insights(appId, range, current, previous) {
    const result = [];
    const add = (key, title, evidence, action, priority, path = '') => result.push({ key, title, evidence, action, priority, path });
    const profile = db.prepare('SELECT * FROM growth_profiles WHERE app_id=?').get(appId);
    const stale = db.prepare(`SELECT COUNT(*) AS count FROM growth_leads WHERE app_id=? AND archived=0
        AND (status='new' AND occurred_at<? OR status IN ('new','working','contacted','qualified') AND due_at IS NOT NULL AND due_at<?)`)
        .get(appId, new Date(Date.now() - (profile?.response_hours || 24) * 3600000).toISOString(), now()).count;
    if (stale) add('unanswered', 'פניות שממתינות לטיפול', `${stale} פניות עברו את זמן המענה או מועד המעקב`, 'לעבור על הפניות ולעדכן טיפול', 'high');
    const overdue = db.prepare(`SELECT COUNT(*) AS count FROM growth_tasks WHERE app_id=? AND status NOT IN ('done','cancelled') AND due_at<?`).get(appId, now()).count;
    if (overdue) add('overdue-tasks', 'משימות שעבר מועדן', `${overdue} משימות פתוחות`, 'לעדכן אחראי ומועד ביצוע', 'normal');
    const source = coverage(appId).source;
    if (source && (source.status !== 'ok' || Date.now() - Date.parse(source.last_success_at || 0) > 5 * 60000)) {
        add('source-stale', 'מקור הפניות דורש בדיקה', source.detail || 'לא התקבל סנכרון תקין בחמש הדקות האחרונות', 'לבדוק את חיבור מקור הפניות', 'high');
    }
    const first = coverage(appId).first;
    const enoughDays = first && Date.parse(first) <= Date.now() - 7 * DAY;
    if (enoughDays && current.sessions >= 30 && current.form_start >= 10 && current.form_submit / current.form_start < 0.5) {
        add('form-drop', 'כדאי לבדוק את תהליך מילוי הטופס', `${current.form_start} סשנים עם התחלת מילוי; ${current.form_submit} עם ניסיון שליחה`, 'לבדוק שדות, ניסוח והתנהגות במובייל; שליחה אינה אישור קליטה', 'normal');
    }
    if (current.form_error >= 3) add('form-errors', 'דווחו קשיים בטפסים', `${current.form_error} סשנים עם שגיאת אימות בדפדפן`, 'לבדוק אילו שדות מקשים על השליחה', 'high');
    if (first && Date.parse(first) <= Date.parse(range.previousFrom) && previous.contact_click >= 10 && previous.sessions >= 30 && current.sessions >= 30 && current.contact_click / current.sessions < (previous.contact_click / previous.sessions) * 0.5) {
        add('contact-drop', 'ירידה בפעולות ליצירת קשר', `${current.contact_click}/${current.sessions} סשנים בתקופה, מול ${previous.contact_click}/${previous.sessions} בתקופה הקודמת`, 'לבדוק מקורות הגעה ושינויים באתר לפני הסקת מסקנה', 'normal');
    }
    if (enoughDays) for (const row of db.prepare(`SELECT path,
        COUNT(DISTINCT CASE WHEN event_type='page_view' THEN session_hash END) AS visits,
        COUNT(DISTINCT CASE WHEN event_type='contact_click' THEN session_hash END) AS contacts
        FROM growth_events WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND automation_hint=0 GROUP BY path HAVING visits>=30 AND contacts=0 ORDER BY visits DESC LIMIT 3`).all(appId, range.from, range.to)) {
        add(`page:${row.path}`, 'עמוד עם תנועה וללא לחיצות קשר באותו עמוד', `${row.visits} סשנים ב־${row.path}; ייתכן שיצרו קשר בעמוד אחר`, 'לבחון את ההצעה ואת הנגישות ליצירת קשר', 'normal', row.path);
    }
    return result.map(item => ({ ...item, task_id: db.prepare('SELECT id FROM growth_tasks WHERE app_id=? AND evidence_key=?').get(appId, item.key)?.id || null }));
}
function overview(query) {
    const range = rangeFor(query);
    const sites = db.prepare(`SELECT a.id,a.name,a.url,p.objective,p.owner,p.response_hours FROM apps a
        JOIN growth_profiles p ON p.app_id=a.id WHERE a.analytics_enabled=1 AND a.reporting_enabled=1`).all().map(app => {
        const current = metrics(app.id, range.from, range.to);
        const previous = metrics(app.id, range.previousFrom, range.from);
        return { ...app, metrics: current, previous, coverage: coverage(app.id), insights: insights(app.id, range, current, previous),
            open_leads: db.prepare("SELECT COUNT(*) AS n FROM growth_leads WHERE app_id=? AND archived=0 AND status IN ('new','working','contacted','qualified')").get(app.id).n,
            open_tasks: db.prepare("SELECT COUNT(*) AS n FROM growth_tasks WHERE app_id=? AND status NOT IN ('done','cancelled')").get(app.id).n };
    });
    sites.sort((a, b) => b.insights.filter(i => i.priority === 'high').length - a.insights.filter(i => i.priority === 'high').length || b.insights.length - a.insights.length || a.name.localeCompare(b.name));
    return { range, sites };
}
function taskImpact(appId, task) {
    if (!task.published_at) return null;
    const elapsed = Math.floor((Date.now() - Date.parse(task.published_at)) / DAY);
    const days = Math.min(7, elapsed);
    if (days < 1) return { ready: false, reason: 'ממתינים ליום מדידה מלא לאחר הפרסום' };
    const end = Date.parse(task.published_at);
    const before = metrics(appId, new Date(end - days * DAY).toISOString(), task.published_at, task.path);
    const after = metrics(appId, task.published_at, new Date(end + days * DAY).toISOString(), task.path);
    return { ready: true, days, before: before[task.metric] || 0, after: after[task.metric] || 0,
        sessions_before: before.sessions, sessions_after: after.sessions, metric: task.metric,
        confidence: before.sessions >= 30 && after.sessions >= 30 ? 'comparison' : 'low_sample',
        caveat: 'השוואה תיאורית; תנועה, קמפיינים ושינויים נוספים עשויים להסביר את ההבדל' };
}
function detail(id, query) {
    const app = appFor(id), range = rangeFor(query);
    const current = metrics(app.id, range.from, range.to), previous = metrics(app.id, range.previousFrom, range.from);
    const leads = db.prepare('SELECT * FROM growth_leads WHERE app_id=? AND archived=0 ORDER BY occurred_at DESC LIMIT 500').all(app.id);
    const tasks = db.prepare('SELECT * FROM growth_tasks WHERE app_id=? ORDER BY created_at DESC LIMIT 500').all(app.id).map(t => ({ ...t, impact: taskImpact(app.id, t) }));
    const campaigns = db.prepare('SELECT * FROM growth_campaigns WHERE app_id=? ORDER BY created_at DESC LIMIT 200').all(app.id).map(c => {
        const measures = db.prepare(`SELECT COUNT(DISTINCT CASE WHEN event_type='page_view' THEN session_hash END) AS sessions,
            COUNT(DISTINCT CASE WHEN event_type='contact_click' THEN session_hash END) AS contacts FROM growth_events
            WHERE app_id=? AND campaign=? AND source=? AND medium=? AND occurred_at>=? AND occurred_at<? AND automation_hint=0`)
            .get(app.id, c.name, c.source, c.medium, range.from, range.to);
        const attributed = db.prepare(`SELECT COUNT(*) AS leads,SUM(CASE WHEN status='won' THEN COALESCE(value,0) ELSE 0 END) AS revenue
            FROM growth_leads WHERE app_id=? AND campaign=? AND source=? AND archived=0 AND occurred_at>=? AND occurred_at<?`).get(app.id, c.name, c.source, range.from, range.to);
        return { ...c, ...measures, attributed_leads: attributed.leads, recorded_revenue: attributed.revenue || 0,
            cost_per_lead: null, cost_note: 'התקציב הוא לכל הקמפיין; לא מחושב יחס לתקופה חלקית' };
    });
    return { app, range, profile: db.prepare('SELECT * FROM growth_profiles WHERE app_id=?').get(app.id),
        metrics: current, previous, coverage: coverage(app.id), insights: insights(app.id, range, current, previous),
        goals: db.prepare('SELECT * FROM growth_goals WHERE app_id=? ORDER BY active DESC,id').all(app.id).map(g => ({ ...g,
            current: metrics(app.id, new Date(Date.now() - g.period_days * DAY).toISOString(), range.to, g.path)[g.metric] || 0 })),
        leads, lead_total: db.prepare('SELECT COUNT(*) AS n FROM growth_leads WHERE app_id=? AND archived=0').get(app.id).n,
        tasks, campaigns,
        devices: db.prepare(`SELECT device,COUNT(DISTINCT CASE WHEN event_type='page_view' THEN session_hash END) AS sessions,
            COUNT(DISTINCT CASE WHEN event_type='contact_click' THEN session_hash END) AS contacts FROM growth_events WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND automation_hint=0 GROUP BY device`).all(app.id, range.from, range.to),
        pages: db.prepare(`SELECT path,COUNT(DISTINCT CASE WHEN event_type='page_view' THEN session_hash END) AS sessions,
            COUNT(DISTINCT CASE WHEN event_type='contact_click' THEN session_hash END) AS contacts FROM growth_events WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND automation_hint=0 GROUP BY path ORDER BY sessions DESC LIMIT 20`).all(app.id, range.from, range.to),
        sources: db.prepare(`SELECT source,medium,campaign,COUNT(DISTINCT CASE WHEN event_type='page_view' THEN session_hash END) AS sessions,
            COUNT(DISTINCT CASE WHEN event_type='contact_click' THEN session_hash END) AS contacts FROM growth_events WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND automation_hint=0 GROUP BY source,medium,campaign ORDER BY sessions DESC LIMIT 20`).all(app.id, range.from, range.to),
        actions: db.prepare(`SELECT path,label,placement,project,event_type,COUNT(*) AS events,COUNT(DISTINCT session_hash) AS sessions
            FROM growth_events WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND automation_hint=0
            AND event_type IN ('contact_click','project_open','outbound_click')
            GROUP BY path,label,placement,project,event_type ORDER BY events DESC LIMIT 40`).all(app.id, range.from, range.to),
        outcomes: db.prepare(`SELECT status,COUNT(*) AS total FROM growth_leads WHERE app_id=? AND archived=0
            AND occurred_at>=? AND occurred_at<? GROUP BY status`).all(app.id, range.from, range.to),
        activity: db.prepare('SELECT * FROM growth_activity WHERE app_id=? ORDER BY id DESC LIMIT 100').all(app.id) };
}
const TABLES = { goals: 'growth_goals', leads: 'growth_leads', tasks: 'growth_tasks', campaigns: 'growth_campaigns' };
function save(id, kind, recordId, body, actor) {
    const app = appFor(id), table = TABLES[kind];
    if (!table) fail('סוג רשומה לא תקין');
    const existing = recordId ? db.prepare(`SELECT * FROM ${table} WHERE id=? AND app_id=?`).get(Number(recordId), app.id) : null;
    if (recordId && !existing) fail('הרשומה לא נמצאה', 404);
    const b = { ...existing, ...body }, stamp = now();
    let values;
    if (kind === 'goals') {
        values = { title: text(b.title, 160, true), metric: choice(b.metric, METRICS), target: number(b.target ?? 0, 1000000, true) ?? 0,
            period_days: choice(Number(b.period_days || 30), [7,30,90]),
            path: pagePath(b.path), active: b.active === false || b.active === 0 ? 0 : 1 };
        if (['lead_received', 'won'].includes(values.metric) && values.path) fail('פניות ותוצאות נמדדות ברמת האתר; אין שיוך מאומת לעמוד');
    }
    if (kind === 'leads') {
        const status = choice(b.status || 'new', LEAD_STATUSES);
        const occurred = existing?.occurred_at || date(b.occurred_at) || stamp;
        if (occurred > stamp || Date.parse(occurred) < Date.now() - 365 * DAY) fail('תאריך הפנייה חייב להיות בשנה האחרונה ולא בעתיד');
        values = { reference: existing?.origin !== 'manual' && existing ? existing.reference : text(b.reference, 120, true),
            status, owner: text(b.owner || '', 80), due_at: date(b.due_at), value: number(b.value),
            source: campaignTag(b.source), campaign: campaignTag(b.campaign), updated_at: stamp,
            first_response_at: existing?.first_response_at || (status !== 'new' ? stamp : null),
            outcome_at: ['won', 'lost', 'irrelevant'].includes(status) ? (existing?.outcome_at || stamp) : null,
            archived: b.archived === true || b.archived === 1 ? 1 : 0 };
        if (!existing) Object.assign(values, { origin: 'manual', occurred_at: occurred, created_at: stamp });
    }
    if (kind === 'tasks') {
        const status = choice(b.status || 'planned', TASK_STATUSES);
        values = { title: text(b.title, 180, true), hypothesis: text(b.hypothesis || '', 1500), status,
            owner: text(b.owner || '', 80), due_at: date(b.due_at), priority: choice(b.priority || 'normal', ['normal', 'high']),
            path: pagePath(b.path), metric: choice(b.metric || 'contact_click', METRICS), updated_at: stamp,
            published_at: existing?.published_at || (status === 'published' ? stamp : null) };
        if (values.path && ['lead_received', 'won'].includes(values.metric)) fail('מדד פניות ותוצאות מחייב השוואה ברמת האתר');
        if (!existing && b.evidence_key) values.evidence_key = text(b.evidence_key, 600, true);
    }
    if (kind === 'campaigns') {
        const name = campaignTag(b.name), source = campaignTag(b.source), medium = campaignTag(b.medium);
        if (!name || !source || !medium) fail('שם קמפיין, מקור וערוץ חייבים להכיל אותיות, ספרות, מקף או רווח');
        const landing = pagePath(b.landing_path || new URL(app.url).pathname);
        const url = new URL(landing, app.url), base = new URL(app.url).pathname.replace(/\/$/, '');
        if (base && url.pathname !== base && !url.pathname.startsWith(base + '/')) fail('עמוד הנחיתה חייב להשתייך לאתר');
        url.searchParams.set('utm_source', source); url.searchParams.set('utm_medium', medium); url.searchParams.set('utm_campaign', name);
        values = { name, source, medium, landing_path: landing, url: url.toString(), cost: number(b.cost) };
    }
    return db.transaction(() => {
        let entity = existing?.id;
        if (existing) db.prepare(`UPDATE ${table} SET ${Object.keys(values).map(k => `${k}=?`).join(',')} WHERE id=? AND app_id=?`).run(...Object.values(values), entity, app.id);
        else {
            values = { app_id: app.id, created_at: stamp, ...values };
            entity = Number(db.prepare(`INSERT INTO ${table}(${Object.keys(values).join(',')}) VALUES(${Object.keys(values).map(() => '?').join(',')})`).run(...Object.values(values)).lastInsertRowid);
        }
        const labels = { goals: 'מטרה', tasks: 'משימה', leads: 'פנייה', campaigns: 'קמפיין' };
        const statuses = { new: 'חדש', working: 'בטיפול', contacted: 'נוצר קשר', qualified: 'פנייה מתאימה', completed: 'טופל במקור', won: 'נסגר בהצלחה', lost: 'לא נסגר', irrelevant: 'לא רלוונטי', planned: 'מתוכנן', waiting_client: 'ממתין ללקוח', published: 'פורסם', done: 'הושלם', cancelled: 'בוטל' };
        const change = existing && values.status && existing.status !== values.status ? ` (${statuses[existing.status]} ← ${statuses[values.status]})` : '';
        activity(app.id, actor, kind, entity, `${existing ? 'עודכנה' : 'נוספה'} ${labels[kind]}: ${values.title || values.name || values.reference}${change}`);
        return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(entity);
    })();
}
function saveProfile(id, body, actor) {
    const app = appFor(id);
    const hours = number(body.response_hours, 720, true);
    if (!hours) fail('זמן המענה חייב להיות לפחות שעה');
    db.prepare('UPDATE growth_profiles SET objective=?,owner=?,response_hours=? WHERE app_id=?')
        .run(text(body.objective, 300, true), text(body.owner || '', 80), hours, app.id);
    activity(app.id, actor, 'profile', null, 'עודכנו מטרת האתר ואחריות הטיפול');
    return { saved: true };
}
function report(id, query) {
    const data = detail(id, query), m = data.metrics;
    const completed = data.tasks.filter(t => ['done', 'published'].includes(t.status) && (t.published_at || t.updated_at) >= data.range.from);
    const fmt = v => new Date(v).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const lines = [`סיכום פעילות — ${data.app.name}`, `${fmt(data.range.from)}–${fmt(data.range.to)}`, '',
        `מטרת האתר: ${data.profile.objective}`, `סשנים שנמדדו באתר: ${m.sessions}`, `סשנים עם לחיצה ליצירת קשר: ${m.contact_click}`,
        `פניות שנקלטו במערכת המקור: ${m.confirmed}`, `פניות שדווחו ידנית: ${m.manual}`, `פניות מהתקופה שסומנו כהצלחה: ${m.won}`, '',
        'עבודה שבוצעה:', ...(completed.length ? completed.map(t => `• ${t.title}`) : ['טרם תועדה עבודה שהושלמה בתקופה זו.']), '',
        'המשך מוצע:', ...data.insights.filter(i => !['unanswered','source-stale'].includes(i.key)).slice(0, 3).map(i => `• ${i.action}`), '',
        'המדידה חלקית ומסננת אוטומציה מזוהה. לחיצה אינה פנייה או עסקה. פניות ממקור שאינו מחובר אינן כלולות.'];
    return { subject: `סיכום פעילות — ${data.app.name}`, body: lines.join('\n') };
}
module.exports = { overview, detail, save, saveProfile, report, appFor, activity, metrics, rangeFor, METRICS };
