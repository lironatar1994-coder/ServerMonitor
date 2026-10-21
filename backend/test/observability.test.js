const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-observability-'));
process.env.MONITOR_DB_PATH = path.join(temp, 'test.db');
process.env.NODE_ENV = 'test';
const db = require('../database');
const o = require('../observability');
const { renderAlert } = require('../alerts');

test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
const app = (name) => db.prepare('SELECT * FROM apps WHERE name = ?').get(name);

test('availability counts only observed time and lists outages newest first', () => {
    const desk = app('Desk');
    const at = (h) => new Date(Date.UTC(2026, 9, 1, h)).toISOString();
    assert.equal(o.recordStatus(db, desk, 'online', new Date(at(0))), true);
    assert.equal(o.recordStatus(db, desk, 'online', new Date(at(1))), false);
    o.recordStatus(db, desk, 'offline', new Date(at(6)));
    o.recordStatus(db, desk, 'online', new Date(at(9)));
    const result = o.availability(db, desk.id, at(0), at(12));
    assert.equal(result.percent, 75);
    assert.equal(result.outages.length, 1);
    assert.deepEqual([result.outages[0].from, result.outages[0].to], [at(6), at(9)]);
    assert.equal(o.availability(db, app('AllSee').id, at(0), at(12)).percent, null);
});

test('runtime starts become deploy markers only after a real restart', () => {
    const seder = app('Seder');
    o.recordRuntimeStarts(db, [{ appId: seder.id, startedAt: '2026-10-01T10:00:00.000Z' }]);
    o.recordRuntimeStarts(db, [{ appId: seder.id, startedAt: '2026-10-01T10:00:20.000Z' }]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM deploy_events WHERE app_id = ?').get(seder.id).n, 0);
    o.recordRuntimeStarts(db, [{ appId: seder.id, startedAt: '2026-10-02T08:00:00.000Z' }]);
    const marks = o.timeline(db, seder.id, '2026-10-01T00:00:00.000Z', '2026-10-03T00:00:00.000Z');
    assert.equal(marks.deploys.length, 1);
    assert.equal(marks.deploys[0].at, '2026-10-02T08:00:00.000Z');
});

test('notes validate length and date', () => {
    assert.throws(() => o.validateNote({ text: '' }), /200/);
    assert.throws(() => o.validateNote({ text: 'x'.repeat(201) }), /200/);
    assert.equal(o.validateNote({ text: ' קמפיין ', at: '2026-10-01T00:00:00Z', app_id: '5' }).appId, 5);
});

test('web vitals keep only plausible numbers and report p75', () => {
    assert.deepEqual(o.cleanVitals({ lcp: 2400.4, inp: -5, cls: 0.12, ttfb: 'x' }), { lcp_ms: 2400, inp_ms: null, cls: 0.12, ttfb_ms: null });
    const site = app('Alenu');
    const insert = db.prepare('INSERT INTO web_vitals (app_id, event_id, occurred_at, path, device, lcp_ms, inp_ms, cls, ttfb_ms, automation_hint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    [1000, 2000, 3000, 4000].forEach((lcp, i) => insert.run(site.id, `v${i}_1234567890abcdef`, '2026-10-01T10:00:00Z', '/alenu/', 'mobile', lcp, 100, 0.01, 300, 0));
    insert.run(site.id, 'bot_1234567890abcdef', '2026-10-01T10:00:00Z', '/alenu/', 'mobile', 90000, 100, 0.01, 300, 1);
    const summary = o.vitalsSummary(db, site.id, '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z');
    assert.equal(summary.overall.samples, 4);
    assert.equal(summary.overall.lcp_ms, 4000);
    assert.equal(summary.mobile.samples, 4);
    assert.equal(summary.pages[0].path, '/alenu/');
});

test('404 pages exclude assets, automation and successful pages', () => {
    const site = app('Mila Tova CV');
    const insert = db.prepare(`INSERT INTO visitor_events (app_id, source_file_id, source_offset, occurred_at, ip, method, path, status, is_bot, is_page_view, referrer)
        VALUES (?, 'nf', ?, '2026-10-01T10:00:00Z', ?, 'GET', ?, ?, ?, 0, ?)`);
    insert.run(site.id, 1, '1.1.1.1', '/cv/old-page', 404, 0, 'https://google.com/');
    insert.run(site.id, 2, '2.2.2.2', '/cv/old-page', 404, 0, '-');
    insert.run(site.id, 3, '3.3.3.3', '/cv/logo.png', 404, 0, '-');
    insert.run(site.id, 4, '4.4.4.4', '/cv/bot-probe', 404, 1, '-');
    insert.run(site.id, 5, '5.5.5.5', '/cv/fine', 200, 0, '-');
    const pages = o.notFoundPages(db, site.id, '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z');
    assert.deepEqual(pages.map((row) => [row.path, row.visitors, row.referrer]), [['/cv/old-page', 2, 'https://google.com/']]);
});

test('a site with prior browser activity, recent server visitors and no recent signals is silent', () => {
    const site = app('Pinhas Ratzon');
    const now = Date.parse('2026-10-10T12:00:00Z');
    const signal = db.prepare("INSERT INTO browser_signals (app_id, event_id, occurred_at, ip, visitor_hash, session_hash, path, automation_hint) VALUES (?, ?, ?, '1.1.1.1', 'v', 's', '/', 0)");
    for (let i = 0; i < 30; i++) signal.run(site.id, `prior${i}_1234567890ab`, new Date(now - 2 * 86400000 - i * 60000).toISOString());
    const visit = db.prepare("INSERT INTO visitor_events (app_id, source_file_id, source_offset, occurred_at, ip, path, status, is_bot, is_page_view) VALUES (?, 'silent', ?, ?, ?, '/', 200, 0, 1)");
    ['7.7.7.1', '7.7.7.2', '7.7.7.3'].forEach((ip, i) => visit.run(site.id, i, new Date(now - 3600000).toISOString(), ip));
    assert.deepEqual(o.silentTrackers(db, now).map((row) => row.name), ['Pinhas Ratzon']);
    signal.run(site.id, 'recent_1234567890abcd', new Date(now - 600000).toISOString());
    assert.deepEqual(o.silentTrackers(db, now), []);
});

test('alerts name slow and silent problems in the subject and link to the right screen', () => {
    const alert = renderAlert([{ id: 3, name: 'Desk', kind: 'slow', ms: 5200 }, { id: 4, name: 'Alenu', kind: 'silent' }]);
    assert.equal(alert.subject, 'איטי: Desk · מדידה שותקת: Alenu');
    assert.match(alert.text, /Desk: איטי: 5\.2 שניות/);
    assert.match(alert.text, /serve-monitor\/visitors\/4/);
});
