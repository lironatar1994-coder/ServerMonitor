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
const {
    findSignalApp,
    isAuthorizedSignal,
    recordBrowserSignal,
    recordEngagementSignal,
    recordProductEvent,
    validateProductEventBody
} = require('../browserSignals');
const { getEngagement } = require('../routes/visitorAnalytics');

const humanLine = '1.2.3.4 - - [12/Jul/2026:12:00:00 +0300] "GET /site/ HTTP/1.1" 200 120 "https://google.com" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"';
const botLine = '5.6.7.8 - - [12/Jul/2026:12:01:00 +0300] "GET /site/wp-login.php HTTP/1.1" 404 12 "-" "curl/8.1"';
const secondHumanLine = '1.2.3.4 - - [12/Jul/2026:12:02:00 +0300] "GET /site/about HTTP/1.1" 200 100 "-" "Mozilla/5.0 (Windows NT 10.0)"';
const hostAwareLine = '1.2.3.4 - - [12/Jul/2026:12:03:00 +0300] "GET / HTTP/1.1" 200 100 "-" "Mozilla/5.0 (Windows NT 10.0)" "sosbaderech.co.il"';

function withRecentTimestamp(line, minutesAgo = 0) {
    const date = new Date(Date.now() - minutesAgo * 60 * 1000);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (value) => String(value).padStart(2, '0');
    const timestamp = `${pad(date.getUTCDate())}/${months[date.getUTCMonth()]}/${date.getUTCFullYear()}:${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
    return line.replace(/\[[^\]]+\]/, `[${timestamp}]`);
}

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

test('retires removed production apps and seeds the new lawebs.co.il applications', () => {
    for (const name of ['Libi Diamonds', 'Libi Diamonds Preview', 'Dfus Reuven Preview', 'WhatsApp Worker', 'Vee Main App', 'Maavar']) {
        assert.equal(db.prepare('SELECT id FROM apps WHERE name = ?').get(name), undefined, name);
    }
    const app = (name) => db.prepare('SELECT * FROM apps WHERE name = ?').get(name);
    assert.equal(app('Vee Landing').pm2_name, null);
    assert.equal(app('Alenu CRM').systemd_unit, 'maavar.service');
    for (const [name, unit] of [['AllSee', 'allsee.service'], ['CV Manager', 'cv-manager.service'], ['Desk', 'desk.service'], ['Pizza Manager', 'pizza-manager-platform.service']]) {
        assert.equal(app(name).systemd_unit, unit, name);
    }
    for (const [name, process] of [['Video Library', 'video-library-api'], ['Claude RC', 'claude-rc']]) assert.equal(app(name).pm2_name, process, name);
    for (const name of ['Alenu', 'Mila Tova CV', 'Pizza Manager']) assert.equal(app(name).analytics_enabled, 1, name);
    for (const name of ['Desk', 'AllSee', 'Video Library', 'Claude RC', 'CV Manager', 'Alenu CRM']) assert.equal(app(name).analytics_enabled, 0, name);
});

test('seeds Seder with exact host, path, runtime, and client reporting ownership', () => {
    const app = db.prepare(`
        SELECT name, url, pm2_name, log_path, log_host, log_filter,
               health_url, analytics_enabled, reporting_enabled
        FROM apps WHERE name = ?
    `).get('Seder');
    assert.deepEqual(app, {
        name: 'Seder',
        url: 'https://lawebs.co.il/seder',
        pm2_name: 'seder-live',
        log_path: '/var/log/nginx/monitor_host_access.log',
        log_host: 'lawebs.co.il|www.lawebs.co.il',
        log_filter: '/seder',
        health_url: 'http://127.0.0.1:3107/seder',
        analytics_enabled: 1,
        reporting_enabled: 1
    });
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
    const siteUrl = 'https://www.dfusreuven.co.il/';
    assert.equal(findSignalApp(siteUrl).name, 'Dfus Reuven');
    assert.equal(findSignalApp('https://unknown.example/'), null);
    assert.deepEqual(recordBrowserSignal({ body: payload, ip: '1.2.3.4', userAgent: 'Mozilla/5.0', siteUrl }), {
        accepted: true, duplicate: false, app: 'Dfus Reuven'
    });
    assert.deepEqual(recordBrowserSignal({ body: payload, ip: '1.2.3.4', userAgent: 'Mozilla/5.0', siteUrl }), {
        accepted: true, duplicate: true, app: 'Dfus Reuven'
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

test('stores privacy-safe PDF Studio product, visibility, and heatmap events while filtering automation', () => {
    const siteUrl = 'https://lawebs.co.il/pdf-studio/';
    const common = {
        visitor_id: 'visitor_product_1234567890',
        session_id: 'session_product_1234567890',
        path: '/pdf-studio/pdf-editor',
        webdriver: false
    };
    assert.deepEqual(recordEngagementSignal({
        body: {
            ...common,
            kind: 'engagement',
            event_id: 'engagement_1234567890abc',
            scroll_depth: 75,
            dwell_ms: 45000,
            viewport_width: 1440,
            viewport_class: 'desktop',
            zones: [{ zone: 'editor-save', taps: 2 }],
            views: [{ zone: 'editor-canvas', views: 1, dwell_ms: 32000 }],
            heatmap: [{ x: 8, y: 3, taps: 2 }]
        },
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        siteUrl
    }), { accepted: true, duplicate: false, app: 'PDF Studio' });

    recordProductEvent({
        body: {
            ...common,
            kind: 'product',
            event_id: 'product_1234567890abcdef',
            event_type: 'editor_saved',
            label: 'editor',
            value: 2048
        },
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        siteUrl
    });
    recordProductEvent({
        body: {
            ...common,
            event_id: 'product_bot_1234567890abc',
            event_type: 'tool_opened',
            label: 'merge'
        },
        ip: '5.6.7.8',
        userAgent: 'curl/8.1',
        siteUrl
    });

    const app = db.prepare('SELECT id FROM apps WHERE name = ?').get('PDF Studio');
    assert.deepEqual(db.prepare('SELECT zone, taps FROM engagement_zones WHERE app_id = ?').get(app.id), { zone: 'editor-save', taps: 2 });
    assert.deepEqual(db.prepare('SELECT zone, views, dwell_ms FROM engagement_zone_views WHERE app_id = ?').get(app.id), { zone: 'editor-canvas', views: 1, dwell_ms: 32000 });
    assert.deepEqual(db.prepare('SELECT viewport_class, cell_x, cell_y, taps FROM engagement_heatmap_cells WHERE app_id = ?').get(app.id), { viewport_class: 'desktop', cell_x: 8, cell_y: 3, taps: 2 });
    assert.deepEqual(db.prepare('SELECT event_type, label, value, automation_hint FROM product_events WHERE event_id = ?').get('product_1234567890abcdef'), { event_type: 'editor_saved', label: 'editor', value: 2048, automation_hint: 0 });
    assert.equal(db.prepare('SELECT automation_hint FROM product_events WHERE event_id = ?').get('product_bot_1234567890abc').automation_hint, 1);
    assert.throws(() => validateProductEventBody({ ...common, event_id: 'invalid_product_123456789', event_type: 'document_content', label: 'private.pdf' }), /Invalid product event/);

    const analytics = getEngagement(
        { id: app.id, name: 'PDF Studio', url: siteUrl },
        { from: new Date(Date.now() - 60000).toISOString(), to: new Date(Date.now() + 60000).toISOString() }
    );
    assert.equal(analytics.product.summary.saves, 1);
    assert.equal(analytics.product.summary.automated_events, 1);
    assert.equal(analytics.heatmaps[0].cells[0].taps, 2);
    assert.equal(analytics.viewed_zones[0].zone, 'editor-canvas');
});

test('resolves every supported public site for first-party browser signals', () => {
    const canonicalSites = new Map([
        ['https://vee-app.co.il/', 'Vee Landing'],
        ['https://lawebs.co.il/pdf-studio/', 'PDF Studio'],
        ['https://sosbaderech.co.il/', 'SOS Landing'],
        ['https://miryamzelig.co.il/', 'Miryam Zelig'],
        ['https://lawebs.co.il/alenu/', 'Alenu'],
        ['https://lawebs.co.il/cv/', 'Mila Tova CV'],
        ['https://lawebs.co.il/seder', 'Seder'],
        ['https://vee-app.co.il/OnYourWay', 'On Your Way'],
        ['https://www.dfusreuven.co.il/', 'Dfus Reuven']
    ]);
    canonicalSites.forEach((name, url) => assert.equal(findSignalApp(url)?.name, name));
    assert.equal(findSignalApp('https://vee-app.co.il/text-to-pdf'), null);
    assert.equal(findSignalApp('https://vee-app.co.il/pixel-dungeon/'), null);
    assert.equal(findSignalApp('https://www.libidiamonds.co.il/'), null);
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

test('excludes nested application APIs, framework images and infrastructure paths from pages', () => {
    const diagnosticPaths = [
        '/PizzaManager/api/public/shops/oven-demo',
        '/seder/_next/image',
        '/.well-known/acme-challenge',
        '/pdf-studio/manifest.webmanifest',
        '/dataimage/svg+xml;base64,PHN2Zw',
        '/miryam/data:image/svg+xml;base64,PHN2Zw'
    ];
    diagnosticPaths.forEach(path => assert.equal(isPageView({ method: 'GET', path, status: 200 }), false, path));
    ['/PizzaManager/oven-demo', '/seder', '/pdf-studio/', '/product/ring', '/jewelry/rings'].forEach(path =>
        assert.equal(isPageView({ method: 'GET', path, status: 200 }), true, path));
});

test('backfills, classifies, deduplicates, and incrementally ingests', () => {
    const logPath = path.join(tempDir, 'access.log');
    fs.writeFileSync(logPath, `${withRecentTimestamp(humanLine, 3)}\n${withRecentTimestamp(botLine, 2)}\n`, 'utf8');
    const appId = db.prepare('INSERT INTO apps (name, log_path, log_filter) VALUES (?, ?, ?)')
        .run('Test Site', logPath, '/site/').lastInsertRowid;
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(appId);

    assert.equal(ingestApp(app), 2);
    assert.equal(ingestApp(app), 0);
    assert.deepEqual(db.prepare('SELECT is_bot, COUNT(*) AS count FROM visitor_events WHERE app_id = ? GROUP BY is_bot ORDER BY is_bot').all(appId), [
        { is_bot: 0, count: 1 }, { is_bot: 1, count: 1 }
    ]);

    fs.appendFileSync(logPath, `${withRecentTimestamp(secondHumanLine, 1)}\n`, 'utf8');
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
    db.prepare(`INSERT INTO visitor_events (
        app_id, source_file_id, source_offset, occurred_at, ip, method, path,
        status, user_agent, is_bot, is_page_view
    ) VALUES (?, 'stale-page-rule', 1003, '2026-07-12T10:02:00.000Z', '8.8.4.4', 'GET', '/seder/_next/image', 200, 'Mozilla/5.0', 0, 1)`).run(app.id);
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
    assert.equal(db.prepare("SELECT is_page_view FROM visitor_events WHERE source_file_id = 'stale-page-rule'").get().is_page_view, 0);
});

test('path segment ownership isolates Koral routes, LA webs and its sibling apps', () => {
    const matches = (name, host, path) => {
        const app = db.prepare('SELECT * FROM apps WHERE name = ?').get(name);
        return isTargetAppLine('', name, app.log_filter, app.log_host, app.log_exclude, { host, path });
    };
    assert.equal(matches('Koral Events', 'lawebs.co.il', '/Koralevents'), true);
    assert.equal(matches('Koral Events', 'lawebs.co.il', '/Koralevents/booking'), true);
    assert.equal(matches('Koral Events', 'lawebs.co.il', '/Koralevents2'), false);
    assert.equal(matches('Koral Events 2', 'lawebs.co.il', '/Koralevents2/booking'), true);
    assert.equal(matches('Koral Events', 'example.com', '/Koralevents'), false);
    assert.equal(matches('LA webs', 'lawebs.co.il', '/seder'), false);
    assert.equal(matches('LA webs', 'lawebs.co.il', '/Koralevents2'), false);
    assert.equal(matches('LA webs', 'lawebs.co.il', '/'), true);
    for (const path of ['/alenu/', '/cv/', '/cv-manager/login', '/desk/', '/allsee/', '/videos/', '/rc/', '/PizzaManager/p/oven-demo/', '/pdf-studio/', '/alenu-crm']) {
        assert.equal(matches('LA webs', 'lawebs.co.il', path), false, path);
    }
    assert.equal(matches('LA webs', 'lawebs.co.il', '/work/koral/'), true);
    assert.equal(matches('Mila Tova CV', 'lawebs.co.il', '/cv/'), true);
    assert.equal(matches('Mila Tova CV', 'lawebs.co.il', '/cv-manager/'), false);
    assert.equal(matches('Alenu', 'lawebs.co.il', '/alenu-crm/'), false);
    assert.equal(matches('Pizza Manager', 'lawebs.co.il', '/PizzaManager/p/oven-demo/'), true);
    assert.equal(matches('Pizza Manager', 'lawebs.co.il', '/PizzaManager/admin/'), false);
    assert.equal(matches('Vee Landing', 'vee-app.co.il', '/maavar/documents'), false);
    assert.equal(matches('Seder', 'lawebs.co.il', '/seder-other'), false);
    assert.equal(db.prepare('SELECT analytics_enabled FROM apps WHERE name = ?').get('Alenu CRM').analytics_enabled, 0);
});


test('restores older rotated and compressed logs once without replaying existing history', () => {
    const { backfillArchivedLogs } = require('../visitorAnalytics');
    const zlib = require('zlib');
    const logPath = path.join(tempDir, 'history.log');
    fs.writeFileSync(logPath, withRecentTimestamp(humanLine, 1) + '\n');
    fs.writeFileSync(logPath + '.1', withRecentTimestamp(secondHumanLine, 2) + '\n');
    fs.writeFileSync(logPath + '.2.gz', zlib.gzipSync(withRecentTimestamp(humanLine, 3) + '\n'));
    const id = db.prepare('INSERT INTO apps (name, log_path, log_filter) VALUES (?, ?, ?)').run('History Site', logPath, '/site/').lastInsertRowid;
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(id);
    assert.equal(ingestApp(app), 1);
    assert.equal(backfillArchivedLogs(app), 2);
    assert.equal(backfillArchivedLogs(app), 0);
    db.prepare("DELETE FROM monitor_metadata WHERE key LIKE ?").run(`archive-backfill-v1:${id}:%`);
    assert.equal(backfillArchivedLogs(app), 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visitor_events WHERE app_id = ?').get(id).n, 3);
});
