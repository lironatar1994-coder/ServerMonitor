const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-monitor-analytics-'));
process.env.NODE_ENV = 'test';
process.env.MONITOR_DB_PATH = path.join(tempDir, 'test.db');
process.env.GEOIP_DB_PATH = path.join(tempDir, 'missing.mmdb');

const db = require('../database');
const { parseAccessLogTimestamp, parseNginxAccessLine } = require('../logParser');
const { ingestApp, purgeExpiredEvents } = require('../visitorAnalytics');

const humanLine = '1.2.3.4 - - [12/Jul/2026:12:00:00 +0300] "GET /site/ HTTP/1.1" 200 120 "https://google.com" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"';
const botLine = '5.6.7.8 - - [12/Jul/2026:12:01:00 +0300] "GET /site/wp-login.php HTTP/1.1" 404 12 "-" "curl/8.1"';
const secondHumanLine = '1.2.3.4 - - [12/Jul/2026:12:02:00 +0300] "GET /site/about HTTP/1.1" 200 100 "-" "Mozilla/5.0 (Windows NT 10.0)"';

test.after(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('parses combined Nginx rows and honors numeric timezone offsets', () => {
    const parsed = parseNginxAccessLine(humanLine);
    assert.equal(parsed.ip, '1.2.3.4');
    assert.equal(parsed.path, '/site/');
    assert.equal(new Date(parseAccessLogTimestamp(parsed.timestamp)).toISOString(), '2026-07-12T09:00:00.000Z');
});

test('backfills, classifies, deduplicates, and incrementally ingests', () => {
    const logPath = path.join(tempDir, 'access.log');
    fs.writeFileSync(logPath, `${humanLine}\n${botLine}\n`, 'utf8');
    const appId = db.prepare('INSERT INTO apps (name, log_path, log_filter) VALUES (?, ?, ?)')
        .run('Test Site', logPath, '/site/').lastInsertRowid;
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);

    assert.equal(ingestApp(app), 2);
    assert.equal(ingestApp(app), 0);
    assert.deepEqual(db.prepare('SELECT is_bot, COUNT(*) AS count FROM visitor_events WHERE app_id = ? GROUP BY is_bot ORDER BY is_bot').all(appId), [
        { is_bot: 0, count: 1 }, { is_bot: 1, count: 1 }
    ]);

    fs.appendFileSync(logPath, `${secondHumanLine}\n`, 'utf8');
    assert.equal(ingestApp(app), 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM visitor_events WHERE app_id = ?').get(appId).count, 3);
});

test('purges raw visitor events older than 90 days', () => {
    const app = db.prepare('SELECT id FROM apps WHERE name = ?').get('Test Site');
    db.prepare(`INSERT INTO visitor_events (app_id, source_file_id, source_offset, occurred_at, ip)
        VALUES (?, 'old-file', 999, '2020-01-01T00:00:00.000Z', '9.9.9.9')`).run(app.id);
    assert.equal(purgeExpiredEvents(), 1);
});
