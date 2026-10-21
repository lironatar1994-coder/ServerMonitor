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
    db.prepare("UPDATE apps SET name = 'Maavar' WHERE name = 'Alenu CRM'").run();
    const event = db.prepare(`INSERT INTO visitor_events (app_id, source_file_id, source_offset, occurred_at, ip, path, is_page_view)
        VALUES (?, 'f', ?, '2026-10-01T00:00:00Z', '1.1.1.1', ?, 1)`);
    const signal = db.prepare(`INSERT INTO browser_signals (app_id, event_id, occurred_at, ip, visitor_hash, session_hash, path)
        VALUES (?, ?, '2026-10-01T00:00:00Z', '1.1.1.1', 'v', 's', ?)`);
    ['/', '/work/koral/', '/cv/', '/cv-manager/login', '/videos/p/1', '/alenu', '/curriculum'].forEach((item, index) => {
        event.run(laWebs, index, item);
        signal.run(laWebs, `e${index}`, item);
    });
    event.run(pdf, 99, '/pdf-studio/');
    db.close();
    delete require.cache[databasePath];

    db = require('../database');
    const kept = (table) => db.prepare(`SELECT path FROM ${table} WHERE app_id = ? ORDER BY path`).all(laWebs).map((row) => row.path);
    assert.deepEqual(kept('visitor_events'), ['/', '/curriculum', '/work/koral/']);
    assert.deepEqual(kept('browser_signals'), ['/', '/curriculum', '/work/koral/']);
    assert.equal(db.prepare("SELECT name FROM apps WHERE id = (SELECT MAX(id) FROM apps WHERE name = 'Alenu CRM')").get().name, 'Alenu CRM');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM apps WHERE name IN ('Maavar', 'Libi Diamonds')").get().n, 0);
    assert.equal(db.prepare("SELECT url FROM apps WHERE name = 'PDF Studio'").get().url, 'https://lawebs.co.il/pdf-studio/');
    db.close();
});
