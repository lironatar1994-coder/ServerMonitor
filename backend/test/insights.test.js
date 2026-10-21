const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-insights-'));
process.env.MONITOR_DB_PATH = path.join(temp, 'test.db');
process.env.NODE_ENV = 'test';
const db = require('../database');
const { detectInsights, runInsights } = require('../insights');
const push = require('../push');

test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
const app = (name) => db.prepare('SELECT * FROM apps WHERE name = ?').get(name);
const NOW = Date.parse('2026-10-21T07:30:00Z'); // 10:30 in Israel

test('new inquiries are reported once, grouped per site, only after the first run', () => {
    const site = app('Dfus Reuven');
    const lead = db.prepare(`INSERT INTO growth_leads (app_id, reference, origin, external_key, occurred_at, created_at, updated_at, status)
        VALUES (?, ?, 'contact', ?, ?, ?, ?, 'new')`);
    lead.run(site.id, 'r1', 'k1', new Date(NOW - 3600000).toISOString(), new Date(NOW - 3600000).toISOString(), new Date(NOW).toISOString());
    assert.equal(detectInsights(db, NOW).filter((item) => item.category === 'leads' && item.key.startsWith('leads:')).length, 0);
    lead.run(site.id, 'r2', 'k2', new Date(NOW).toISOString(), new Date(NOW + 60000).toISOString(), new Date(NOW).toISOString());
    lead.run(site.id, 'r3', 'k3', new Date(NOW).toISOString(), new Date(NOW + 60000).toISOString(), new Date(NOW).toISOString());
    const items = detectInsights(db, NOW + 120000).filter((item) => item.key.startsWith('leads:'));
    assert.equal(items.length, 1);
    assert.equal(items[0].title, '2 פניות חדשות · Dfus Reuven');
    assert.equal(items[0].url, `/serve-monitor/clients/${site.id}`);
});

test('traffic spikes need a real baseline and a large enough change', () => {
    const site = app('Pinhas Ratzon');
    const signal = db.prepare("INSERT INTO browser_signals (app_id, event_id, occurred_at, ip, visitor_hash, session_hash, path, automation_hint) VALUES (?, ?, ?, '1.1.1.1', 'v', ?, '/', 0)");
    for (let d = 2; d <= 8; d++) for (let i = 0; i < 6; i++) signal.run(site.id, `old${d}_${i}_1234567890`, new Date(NOW - d * 86400000 + i * 60000).toISOString(), `s${d}_${i}`);
    for (let i = 0; i < 40; i++) signal.run(site.id, `new${i}_1234567890ab`, new Date(NOW - 3600000 + i * 1000).toISOString(), `n${i}`);
    const spike = detectInsights(db, NOW).find((item) => item.key.startsWith(`traffic:${site.id}:up`));
    assert.ok(spike);
    assert.match(spike.body, /משוערים/);
});

test('the morning summary appears from 08:00 Israel time, once per day', async () => {
    assert.equal(detectInsights(db, Date.parse('2026-10-21T04:30:00Z')).some((item) => item.category === 'digest'), false);
    const morning = detectInsights(db, NOW).find((item) => item.category === 'digest');
    assert.equal(morning.key, 'digest:2026-10-21');
    assert.match(morning.body, /לחיצות קשר/);
    const sent = [];
    const fakePush = { sendPush: async (message, options) => { sent.push(options.key); return { delivered: 0 }; } };
    await runInsights(db, NOW, fakePush);
    const again = await runInsights(db, NOW + 60000, fakePush);
    assert.ok(sent.includes('digest:2026-10-21'));
    assert.equal(again.some((item) => item.key === 'digest:2026-10-21'), false);
});

test('devices honour categories, quiet hours and the daily insight cap', () => {
    const user = db.prepare("INSERT INTO users (username, password) VALUES ('push-user', 'x')").run().lastInsertRowid;
    push.subscribe(user, { endpoint: 'https://push.example/abc', keys: { p256dh: 'p'.repeat(40), auth: 'a'.repeat(16) } });
    push.savePreferences(user, { endpoint: 'https://push.example/abc', categories: ['outage', 'traffic'], quiet_start: 22, quiet_end: 7, daily_cap: 1 });
    const row = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get('https://push.example/abc');
    const day = new Date('2026-10-21T09:00:00Z');   // 12:00 Israel
    const night = new Date('2026-10-21T21:00:00Z'); // 00:00 Israel
    assert.equal(push.allowed(row, { category: 'leads' }, day), false);
    assert.equal(push.allowed(row, { category: 'traffic' }, day), true);
    assert.equal(push.allowed(row, { category: 'traffic' }, night), false);
    assert.equal(push.allowed(row, { category: 'outage', urgent: true }, night), true);
    db.prepare("INSERT INTO push_deliveries (subscription_id, category, notification_key, sent_at) VALUES (?, 'traffic', 'k', ?)").run(row.id, day.toISOString());
    assert.equal(push.allowed(row, { category: 'traffic' }, new Date(day.getTime() + 60000)), false);
    assert.equal(push.allowed(row, { category: 'outage' }, new Date(day.getTime() + 60000)), true);
    assert.throws(() => push.savePreferences(user, { endpoint: 'https://push.example/abc', categories: [], quiet_start: 25, quiet_end: 7, daily_cap: 1 }), /אינן תקינות/);
});
