const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-catalog-'));
process.env.MONITOR_DB_PATH = path.join(temp, 'test.db');
process.env.NODE_ENV = 'test';
const databasePath = require.resolve('../database');

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('narrowed LA webs ownership removes only sibling-app records and keeps its history', () => {
    let db = require('../database');
    const laWebs = db.prepare("SELECT id FROM apps WHERE name = 'LA webs'").get().id;
    const pdf = db.prepare("SELECT id FROM apps WHERE name = 'PDF Studio'").get().id;
    db.prepare("UPDATE apps SET log_exclude = '/seder|/Koralevents|/koralevents|/Koralevents2|/PinhasRatzon|/pinhasratzon' WHERE id = ?").run(laWebs);
    const event = db.prepare(`INSERT INTO visitor_events (app_id, source_file_id, source_offset, occurred_at, ip, path, is_page_view)
        VALUES (?, 'f', ?, '2026-10-01T00:00:00Z', '1.1.1.1', ?, 1)`);
    const signal = db.prepare(`INSERT INTO browser_signals (app_id, event_id, occurred_at, ip, visitor_hash, session_hash, path)
        VALUES (?, ?, '2026-10-01T00:00:00Z', '1.1.1.1', 'v', 's', ?)`);
    const vitals = db.prepare(`INSERT INTO web_vitals (app_id, event_id, occurred_at, path) VALUES (?, ?, '2026-10-01T00:00:00Z', ?)`);
    const error = db.prepare(`INSERT INTO js_errors (app_id, day, path, signature, name, message, first_seen, last_seen)
        VALUES (?, '2026-10-01', ?, 's', 'Error', 'm', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`);
    const product = db.prepare(`INSERT INTO product_events (app_id, event_id, visitor_hash, session_hash, path, event_type, label)
        VALUES (?, ?, 'v', 's', ?, 'tool_opened', 'tool')`);
    ['/', '/work/koral/', '/cv/', '/cv-manager/login', '/videos/p/1', '/alenu', '/curriculum', '/bestpresent', '/bestpresent/noa', '/bestpresents'].forEach((item, index) => {
        event.run(laWebs, index, item);
        signal.run(laWebs, `e${index}`, item);
        product.run(laWebs, `e${index}`, item);
        vitals.run(laWebs, `e${index}`, item);
        error.run(laWebs, item);
    });
    event.run(pdf, 99, '/pdf-studio/');
    db.close();
    delete require.cache[databasePath];

    db = require('../database');
    const kept = (table) => db.prepare(`SELECT path FROM ${table} WHERE app_id = ? ORDER BY path`).all(laWebs).map((row) => row.path);
    for (const table of ['visitor_events', 'browser_signals', 'product_events', 'web_vitals', 'js_errors']) {
        assert.deepEqual(kept(table), ['/', '/bestpresents', '/curriculum', '/work/koral/'], table);
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM apps WHERE name IN ('Maavar', 'Alenu CRM', 'Alenu CRM · עיבוד מסמכים', 'Libi Diamonds')").get().n, 0);
    assert.equal(db.prepare("SELECT url FROM apps WHERE name = 'PDF Studio'").get().url, 'https://lawebs.co.il/pdf-studio/');
    db.close();
    delete require.cache[databasePath];
});

test('a page that leaves a site leaves no address there: not as a referrer, not in a notice', () => {
    let db = require('../database');
    const laWebs = db.prepare("SELECT id FROM apps WHERE name = 'LA webs'").get().id;
    db.prepare("UPDATE apps SET log_exclude = replace(log_exclude, '|/bestpresent', '') WHERE id = ?").run(laWebs);
    const request = db.prepare(`INSERT INTO visitor_events (app_id, source_file_id, source_offset, occurred_at, ip, path, referrer, is_page_view)
        VALUES (?, 'referrers', ?, '2026-10-01T00:00:00Z', '1.1.1.1', ?, ?, ?)`);
    const gone = ['https://lawebs.co.il/bestpresent', 'https://lawebs.co.il/bestpresent/noa', 'https://www.lawebs.co.il/bestpresent/noa?x=1', 'http://lawebs.co.il/bestpresent/g/token#k'];
    const kept = ['https://lawebs.co.il/', 'https://lawebs.co.il/bestpresents', 'https://lawebs.co.il/cv/', 'https://google.com/bestpresent/noa', 'android-app://lawebs', 'not an address', null];
    request.run(laWebs, 0, '/', gone[1], 1);
    [...gone, ...kept].forEach((referrer, index) => request.run(laWebs, index + 1, '/.well-known/vee-visitor-signal', referrer, 0));
    const notice = db.prepare(`INSERT INTO insight_notifications (key, category, app_id, title, body, url, created_at) VALUES (?, 'pages', ?, 't', 'b', 'u', '2026-10-01T00:00:00Z')`);
    const device = db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (1, 'e', 'p', 'a', '2026-10-01T00:00:00Z')`).run().lastInsertRowid;
    const delivery = db.prepare("INSERT INTO push_deliveries (subscription_id, category, notification_key, sent_at) VALUES (?, 'pages', ?, '2026-10-01T00:00:00Z')");
    const left = [`page:${laWebs}:/bestpresent/noa`, `404:${laWebs}:/bestpresent:2026-10-01`, `404:${laWebs}:/bestpresent/g/a:b:2026-10-01`];
    const others = [`404:${laWebs}:/old:2026-10-01`, `page:${laWebs}9:/bestpresent/noa`, `page:${laWebs}:/bestpresents`, 'digest:2026-10-01'];
    [...left, ...others].forEach((key) => { notice.run(key, laWebs); delivery.run(device, key); });
    db.close();
    delete require.cache[databasePath];

    db = require('../database');
    const rows = db.prepare("SELECT path, referrer FROM visitor_events WHERE source_file_id = 'referrers' ORDER BY source_offset").all();
    assert.equal(rows[0].path, '/');
    assert.deepEqual(rows.map((row) => row.referrer), [null, ...gone.map(() => null), ...kept]);
    assert.deepEqual(db.prepare('SELECT key FROM insight_notifications ORDER BY key').pluck().all(), [...others].sort());
    assert.deepEqual(db.prepare('SELECT notification_key FROM push_deliveries ORDER BY notification_key').pluck().all(), [...others].sort());
    db.close();
    delete require.cache[databasePath];
});

test('a site that moves to its own domain keeps its history and ingestion position', () => {
    let db = require('../database');
    const alenu = db.prepare("SELECT id FROM apps WHERE name = 'Alenu'").get().id;
    db.prepare(`UPDATE apps SET url = 'https://lawebs.co.il/alenu/', health_url = 'https://lawebs.co.il/alenu/',
        log_host = 'lawebs.co.il|www.lawebs.co.il', log_filter = '/alenu', log_exclude = NULL WHERE id = ?`).run(alenu);
    const event = db.prepare(`INSERT INTO visitor_events (app_id, source_file_id, source_offset, occurred_at, ip, path, is_page_view)
        VALUES (?, 'moved', ?, '2026-10-01T00:00:00Z', '1.1.1.1', ?, 1)`);
    ['/alenu', '/alenu/', '/alenu/start.html', '/alenu-other'].forEach((item, index) => event.run(alenu, index, item));
    db.prepare(`INSERT INTO tracked_links (app_id, host, code, channel, path, created_at) VALUES (?, 'lawebs.co.il', 'moved-link', 'whatsapp', '/alenu/', '2026-10-01T00:00:00Z')`).run(alenu);
    db.prepare(`INSERT INTO visitor_ingestion_state (app_id, log_path, byte_offset) VALUES (?, 'log', 500)
        ON CONFLICT DO UPDATE SET byte_offset = 500`).run(alenu);
    db.close();
    delete require.cache[databasePath];

    db = require('../database');
    const row = db.prepare('SELECT * FROM apps WHERE id = ?').get(alenu);
    assert.equal(row.url, 'https://alenu.co.il/');
    assert.equal(row.log_host, 'alenu.co.il|www.alenu.co.il');
    assert.equal(row.log_filter, null);
    const paths = db.prepare("SELECT path FROM visitor_events WHERE app_id = ? AND source_file_id = 'moved' ORDER BY source_offset").all(alenu).map((item) => item.path);
    assert.deepEqual(paths, ['/', '/', '/start.html', '/alenu-other']);
    assert.equal(db.prepare('SELECT path FROM tracked_links WHERE code = ?').get('moved-link').path, '/alenu/');
    assert.equal(db.prepare('SELECT byte_offset FROM visitor_ingestion_state WHERE app_id = ?').get(alenu).byte_offset, 500);
    db.close();
    delete require.cache[databasePath];

    db = require('../database');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM visitor_events WHERE source_file_id = 'moved'").get().n, 4);
    db.close();
});

test('Alenu Miluim takes its stored pages from Alenu and both keep their own history', () => {
    delete require.cache[databasePath];
    let db = require('../database');
    const alenu = db.prepare("SELECT id FROM apps WHERE name = 'Alenu'").get().id;
    // Recreate the state before the split: one Alenu site that owned every path.
    db.prepare("DELETE FROM apps WHERE name = 'Alenu Miluim'").run();
    db.prepare("UPDATE apps SET log_exclude = '/desk' WHERE id = ?").run(alenu);
    const event = db.prepare(`INSERT INTO visitor_events (app_id, source_file_id, source_offset, occurred_at, ip, path, is_page_view)
        VALUES (?, 'alenu-log', ?, '2026-11-01T00:00:00Z', '1.1.1.1', ?, 1)`);
    const signal = db.prepare(`INSERT INTO browser_signals (app_id, event_id, occurred_at, ip, visitor_hash, session_hash, path)
        VALUES (?, ?, '2026-11-01T00:00:00Z', '1.1.1.1', 'v', 's', ?)`);
    ['/', '/start', '/miluim', '/miluim.html', '/miluim-guide', '/privacy.html'].forEach((item, index) => {
        event.run(alenu, 500 + index, item);
        signal.run(alenu, `alenu-${index}`, item);
    });
    db.close();
    delete require.cache[databasePath];

    db = require('../database');
    const miluim = db.prepare("SELECT * FROM apps WHERE name = 'Alenu Miluim'").get();
    assert.equal(miluim.log_filter, '/miluim*');
    assert.equal(db.prepare("SELECT log_exclude FROM apps WHERE id = ?").get(alenu).log_exclude, '/desk|/miluim*');
    const marker = { visitor_events: "source_file_id = 'alenu-log'", browser_signals: "event_id LIKE 'alenu-%'" };
    const paths = (table, id) => db.prepare(`SELECT path FROM ${table} WHERE app_id = ? AND ${marker[table]} ORDER BY path`).all(id).map((row) => row.path);
    assert.deepEqual(paths('visitor_events', alenu), ['/', '/privacy.html', '/start']);
    assert.deepEqual(paths('visitor_events', miluim.id), ['/miluim', '/miluim-guide', '/miluim.html']);
    assert.deepEqual(paths('browser_signals', miluim.id), ['/miluim', '/miluim-guide', '/miluim.html']);
    db.close();
    delete require.cache[databasePath];
});
