const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-monitor-email-'));
process.env.NODE_ENV = 'test';
process.env.MONITOR_DB_PATH = path.join(tempDir, 'test.db');

const db = require('../database');
const { buildPeriod, buildReportData, renderEmail } = require('../emailReports');

test.after(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('builds completed Israel calendar periods', () => {
    const now = new Date('2026-07-12T07:00:00.000Z');
    const daily = buildPeriod('daily', now);
    assert.equal(daily.periodKey, '2026-07-11');
    assert.equal(daily.from, '2026-07-10T21:00:00.000Z');
    assert.equal(daily.to, '2026-07-11T21:00:00.000Z');

    const weekly = buildPeriod('weekly', now);
    assert.equal(weekly.periodKey, '2026-06-29');
    assert.equal(weekly.from, '2026-06-28T21:00:00.000Z');
    assert.equal(weekly.to, '2026-07-05T21:00:00.000Z');
});

test('builds per-client comparisons and safe HTML', () => {
    const appId = db.prepare('INSERT INTO apps (name, url, log_path, status) VALUES (?, ?, ?, ?)')
        .run('Client <One>', 'https://example.com', '/tmp/access.log', 'online').lastInsertRowid;
    const insert = db.prepare(`INSERT INTO visitor_events (app_id, source_file_id, source_offset, occurred_at, ip, path, is_bot) VALUES (?, 'email-test', ?, ?, ?, ?, ?)`);
    insert.run(appId, 1, '2026-07-11T10:00:00.000Z', '1.1.1.1', '/pricing', 0);
    insert.run(appId, 2, '2026-07-11T11:00:00.000Z', '2.2.2.2', '/pricing', 0);
    insert.run(appId, 3, '2026-07-11T12:00:00.000Z', '9.9.9.9', '/scan', 1);
    insert.run(appId, 4, '2026-07-10T10:00:00.000Z', '1.1.1.1', '/', 0);

    const period = {
        type: 'daily', periodKey: '2026-07-11',
        from: '2026-07-11T00:00:00.000Z', to: '2026-07-12T00:00:00.000Z',
        previousFrom: '2026-07-10T00:00:00.000Z'
    };
    const row = buildReportData(period).find((item) => item.id === appId);
    assert.equal(row.uniqueHumans, 2);
    assert.equal(row.uniqueChange, 100);
    assert.equal(row.humanRequests, 2);
    assert.equal(row.botRequests, 1);
    assert.equal(row.topPage, '/pricing');

    const rendered = renderEmail('daily', period, [row]);
    assert.match(rendered.subject, /סיכום לקוחות יומי/);
    assert.match(rendered.html, /Client &lt;One&gt;/);
    assert.doesNotMatch(rendered.html, /Client <One>/);
});
