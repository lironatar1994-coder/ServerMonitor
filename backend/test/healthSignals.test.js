const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-health-signals-'));
process.env.MONITOR_DB_PATH = path.join(temp, 'test.db');
process.env.NODE_ENV = 'test';
process.env.VISITOR_SIGNAL_KEY = 'health-signal-test-key';
const express = require('express');
const db = require('../database');
const external = require('../externalChecks');
const capacity = require('../capacity');
const jsErrors = require('../jsErrors');
const { renderAlert } = require('../alerts');

let server, base;
test.before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/signals', require('../routes/browserSignals'));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/signals/site`;
});
test.after(() => { server.close(); db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

const targets = () => external.probeTargets(db);

test('outside checks count consecutive failures and alert only when the server still answers', () => {
    const all = targets();
    assert.ok(all.length >= 4 && all.every((t) => t.url.startsWith('https://')));
    const [site] = all;
    const run = (failing) => external.recordProbeRun(db, 'Home PC', all.map((t) => ({ id: t.id, ok: !failing.includes(t.id), status: failing.includes(t.id) ? 503 : 200, ms: 300 })));
    assert.equal(run([site.id]).stored, all.length);
    assert.equal(external.externalSummary(db).byApp.get(site.id)[0].failures, 1);
    const apps = [{ id: site.id, name: 'Site', status: 'online', alerts_enabled: 1 }];
    assert.equal(external.outsideOnlyFailures(db, apps).length, 0, 'one failure is not enough');
    run([site.id]);
    const [alert] = external.outsideOnlyFailures(db, apps);
    assert.deepEqual(alert.sources, ['HomePC']);
    assert.equal(alert.error, 'HTTP 503');
    assert.equal(external.outsideOnlyFailures(db, [{ ...apps[0], status: 'offline' }]).length, 0, 'a server-side outage alerts on its own');
    assert.match(renderAlert([{ ...alert, kind: 'external' }]).subject, /לא נפתח מבחוץ/);
    run([]);
    assert.equal(external.externalSummary(db).byApp.get(site.id)[0].failing_since, null);
});

test('a run where most sites fail is the checker\'s own connection and marks nothing', () => {
    const all = targets();
    const result = external.recordProbeRun(db, 'Laptop', all.map((t) => ({ id: t.id, ok: false, error: 'ConnectTimeout' })));
    assert.deepEqual(result, { stored: 0, inconclusive: true });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM external_checks WHERE source = 'Laptop'").get().n, 0);
    assert.ok(external.externalSummary(db).sources.some((s) => s.source === 'Laptop' && s.inconclusive));
    assert.throws(() => external.recordProbeRun(db, 'Laptop', 'nope'), /Expected results/);
});

test('host samples are hourly and the disk forecast follows the growth trend', () => {
    const start = Date.parse('2026-10-01T00:00:00Z');
    let used = 10e9;
    const read = () => ({ disk_used: used, disk_available: 50e9 - used, mem_total: 2e9, mem_available: 1e9 });
    assert.equal(capacity.diskForecast(db, start).status, 'collecting');
    for (let hour = 0; hour < 24 * 5; hour++) {
        used = 10e9 + hour * (1e9 / 24); // 1 GB a day
        assert.equal(capacity.sampleHost(db, start + hour * 3600000, read), true);
    }
    assert.equal(capacity.sampleHost(db, start + (24 * 5 - 1) * 3600000 + 600000, read), false, 'at most one sample an hour');
    const now = start + (24 * 5 - 1) * 3600000;
    const forecast = capacity.diskForecast(db, now);
    assert.equal(forecast.status, 'filling');
    assert.ok(Math.abs(forecast.growth_per_day - 1e9) < 1e6);
    assert.equal(forecast.days_to_full, Math.round((50e9 - used) / 1e9));
    assert.equal(capacity.slopePerDay([{ x: 0, y: 5 }, { x: 1, y: 5 }]), 0);
});

const sendError = (body, extra = {}) => fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Visitor-Signal-Key': 'health-signal-test-key', 'X-Visitor-Site-Url': 'https://pinhasratzon.co.il/',
        'X-Visitor-IP': '1.2.3.4', 'X-Visitor-User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', ...extra },
    body: JSON.stringify({ kind: 'error', event_id: 'event_error_1234567890', path: '/contact', name: 'TypeError', source: 'https://pinhasratzon.co.il/assets/app.js?v=3', line: 12, ...body })
});

test('script errors fold into daily counts without personal details', async () => {
    const message = 'Cannot read properties of undefined for dana@example.com at https://pinhasratzon.co.il/x?token=1 order 123456';
    assert.equal((await sendError({ message })).status, 201);
    assert.equal((await sendError({ message })).status, 201);
    assert.equal((await sendError({ message: 'Script error.' })).status, 400);
    assert.equal((await sendError({ message: 'x' }, { 'X-Visitor-User-Agent': 'HeadlessChrome' })).status, 201);
    const rows = db.prepare('SELECT * FROM js_errors').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].count, 2);
    assert.equal(rows[0].source, 'app.js');
    assert.doesNotMatch(rows[0].message, /dana|example\.com|token|123456/);
    const app = db.prepare("SELECT id FROM apps WHERE url = 'https://pinhasratzon.co.il/'").get();
    const now = new Date();
    const summary = jsErrors.jsErrorSummary(db, app.id, new Date(now - 86400000).toISOString(), now.toISOString());
    assert.equal(summary.total, 2);
    assert.equal(summary.errors[0].top_path, '/contact');
});

test('maintenance alerts name what failed in Hebrew and keep unknown reasons as written', () => {
    const { text } = renderAlert([{ id: 1, name: 'Maintenance', status: 'error', kind: 'down',
        detail: 'Certificate expires within 21 days: pinhasratzon.co.il; Odd failure' }]);
    assert.match(text, /נמצאו תקלות: התעודה של pinhasratzon\.co\.il פגה בתוך 21 יום ולא חודשה · Odd failure/);
    assert.match(renderAlert([{ id: 2, name: 'Site', status: 'offline', kind: 'down' }]).text, /Site: לא פועל/);
});
