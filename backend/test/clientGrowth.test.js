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
const { importRows, syncGrowthSources } = require('../growthSources');
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
    assert.equal(growth.overview({}).sites.length, 12);
    assert.throws(() => growth.detail(db.prepare("SELECT id FROM apps WHERE name='Maavar'").get().id, {}), /לא נמצא/);
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
test('HTTP workspace requires internal JWT, not the Manager Site integration key', async () => {
    const express = require('express'), jwt = require('jsonwebtoken');
    const serverApp = express(); serverApp.use(express.json()); serverApp.use('/growth', require('../routes/clientGrowth'));
    const server = serverApp.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    try {
        const url = `http://127.0.0.1:${server.address().port}/growth`;
        assert.equal((await fetch(url)).status, 401);
        assert.equal((await fetch(url, { headers: { 'x-manager-site-analytics-key': 'anything' } })).status, 401);
        const token = jwt.sign({ id: 1, username: 'tester' }, process.env.JWT_SECRET || 'supersecret_monitor_key_123', { expiresIn: '1m' });
        const headers = { Authorization: `Bearer ${token}` };
        assert.equal((await fetch(url, { headers })).status, 200);
        assert.equal((await fetch(`${url}/${app.id}?days=1000`, { headers })).status, 400);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
