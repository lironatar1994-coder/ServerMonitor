const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-growth-'));
process.env.MONITOR_DB_PATH = path.join(temp, 'test.db');
process.env.NODE_ENV = 'test';
process.env.VISITOR_SIGNAL_KEY = 'isolated-growth-test-key';
const db = require('../database');
const growth = require('../clientGrowth');
const { recordGrowthSignal } = require('../growthSignals');
const { importRows, syncGrowthSources, readRows } = require('../growthSources');
const app = db.prepare("SELECT * FROM apps WHERE name='Dfus Reuven'").get();
const second = db.prepare("SELECT * FROM apps WHERE name='Pinhas Ratzon'").get();
const at = new Date().toISOString();
const body = () => ({ event_id: crypto.randomUUID(), visitor_id: crypto.randomUUID(), session_id: crypto.randomUUID(), path: '/', event_type: 'page_view' });
const record = b => recordGrowthSignal({ body: b, ip: '1.2.3.4', userAgent: 'Mozilla/5.0', siteUrl: app.url });
test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('migration is repeatable and preserves edited goals and canonical-only clients', () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM growth_goals').get().n;
    require('../growthSchema').initializeGrowth(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_goals').get().n, before);
    assert.equal(growth.overview({}).sites.length, 13);
    assert.throws(() => growth.detail(db.prepare("SELECT id FROM apps WHERE name='Alenu CRM'").get().id, {}), /לא נמצא/);
});
test('browser actions deduplicate, strip unsupported fields and cannot forge confirmed leads', () => {
    const b = { ...body(), source: 'instagram', campaign: 'sale', phone: 'SECRET', message: 'PRIVATE' };
    assert.equal(record(b).duplicate, false); assert.equal(record(b).duplicate, true);
    const row = db.prepare('SELECT * FROM growth_events WHERE event_id=?').get(b.event_id);
    assert.equal(row.source, 'instagram'); assert.ok(!JSON.stringify(row).includes('SECRET')); assert.ok(!JSON.stringify(row).includes(b.session_id));
    assert.throws(() => record({ ...body(), event_type: 'lead_received' }), /Invalid/);
    assert.throws(() => recordGrowthSignal({ body: body(), ip: '1.2.3.4', siteUrl: 'https://evil.example/' }), /Invalid/);
    const before = growth.metrics(app.id, '2000-01-01', '2100-01-01').sessions;
    record({ ...body(), webdriver: true });
    assert.equal(growth.metrics(app.id, '2000-01-01', '2100-01-01').sessions, before);
});
test('read-only source imports exclude smoke tests, deduplicate and preserve manual workflow', () => {
    const rows = [{ id: 'source-1', receivedAt: at, fullname: 'Real', phone: '0521234567', details: 'PRIVATE' },
        { id: 'smoke', receivedAt: at, fullname: 'בדיקת דיפלוי', phone: '0500000000' }];
    assert.deepEqual(importRows(app.id, 'quotes', rows), { imported: 1, excluded: 1 });
    const lead = db.prepare("SELECT * FROM growth_leads WHERE app_id=? AND origin='quotes'").get(app.id);
    assert.ok(!JSON.stringify(lead).includes('0521234567')); assert.ok(!JSON.stringify(lead).includes('PRIVATE'));
    growth.save(app.id, 'leads', lead.id, { status: 'won', owner: 'operator', value: 100 }, 'tester');
    assert.equal(importRows(app.id, 'quotes', rows).imported, 0);
    assert.equal(db.prepare('SELECT status FROM growth_leads WHERE id=?').get(lead.id).status, 'won');
    assert.equal(growth.metrics(app.id, '2000-01-01', '2100-01-01').confirmed, 1);
});
test('record IDs cannot cross client boundaries and manual leads cannot change their origin', () => {
    const lead = growth.save(app.id, 'leads', null, { reference: 'internal-reference', origin: 'quotes', status: 'new' }, 'tester');
    assert.equal(lead.origin, 'manual');
    assert.throws(() => growth.save(second.id, 'leads', lead.id, { status: 'won' }, 'tester'), /לא נמצאה/);
    assert.throws(() => growth.save(app.id, 'tasks', null, { title: 'test', metric: 'lead_received', path: '/service' }, 'tester'), /רמת האתר/);
});
test('campaign links remain on the stored site and reject invalid destinations', () => {
    const c = growth.save(app.id, 'campaigns', null, { name: 'summer', source: 'instagram', medium: 'social', landing_path: '/services', cost: 100 }, 'tester');
    const url = new URL(c.url); assert.equal(url.host, new URL(app.url).host); assert.equal(url.searchParams.get('utm_campaign'), 'summer');
    assert.throws(() => growth.save(app.id, 'campaigns', null, { name: 'x', source: 'x', medium: 'x', landing_path: '//evil.example/' }, 'tester'));
    const nested = db.prepare("SELECT * FROM apps WHERE name='Koral Events'").get();
    assert.throws(() => growth.save(nested.id, 'campaigns', null, { name: 'x', source: 'x', medium: 'x', landing_path: '/Koralevents/../../admin' }, 'tester'), /להשתייך/);
});
test('publication timestamp is stable and low sample impacts stay qualified', () => {
    let task = growth.save(app.id, 'tasks', null, { title: 'Published change', status: 'published', hypothesis: 'INTERNAL-NOTE' }, 'tester');
    const published = task.published_at;
    task = growth.save(app.id, 'tasks', task.id, { status: 'done' }, 'tester');
    assert.equal(task.published_at, published);
    const view = growth.detail(app.id, {});
    assert.equal(view.tasks.find(t => t.id === task.id).impact.ready, false);
    const report = growth.report(app.id, {}).body;
    assert.ok(report.includes('Published change')); assert.ok(!report.includes('INTERNAL-NOTE')); assert.ok(!report.includes('internal-reference'));
});
test('source errors remain visible and do not erase the last success', async () => {
    const source = { app: app.name, type: 'quotes', file: path.join(temp, 'quotes.jsonl') };
    fs.writeFileSync(source.file, JSON.stringify({ id: 'sync-1', receivedAt: at }) + '\n');
    await syncGrowthSources([source]);
    const previous = db.prepare('SELECT * FROM growth_sources WHERE app_id=?').get(app.id);
    assert.equal(previous.status, 'ok');
    fs.unlinkSync(source.file); await syncGrowthSources([source]);
    const failed = db.prepare('SELECT * FROM growth_sources WHERE app_id=?').get(app.id);
    assert.equal(failed.status, 'error'); assert.equal(failed.last_success_at, previous.last_success_at);
});
test('source completion is not revenue and newly identified fixtures are excluded', () => {
    const row = { id: 'registration-approved', created_at: at, name: 'Real name', status: 'approved' };
    importRows(second.id, 'registrations', [row]);
    const lead = db.prepare("SELECT * FROM growth_leads WHERE app_id=? AND origin='registrations'").get(second.id);
    assert.equal(lead.status, 'completed');
    assert.equal(growth.metrics(second.id, '2000-01-01', '2100-01-01').won, 0);
    importRows(second.id, 'registrations', [{ ...row, name: 'בדיקת הרשמה' }]);
    assert.equal(db.prepare('SELECT archived FROM growth_leads WHERE id=?').get(lead.id).archived, 1);
});
test('new Dfus store adapters exclude nested fixtures and retain only source metadata', async () => {
    const file = path.join(temp, 'store.json');
    fs.writeFileSync(file, JSON.stringify({ orders: {
        'store-order': { id: 'store-order', createdAt: at, status: 'ready', customer: { name: 'PRIVATE NAME', phone: '0521234567' }, notes: 'PRIVATE NOTE' },
        'store-fixture': { id: 'store-fixture', createdAt: at, customer: { name: 'בדיקת הזמנה' } }
    }, contacts: { 'store-contact': { id: 'store-contact', createdAt: at, customer: {name: 'PRIVATE CONTACT'}, message: 'PRIVATE MESSAGE' } } }));
    const orders = { app: app.name, file, type: 'dfus_orders' };
    const contacts = { ...orders, type: 'dfus_contacts' };
    const rows = await readRows(orders);
    assert.ok(!JSON.stringify(rows).includes('PRIVATE')); assert.ok(!JSON.stringify(rows).includes('0521234567'));
    await syncGrowthSources([orders, contacts]);
    const leads = db.prepare("SELECT * FROM growth_leads WHERE app_id=? AND origin LIKE 'dfus_%'").all(app.id);
    assert.equal(leads.length, 2); assert.ok(!JSON.stringify(leads).includes('PRIVATE'));
    const lead = leads.find(row => row.origin === 'dfus_orders'); assert.equal(lead.status, 'working');
    assert.equal(db.prepare('SELECT excluded FROM growth_sources WHERE app_id=?').get(app.id).excluded, 1);
    await syncGrowthSources([orders, contacts]);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM growth_leads WHERE app_id=? AND origin LIKE 'dfus_%'").get(app.id).n, 2);
    growth.save(app.id, 'leads', lead.id, { status: 'contacted' }, 'tester');
    importRows(app.id, 'dfus_orders', [{ id: 'store-order', createdAt: at, status: 'completed' }]);
    assert.equal(db.prepare('SELECT status FROM growth_leads WHERE id=?').get(lead.id).status, 'contacted');
    importRows(app.id, 'dfus_orders', [{ id: 'store-completed', createdAt: at, status: 'completed' }]);
    assert.equal(db.prepare("SELECT status FROM growth_leads WHERE reference='פנייה store-completed'").get().status, 'completed');
    assert.equal(growth.metrics(app.id, '2000-01-01', '2100-01-01').won, 1); // only earlier manually won quote
});
test('a healthy second adapter cannot hide a failed source or advance complete success', async () => {
    const store = { app: app.name, type: 'dfus_contacts', file: path.join(temp, 'store.json') };
    await syncGrowthSources([store]);
    const previous = db.prepare('SELECT last_success_at FROM growth_sources WHERE app_id=?').get(app.id).last_success_at;
    await syncGrowthSources([{ app: app.name, type: 'quotes', file: path.join(temp, 'missing.jsonl') }, store]);
    const failed = db.prepare('SELECT * FROM growth_sources WHERE app_id=?').get(app.id);
    assert.equal(failed.status, 'error'); assert.equal(failed.last_success_at, previous);
    fs.writeFileSync(store.file, JSON.stringify({ contacts: [] }));
    await syncGrowthSources([store]);
    assert.equal(db.prepare('SELECT status FROM growth_sources WHERE app_id=?').get(app.id).status, 'error');
});
test('HTTP workspace requires internal sessions, not the Manager Site integration key', async () => {
    const express = require('express');
    const serverApp = express(); serverApp.use(express.json()); serverApp.use('/growth', require('../routes/clientGrowth'));
    const server = serverApp.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    try {
        const url = `http://127.0.0.1:${server.address().port}/growth`;
        assert.equal((await fetch(url)).status, 401);
        assert.equal((await fetch(url, { headers: { 'x-manager-site-analytics-key': 'anything' } })).status, 401);
        const userId = db.prepare("INSERT INTO users(username,password,role) VALUES ('http-tester','not-login-capable','reader')").run().lastInsertRowid;
        const token = require('../routes/auth').createSessionToken({ id: Number(userId) });
        const headers = { Authorization: `Bearer ${token}` };
        assert.equal((await fetch(url, { headers })).status, 200);
        assert.equal((await fetch(`${url}/${app.id}?days=1000`, { headers })).status, 400);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
test('QA events are archived as a whole while a real event keeps an owner test registration separate', () => {
    const { markFixtureEvents } = require('../growthSources');
    const row = (id, event, name, created = '2026-09-07T10:00:00.000Z') => ({ id, event_id: event, name, phone: '0521234567', event_created_at: created });
    const marked = markFixtureEvents([
        row('a', 'qa', 'בדיקה'), row('b', 'qa', 'נועה'), row('c', 'qa', 'דנה'),
        ...Array.from({ length: 12 }, (_, i) => row(`r${i}`, 'real', `אורחת ${String.fromCharCode(1488 + i)}`)), row('t', 'real', 'test owner'),
        row('s1', 'seed1', 'test', '2026-09-07T12:57:22.100Z'), row('s2', 'seed1', 'רותם', '2026-09-07T12:57:22.100Z'),
        row('x', 'seed2', 'יעל', '2026-09-07T12:57:22.300Z'), row('y', 'seed3', 'מאיה', '2026-09-07T12:57:22.900Z')
    ]);
    const flag = Object.fromEntries(marked.map(item => [item.id, item.isTest]));
    assert.deepEqual([flag.a, flag.b, flag.c], [true, true, true]);
    assert.equal(flag.r0, false);
    assert.equal(flag.t, true);
    assert.deepEqual([flag.s1, flag.s2, flag.x], [true, true, false]);
});
