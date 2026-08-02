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
const {
    getBotReason,
    isPageView,
    isTargetAppLine,
    parseAccessLogTimestamp,
    parseNginxAccessLine
} = require('../logParser');
const { ingestApp, purgeExpiredEvents, refreshStoredEventClassifications } = require('../visitorAnalytics');
const { getLibiJewelryInterest, humanizeSlug, inferCategory } = require('../jewelryAnalytics');

const humanLine = '1.2.3.4 - - [12/Jul/2026:12:00:00 +0300] "GET /site/ HTTP/1.1" 200 120 "https://google.com" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"';
const botLine = '5.6.7.8 - - [12/Jul/2026:12:01:00 +0300] "GET /site/wp-login.php HTTP/1.1" 404 12 "-" "curl/8.1"';
const secondHumanLine = '1.2.3.4 - - [12/Jul/2026:12:02:00 +0300] "GET /site/about HTTP/1.1" 200 100 "-" "Mozilla/5.0 (Windows NT 10.0)"';
const hostAwareLine = '1.2.3.4 - - [12/Jul/2026:12:03:00 +0300] "GET / HTTP/1.1" 200 100 "-" "Mozilla/5.0 (Windows NT 10.0)" "sosbaderech.co.il"';

test.after(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('parses combined Nginx rows and honors numeric timezone offsets', () => {
    const parsed = parseNginxAccessLine(humanLine);
    assert.equal(parsed.ip, '1.2.3.4');
    assert.equal(parsed.path, '/site/');
    assert.equal(new Date(parseAccessLogTimestamp(parsed.timestamp)).toISOString(), '2026-07-12T09:00:00.000Z');
    assert.equal(parsed.host, null);
    assert.equal(parseNginxAccessLine(hostAwareLine).host, 'sosbaderech.co.il');
});

test('requires an exact recorded host when an app has a host boundary', () => {
    assert.equal(isTargetAppLine(
        hostAwareLine,
        'SOS Landing',
        null,
        'sosbaderech.co.il|www.sosbaderech.co.il',
        null
    ), true);
    assert.equal(isTargetAppLine(
        hostAwareLine,
        'Vee Main App',
        null,
        'vee-app.co.il|www.vee-app.co.il',
        null
    ), false);
    assert.equal(isTargetAppLine(
        humanLine,
        'SOS Landing',
        null,
        'sosbaderech.co.il|www.sosbaderech.co.il',
        null
    ), false);
});

test('seeds Libi Diamonds with dedicated production hosts and runtime', () => {
    const app = db.prepare(`
        SELECT name, url, pm2_name, log_path, log_host, log_filter, log_exclude
        FROM apps WHERE name = ?
    `).get('Libi Diamonds');
    assert.deepEqual(app, {
        name: 'Libi Diamonds',
        url: 'https://www.libidiamonds.co.il/',
        pm2_name: 'libi-diamonds-live',
        log_path: '/var/log/nginx/monitor_host_access.log',
        log_host: 'libidiamonds.co.il|www.libidiamonds.co.il',
        log_filter: null,
        log_exclude: null
    });

    const libiLine = '1.2.3.4 - - [12/Jul/2026:12:03:00 +0300] "GET /rings HTTP/1.1" 200 100 "-" "Mozilla/5.0 (Windows NT 10.0)" "www.libidiamonds.co.il"';
    assert.equal(isTargetAppLine(
        libiLine,
        app.name,
        app.log_filter,
        app.log_host,
        app.log_exclude
    ), true);
    assert.equal(isTargetAppLine(
        libiLine,
        'Vee Main App',
        null,
        'vee-app.co.il|www.vee-app.co.il',
        null
    ), false);
});

test('catches production scanner signatures previously counted as candidates', () => {
    const gobuster = parseNginxAccessLine(
        '5.5.5.5 - - [12/Jul/2026:12:04:00 +0300] "GET /.git/config HTTP/1.1" 404 10 "-" "gobuster/3.8.2" "vee-app.co.il"'
    );
    const censys = parseNginxAccessLine(
        '6.6.6.6 - - [12/Jul/2026:12:05:00 +0300] "GET / HTTP/1.1" 200 10 "-" "Mozilla/5.0 (compatible; CensysInspect/1.1)" "vee-app.co.il"'
    );
    assert.equal(getBotReason(gobuster), 'bot user agent');
    assert.equal(getBotReason(censys), 'bot user agent');
    assert.equal(getBotReason({ userAgent: 'WordPress/6.4.3; https://wordpress.org/', path: '/', method: 'GET' }), 'bot user agent');
    assert.equal(getBotReason({ userAgent: 'Mozilla/5.0 (Windows NT) WindowsPowerShell/5.1', path: '/', method: 'GET' }), 'bot user agent');
    assert.equal(getBotReason({ userAgent: 'Python/3.11 aiohttp/3.8.4', path: '/', method: 'GET' }), 'bot user agent');
});

test('separates page views from assets, API calls, errors, and non-navigation methods', () => {
    assert.equal(isPageView({ method: 'GET', path: '/jewelry/rings', status: 200 }), true);
    assert.equal(isPageView({ method: 'GET', path: '/_next/image', status: 200 }), false);
    assert.equal(isPageView({ method: 'GET', path: '/images/ring.webp', status: 200 }), false);
    assert.equal(isPageView({ method: 'GET', path: '/api/products', status: 200 }), false);
    assert.equal(isPageView({ method: 'GET', path: '/missing', status: 404 }), false);
    assert.equal(isPageView({ method: 'GET', path: '/', status: 301 }), false);
    assert.equal(isPageView({ method: 'HEAD', path: '/', status: 200 }), false);
    assert.equal(isPageView({ method: 'POST', path: '/checkout', status: 200 }), false);
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

test('reclassifies stored automation and page views when rules change', () => {
    db.prepare("DELETE FROM monitor_metadata WHERE key = 'visitor_classification_ruleset'").run();
    const app = db.prepare('SELECT id FROM apps WHERE name = ?').get('Test Site');
    db.prepare(`INSERT INTO visitor_events (
        app_id, source_file_id, source_offset, occurred_at, ip, method, path,
        status, user_agent, is_bot, is_page_view
    ) VALUES (?, 'reclassify', 1001, '2026-07-12T10:00:00.000Z', '8.8.8.8', 'GET', '/', 200, 'WordPress/6.4.3; https://wordpress.org/', 0, 0)`).run(app.id);
    const result = refreshStoredEventClassifications();
    const event = db.prepare("SELECT is_bot, bot_reason, is_page_view FROM visitor_events WHERE source_file_id = 'reclassify'").get();
    assert.ok(result.scanned > 0);
    assert.equal(event.is_bot, 1);
    assert.equal(event.bot_reason, 'bot user agent');
    assert.equal(event.is_page_view, 1);
});

test('ranks Libi products and collections from canonical candidate page views', () => {
    const app = db.prepare('SELECT id FROM apps WHERE name = ?').get('Libi Diamonds');
    const insert = db.prepare(`INSERT INTO visitor_events (
        app_id, source_file_id, source_offset, occurred_at, ip, method, path,
        status, user_agent, is_bot, is_page_view
    ) VALUES (?, 'jewelry-test', ?, ?, ?, 'GET', ?, 200, 'Mozilla/5.0', ?, ?)`);
    const rows = [
        [1, '2026-08-02T09:00:00.000Z', '1.1.1.1', '/product/aura-solitaire-ring', 0, 1],
        [2, '2026-08-02T09:05:00.000Z', '1.1.1.1', '/product/aura-solitaire-ring?metal=white', 0, 1],
        [3, '2026-08-03T10:00:00.000Z', '2.2.2.2', '/product/aria-oval-studs/', 0, 1],
        [4, '2026-08-03T10:01:00.000Z', '3.3.3.3', '/jewelry/rings', 0, 1],
        [5, '2026-07-28T10:00:00.000Z', '4.4.4.4', '/product/aura-solitaire-ring', 0, 1],
        [6, '2026-08-03T10:02:00.000Z', '5.5.5.5', '/product/aura-solitaire-ring', 1, 1],
        [7, '2026-08-03T10:03:00.000Z', '6.6.6.6', '/product/aura-solitaire-ring', 0, 0]
    ];
    rows.forEach((row) => insert.run(app.id, ...row));

    const interest = getLibiJewelryInterest(db, app.id, {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-08T00:00:00.000Z'
    });
    assert.equal(interest.summary.product_page_views, 3);
    assert.equal(interest.summary.unique_product_candidates, 2);
    assert.equal(interest.summary.products_viewed, 2);
    assert.equal(interest.products[0].slug, 'aura-solitaire-ring');
    assert.equal(interest.products[0].page_views, 2);
    assert.equal(interest.products[0].unique_candidates, 1);
    assert.equal(interest.products[0].previous_page_views, 1);
    assert.equal(interest.collections[0].category, 'rings');
    assert.equal(interest.collections[0].page_views, 1);
    assert.equal(inferCategory('aria-oval-studs'), 'earrings');
    assert.equal(humanizeSlug('new-diamond-pendant'), 'New Diamond Pendant');
});
