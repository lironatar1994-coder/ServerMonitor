/* Read-only adapters. Never copy contact details, free text or documents. */
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const db = require('./database');
const DAY = 86400000;
const SOURCES = [
    { app: 'Dfus Reuven', file: '/var/lib/dfus-reuven/quotes/quotes.jsonl', type: 'quotes' },
    { app: 'Dfus Reuven', file: '/var/lib/dfus-reuven/store/store.json', type: 'dfus_orders' },
    { app: 'Dfus Reuven', file: '/var/lib/dfus-reuven/store/store.json', type: 'dfus_contacts' },
    { app: 'Pinhas Ratzon', file: '/var/lib/pinhas-ratzon/leads.jsonl', type: 'contact' },
    { app: 'Koral Events', file: '/opt/koralevents2/shared/data/koral.sqlite', type: 'registrations' },
    { app: 'Koral Events 2', file: '/opt/koralevents/shared/data/koral.sqlite', type: 'registrations' },
    { app: 'On Your Way', file: '/root/OnYourWay/backend/prisma/prod.db', type: 'leads' }
];
function timestamp(value) {
    if (typeof value === 'number' && value < 1e11) value *= 1000;
    if (typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:/.test(value)) value = value.replace(' ', 'T') + 'Z';
    const result = new Date(value);
    return Number.isFinite(result.getTime()) ? result.toISOString() : null;
}
function isTest(row) {
    const phone = String(row.phone || row.phoneNumber || '').replace(/\D/g, '');
    const name = String(row.fullname || row.fullName || row.name || '');
    return row.isTest === true || row.test === true || ['0500000000', '0000000000'].includes(phone)
        || /(?:בדיק[הת]|דיפלוי|דמו|\b(?:smoke|deploy|playwright|test|demo|qa)(?:[\s_-]|\d|$))/i.test(name);
}
// QA runs create whole events: a fifth or more of an event's registrations carry test
// markers, or the event was inserted in a same-second batch of three or more events.
function markFixtureEvents(rows) {
    const events = new Map();
    const batches = new Map();
    for (const row of rows) {
        const item = events.get(row.event_id) || { total: 0, tests: 0, created: row.event_created_at };
        item.total++;
        if (isTest(row)) item.tests++;
        events.set(row.event_id, item);
    }
    for (const item of events.values()) {
        const second = String(item.created || '').slice(0, 19);
        if (second) batches.set(second, (batches.get(second) || 0) + 1);
    }
    const fixture = (item) => item && item.tests > 0
        && (item.tests * 5 >= item.total || (batches.get(String(item.created || '').slice(0, 19)) || 0) >= 3);
    return rows.map((row) => ({ ...row, isTest: isTest(row) || fixture(events.get(row.event_id)) }));
}
async function readRows(source) {
    if (['dfus_orders', 'dfus_contacts'].includes(source.type)) {
        const stat = await fs.stat(source.file);
        if (stat.size > 16 * 1024 * 1024) throw new Error('source_too_large');
        const store = JSON.parse(await fs.readFile(source.file, 'utf8'));
        const entries = store[source.type === 'dfus_orders' ? 'orders' : 'contacts'];
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('source_invalid');
        const rows = Object.values(entries);
        if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw new Error('source_invalid');
        }
        // Inspect fixture markers in memory, then discard every customer field.
        const statuses = ['request_saved', 'in_review', 'ready', 'completed', 'cancelled', 'open', 'done'];
        return rows.map(row => ({ id: row.id, createdAt: row.createdAt, status: statuses.includes(row.status) ? row.status : 'stored',
            isTest: isTest(row) || isTest(row.customer || {}) }));
    }
    if (['quotes', 'contact'].includes(source.type)) {
        const stat = await fs.stat(source.file);
        if (stat.size > 16 * 1024 * 1024) throw new Error('source_too_large');
        const raw = await fs.readFile(source.file, 'utf8');
        const lines = raw.split('\n');
        const rows = [];
        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            try { rows.push(JSON.parse(lines[i])); }
            catch { if (i !== lines.length - 1) throw new Error('source_invalid'); }
        }
        return rows;
    }
    const sourceDb = new Database(source.file, { readonly: true, fileMustExist: true, timeout: 1000 });
    try {
        if (source.type === 'registrations') {
            const rows = sourceDb.prepare(`SELECT r.id,r.event_id,r.created_at,r.status,r.paid,r.name,r.phone,e.created_at AS event_created_at
                FROM registrations r LEFT JOIN events e ON e.id = r.event_id ORDER BY r.id DESC LIMIT 10000`).all();
            return markFixtureEvents(rows).map(({ event_id, event_created_at, ...row }) => row);
        }
        return sourceDb.prepare('SELECT id,createdAt,status,fullName,phoneNumber FROM Lead ORDER BY createdAt DESC LIMIT 10000').all();
    } finally { sourceDb.close(); }
}
function importRows(appId, type, rows) {
    let imported = 0, excluded = 0;
    const stamp = new Date().toISOString(), cutoff = Date.now() - 90 * DAY;
    const insert = db.prepare(`INSERT OR IGNORE INTO growth_leads
        (app_id,reference,origin,external_key,occurred_at,created_at,updated_at,source_status)
        VALUES(?,?,?,?,?,?,?,?)`);
    const update = db.prepare('UPDATE growth_leads SET source_status=? WHERE app_id=? AND origin=? AND external_key=?');
    db.transaction(() => {
        for (const row of rows) {
            const identity = row.id ?? row.at;
            if (identity === undefined) { excluded++; continue; }
            const key = crypto.createHash('sha256').update(`${appId}:${type}:${identity}`).digest('hex');
            if (isTest(row)) {
                excluded++;
                db.prepare("UPDATE growth_leads SET archived=1,source_status='excluded_test' WHERE app_id=? AND origin=? AND external_key=?")
                    .run(appId, type, key);
                continue;
            }
            const occurred = timestamp(row.receivedAt || row.at || row.created_at || row.createdAt);
            if (!occurred || Date.parse(occurred) < cutoff || Date.parse(occurred) > Date.now() + 60000) { excluded++; continue; }
            const state = type === 'contact' ? (row.mailed === false ? 'notification_failed' : 'stored')
                : String(row.status || 'stored').slice(0, 64);
            const sourceId = /^[a-zA-Z0-9_-]{1,64}$/.test(String(row.id || '')) ? String(row.id) : occurred;
            const result = insert.run(appId, `פנייה ${sourceId}`, type, key, occurred, stamp, stamp, state);
            imported += result.changes;
            update.run(state, appId, type, key);
            // Respect authoritative operational completion without calling it a
            // sale. Any internal user edit takes precedence over source status.
            const workflow = state === 'cancelled' ? 'irrelevant' : ['approved', 'CLOSED', 'completed', 'done'].includes(state) ? 'completed'
                : ['ASSIGNED', 'in_review', 'ready'].includes(state) ? 'working' : 'new';
            db.prepare(`UPDATE growth_leads SET status=? WHERE app_id=? AND origin=? AND external_key=?
                AND NOT EXISTS(SELECT 1 FROM growth_activity a WHERE a.app_id=growth_leads.app_id AND a.kind='leads' AND a.entity_id=growth_leads.id)`)
                .run(workflow, appId, type, key);
        }
    })();
    return { imported, excluded };
}
let running = false;
async function syncGrowthSources(sources = SOURCES) {
    if (running) return;
    running = true;
    try {
        const grouped = Map.groupBy(sources, source => source.app);
        for (const [appName, appSources] of grouped) {
            const app = db.prepare('SELECT id FROM apps WHERE name=? AND reporting_enabled=1').get(appName);
            if (!app) continue;
            const stamp = new Date().toISOString();
            let imported = 0, excluded = 0;
            const failures = [];
            for (const source of appSources) {
                try {
                    const result = importRows(app.id, source.type, await readRows(source));
                    imported += result.imported; excluded += result.excluded;
                } catch (error) {
                    failures.push(error.code === 'ENOENT' ? 'קובץ הפניות טרם נוצר או אינו זמין' : 'לא ניתן לקרוא בבטחה את מקור הפניות');
                }
            }
            const ok = failures.length === 0;
            db.prepare(`INSERT INTO growth_sources(app_id,last_success_at,last_attempt_at,status,imported,excluded,detail)
                VALUES(?,?,?,?,?,?,?) ON CONFLICT(app_id) DO UPDATE SET
                last_success_at=CASE WHEN excluded.status='ok' THEN excluded.last_success_at ELSE growth_sources.last_success_at END,
                last_attempt_at=excluded.last_attempt_at,status=excluded.status,
                imported=growth_sources.imported+excluded.imported,excluded=excluded.excluded,detail=excluded.detail`)
                .run(app.id, ok ? stamp : null, stamp, ok ? 'ok' : 'error', imported, excluded, [...new Set(failures)].join('; '));
        }
        const cutoff = new Date(Date.now() - 90 * DAY).toISOString();
        db.prepare('DELETE FROM growth_events WHERE occurred_at<?').run(cutoff);
    } finally { running = false; }
}
function startGrowthSources() {
    if (process.env.NODE_ENV === 'test') return;
    const tick = () => syncGrowthSources().catch(e => console.error('Growth source sync failed:', e.message));
    tick();
    setInterval(tick, 60000).unref();
}
module.exports = { startGrowthSources, syncGrowthSources, importRows, readRows, isTest, markFixtureEvents, timestamp, SOURCES };
