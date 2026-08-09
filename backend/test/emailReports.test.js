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
    const insert = db.prepare(`INSERT INTO visitor_events (app_id, source_file_id, source_offset, occurred_at, ip, path, is_bot, is_page_view) VALUES (?, 'email-test', ?, ?, ?, ?, ?, ?)`);
    insert.run(appId, 1, '2026-07-11T10:00:00.000Z', '1.1.1.1', '/pricing', 0, 1);
    insert.run(appId, 2, '2026-07-11T11:00:00.000Z', '2.2.2.2', '/pricing', 0, 1);
    insert.run(appId, 3, '2026-07-11T12:00:00.000Z', '9.9.9.9', '/scan', 1, 1);
    insert.run(appId, 4, '2026-07-10T10:00:00.000Z', '1.1.1.1', '/', 0, 1);
    insert.run(appId, 5, '2026-07-11T13:00:00.000Z', '1.1.1.1', '/images/hero.webp', 0, 0);

    const period = {
        type: 'daily', periodKey: '2026-07-11',
        from: '2026-07-11T00:00:00.000Z', to: '2026-07-12T00:00:00.000Z',
        previousFrom: '2026-07-10T00:00:00.000Z'
    };
    const row = buildReportData(period).find((item) => item.id === appId);
    assert.equal(row.uniqueCandidates, 2);
    assert.equal(row.uniqueChange, 100);
    assert.equal(row.candidateRequests, 3);
    assert.equal(row.pageViews, 2);
    assert.equal(row.botRequests, 1);
    assert.equal(row.topPage, '/pricing');

    const rendered = renderEmail('daily', period, [row]);
    assert.match(rendered.subject, /דוח תנועה יומי/);
    assert.match(rendered.html, /זו הערכה, לא אימות של אדם/);
    assert.match(rendered.html, /צפיות בעמודים/);
    assert.match(rendered.html, /monitor\.vee-app\.co\.il\/serve-monitor\/visitors/);
    assert.match(rendered.html, /Client &lt;One&gt;/);
    assert.doesNotMatch(rendered.html, /Client <One>/);
});

test('includes seeded Libi Diamonds in client comparison reports', () => {
    const period = {
        type: 'daily', periodKey: '2026-07-11',
        from: '2026-07-11T00:00:00.000Z', to: '2026-07-12T00:00:00.000Z',
        previousFrom: '2026-07-10T00:00:00.000Z'
    };
    const libiApp = db.prepare('SELECT id FROM apps WHERE name = ?').get('Libi Diamonds');
    db.prepare(`INSERT INTO visitor_events (
        app_id, source_file_id, source_offset, occurred_at, ip, path, is_bot, is_page_view
    ) VALUES (?, 'email-libi-product', 1, ?, '7.7.7.7', '/product/aura-solitaire-ring', 0, 1)`)
        .run(libiApp.id, '2026-07-11T10:00:00.000Z');
    const row = buildReportData(period).find((item) => item.name === 'Libi Diamonds');
    assert.ok(row);
    assert.equal(row.url, 'https://www.libidiamonds.co.il/');
    assert.equal(row.jewelryInterest.summary.top_product.name, 'טבעת סוליטר ״אורה״');

    const rendered = renderEmail('daily', period, [row]);
    assert.match(rendered.html, /Libi Diamonds/);
    assert.match(rendered.html, /https:\/\/www\.libidiamonds\.co\.il\//);
    assert.match(rendered.html, /התכשיט הנצפה ביותר/);
    assert.match(rendered.html, /טבעת סוליטר/);
});

test('excludes operational log records without a website URL', () => {
    db.prepare('INSERT INTO apps (name, url, log_path, status) VALUES (?, ?, ?, ?)')
        .run('Cleanup Summary', '', '/var/log/server_cleanup_summary.log', 'online');
    const period = {
        type: 'daily', periodKey: '2026-07-11',
        from: '2026-07-11T00:00:00.000Z', to: '2026-07-12T00:00:00.000Z',
        previousFrom: '2026-07-10T00:00:00.000Z'
    };
    assert.equal(buildReportData(period).some((item) => item.name === 'Cleanup Summary'), false);
});

test('excludes analytics-only preview apps from client comparison email', () => {
    const previewId = db.prepare(`INSERT INTO apps
        (name, url, log_path, analytics_enabled, reporting_enabled)
        VALUES (?, ?, ?, 1, 0)`)
        .run('Preview Site', 'https://example.com/preview', '/tmp/access.log').lastInsertRowid;
    const period = {
        type: 'daily', periodKey: '2026-07-11',
        from: '2026-07-11T00:00:00.000Z', to: '2026-07-12T00:00:00.000Z',
        previousFrom: '2026-07-10T00:00:00.000Z'
    };

    assert.equal(buildReportData(period).some((item) => item.id === previewId), false);
});
