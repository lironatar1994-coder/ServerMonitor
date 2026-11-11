const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-internal-'));
process.env.MONITOR_DB_PATH = path.join(temp, 'test.db');
process.env.NODE_ENV = 'test';
const db = require('../database');
const internal = require('../internalNetworks');
const { getAutomationHint } = require('../browserSignals');

test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('IPv4 matches exactly and IPv6 by its /64 network', () => {
    assert.equal(internal.networkKey('::ffff:85.65.228.217'), '85.65.228.217');
    assert.equal(internal.networkKey('2a00:a041:1:2:aaaa::1'), internal.networkKey('2a00:a041:0001:0002:bbbb:cccc:dddd:eeee'));
    assert.notEqual(internal.networkKey('2a00:a041:1:3::1'), internal.networkKey('2a00:a041:1:2::1'));
    assert.equal(internal.networkKey('not an ip'), '');
});

test('visits from a PC agent network are kept but no longer counted, including earlier ones', () => {
    internal.resetInternalCacheForTests();
    const app = db.prepare("SELECT id FROM apps WHERE name = 'Alenu'").get().id;
    const recent = new Date(Date.now() - 3 * 86400000).toISOString();
    const signal = db.prepare(`INSERT INTO browser_signals (app_id, event_id, occurred_at, ip, visitor_hash, session_hash, path, automation_hint)
        VALUES (?, ?, ?, ?, 'v', ?, '/', 0)`);
    signal.run(app, 'own-1', recent, '85.65.228.217', 'own-session');
    signal.run(app, 'other-1', recent, '5.29.1.1', 'other-session');
    db.prepare(`INSERT INTO engagement_signals (app_id, event_id, occurred_at, session_hash, path, scroll_depth, dwell_ms, automation_hint)
        VALUES (?, 'own-engagement', ?, 'own-session', '/', 80, 40000, 0)`).run(app, recent);
    db.prepare(`INSERT INTO visitor_events (app_id, source_file_id, source_offset, occurred_at, ip, path, is_page_view, is_bot)
        VALUES (?, 'internal-log', 1, ?, '85.65.228.217', '/', 1, 0)`).run(app, recent);

    // Private addresses are never a "network" to exclude.
    internal.noteAgentAddress(db, '192.168.1.20', 'PC');
    assert.equal(internal.listInternalNetworks(db).length, 0);
    internal.noteAgentAddress(db, '::ffff:85.65.228.217', 'DESKTOP-2V68S5E');
    assert.equal(internal.isInternalAddress(db, '85.65.228.217'), true);
    assert.equal(getAutomationHint({ body: {}, ip: '85.65.228.217', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', path: '/' }), 3);

    assert.ok(internal.markPastInternalVisits(db) >= 2);
    const hint = (id) => db.prepare('SELECT automation_hint FROM browser_signals WHERE event_id = ?').get(id).automation_hint;
    assert.equal(hint('own-1'), 3);
    assert.equal(hint('other-1'), 0);
    assert.equal(db.prepare("SELECT automation_hint FROM engagement_signals WHERE event_id = 'own-engagement'").get().automation_hint, 3);
    assert.deepEqual(db.prepare("SELECT is_bot, bot_classification FROM visitor_events WHERE source_file_id = 'internal-log'").get(),
        { is_bot: 1, bot_classification: 'internal' });
    // A second pass has nothing new to mark.
    assert.equal(internal.markPastInternalVisits(db), 0);
});
