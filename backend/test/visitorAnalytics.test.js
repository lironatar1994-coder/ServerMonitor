const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-monitor-analytics-'));
process.env.NODE_ENV = 'test';
process.env.MONITOR_DB_PATH = path.join(tempDir, 'test.db');
process.env.GEOIP_DB_PATH = path.join(tempDir, 'missing.mmdb');
process.env.VISITOR_SIGNAL_KEY = 'test-visitor-signal-key';

const db = require('../database');
const {
    getBotClassification,
    getBotReason,
    isPageView,
    isTargetAppLine,
    parseAccessLogTimestamp,
    parseNginxAccessLine
} = require('../logParser');
const { ingestApp, purgeExpiredEvents, refreshStoredEventClassifications } = require('../visitorAnalytics');
const { findSignalApp, isAuthorizedSignal, recordBrowserSignal } = require('../browserSignals');
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

test('keeps the Manager Site Miryam URL mapped to the preview monitor', () => {
    const app = db.prepare('SELECT url, health_url, reporting_enabled FROM apps WHERE name = ?')
        .get('Miryam Zelig Preview');
    assert.equal(app.url, 'https://vee-app.co.il/Miryam_Zelig/');
    assert.equal(app.health_url, 'https://vee-app.co.il/miryamzelig2/');
    assert.equal(app.reporting_enabled, 0);
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
    assert.equal(getBotReason({ userAgent: 'Mozilla/5.0 (compatible; Odin; https://docs.getodin.com/)', path: '/', method: 'GET' }), 'bot user agent');
    assert.equal(getBotReason({ userAgent: 'Mozilla/5.0 (compatible; CyberConvoyScout/1.0)', path: '/', method: 'GET' }), 'bot user agent');
});

test('marks only the observed distributed hosting fingerprints as likely bots', () => {
    const safariAutomation = {
        ip: '43.157.147.3',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
        method: 'GET', path: '/', status: 200
    };
    const likely = getBotClassification(safariAutomation);
    assert.equal(likely.classification, 'likely_bot');
    assert.equal(likely.confidence, 95);
    assert.equal(getBotClassification({ ...safariAutomation, ip: '1.2.3.4' }).classification, 'candidate');
});

test('stores deduplicated first-party browser signals against an exact configured site', () => {
    const payload = {
        event_id: 'event_1234567890abcdef',
        visitor_id: 'visitor_1234567890abcdef',
        session_id: 'session_1234567890abcdef',
        path: '/product/aura-solitaire-ring?metal=white',
        webdriver: false
    };
    assert.equal(isAuthorizedSignal('test-visitor-signal-key'), true);
    assert.equal(isAuthorizedSignal('wrong-key'), false);
    const siteUrl = 'https://www.libidiamonds.co.il/';
    assert.equal(findSignalApp(siteUrl).name, 'Libi Diamonds');
    assert.equal(findSignalApp('https://unknown.example/'), null);
    assert.deepEqual(recordBrowserSignal({ body: payload, ip: '1.2.3.4', userAgent: 'Mozilla/5.0', siteUrl }), {
        accepted: true, duplicate: false, app: 'Libi Diamonds'
    });
    assert.deepEqual(recordBrowserSignal({ body: payload, ip: '1.2.3.4', userAgent: 'Mozilla/5.0', siteUrl }), {
        accepted: true, duplicate: true, app: 'Libi Diamonds'
    });
    const stored = db.prepare(`
        SELECT event_id, ip, visitor_hash, session_hash, path, automation_hint
        FROM browser_signals WHERE event_id = ?
    `).get(payload.event_id);
    assert.equal(stored.ip, '1.2.3.4');
    assert.notEqual(stored.visitor_hash, payload.visitor_id);
    assert.notEqual(stored.session_hash, payload.session_id);
    assert.equal(stored.path, '/product/aura-solitaire-ring');
    assert.equal(stored.automation_hint, 0);
    assert.throws(
        () => recordBrowserSignal({ body: { ...payload, event_id: 'event_unknown_12345678' }, ip: '1.2.3.4', userAgent: 'Mozilla/5.0', siteUrl: 'https://unknown.example/' }),
        /not configured/
    );
});

test('resolves every supported public site for first-party browser signals', () => {
    const canonicalSites = new Map([
        ['https://vee-app.co.il/', 'Vee Main App'],
        ['https://vee-app.co.il/pdf-studio/', 'PDF Studio'],
        ['https://sosbaderech.co.il/', 'SOS Landing'],
        ['https://miryamzelig.co.il/', 'Miryam Zelig'],
        ['https://www.libidiamonds.co.il/', 'Libi Diamonds'],
        ['https://vee-app.co.il/OnYourWay', 'On Your Way'],
        ['https://www.dfusreuven.co.il/', 'Dfus Reuven']
    ]);
    canonicalSites.forEach((name, url) => assert.equal(findSignalApp(url)?.name, name));
    assert.equal(findSignalApp('https://vee-app.co.il/text-to-pdf'), null);
    assert.equal(findSignalApp('https://vee-app.co.il/pixel-dungeon/'), null);
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
    db.prepare(`INSERT INTO visitor_events (
        app_id, source_file_id, source_offset, occurred_at, ip, method, path,
        status, user_agent, is_bot, bot_reason, is_page_view
    ) VALUES (?, 'preserve-bot', 1002, '2026-07-12T10:01:00.000Z', '8.8.4.4', 'GET', '/', 200, 'Mozilla/5.0', 1, 'attack signature', 1)`).run(app.id);
    const result = refreshStoredEventClassifications();
    const event = db.prepare("SELECT is_bot, bot_reason, bot_classification, bot_confidence, is_page_view FROM visitor_events WHERE source_file_id = 'reclassify'").get();
    assert.ok(result.scanned > 0);
    assert.equal(event.is_bot, 1);
    assert.equal(event.bot_reason, 'bot user agent');
    assert.equal(event.bot_classification, 'bot');
    assert.equal(event.bot_confidence, 100);
    assert.equal(event.is_page_view, 1);
    const preserved = db.prepare("SELECT is_bot, bot_reason, bot_classification FROM visitor_events WHERE source_file_id = 'preserve-bot'").get();
    assert.deepEqual(preserved, { is_bot: 1, bot_reason: 'attack signature', bot_classification: 'bot' });
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
