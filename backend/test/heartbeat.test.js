const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-heartbeat-'));
process.env.MONITOR_DB_PATH = path.join(temp, 'test.db');
process.env.NODE_ENV = 'test';
process.env.HEARTBEAT_URL_FILE = path.join(temp, 'missing');
const db = require('../database');
const { sendHeartbeat, heartbeatStatus } = require('../heartbeat');

test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('pings only an https URL, reports failures to /fail and never stores the URL', async () => {
    const calls = [];
    const realFetch = global.fetch;
    global.fetch = async (url, options = {}) => { calls.push({ url: String(url), method: options.method || 'GET', body: options.body }); return { ok: calls.length < 3, status: 503 }; };
    try {
        assert.deepEqual(await sendHeartbeat(db), { configured: false });
        process.env.HEARTBEAT_URL = 'http://hc-ping.com/secret-id';
        assert.deepEqual(await sendHeartbeat(db), { configured: false });
        process.env.HEARTBEAT_URL = 'https://hc-ping.com/secret-id';
        assert.equal((await sendHeartbeat(db)).ok, true);
        assert.ok(heartbeatStatus(db).at);
        assert.equal((await sendHeartbeat(db, 'Monitor cycle error: boom')).ok, true);
        assert.deepEqual(calls[1], { url: 'https://hc-ping.com/secret-id/fail', method: 'POST', body: 'Monitor cycle error: boom' });
        assert.equal((await sendHeartbeat(db)).ok, false);
        assert.equal(heartbeatStatus(db).error, 'HTTP 503');
        const stored = db.prepare("SELECT group_concat(value) AS v FROM monitor_metadata WHERE key LIKE 'heartbeat%'").get().v;
        assert.doesNotMatch(stored, /secret-id/);
    } finally {
        global.fetch = realFetch;
        delete process.env.HEARTBEAT_URL;
    }
});

test('the public cycle answer reveals only freshness', () => {
    const { cycleHandler } = require('../heartbeat');
    const answer = () => { const res = { headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, type() { return this; }, send(b) { this.body = b; return this; } }; cycleHandler(db)({ get: () => 'ServerMonitor-Watchdog/1.0' }, res); return res; };
    const set = (value) => db.prepare("INSERT INTO monitor_metadata (key, value) VALUES ('monitor-cycle-at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(value));
    set(Date.now() - 5 * 60000);
    assert.deepEqual([answer().code, answer().body, answer().headers['Cache-Control']], [200, 'ok', 'no-store']);
    set(Date.now() - 30 * 60000);
    assert.deepEqual([answer().code, answer().body], [503, 'stale']);
    assert.ok(heartbeatStatus(db).watchdogAt);
});
