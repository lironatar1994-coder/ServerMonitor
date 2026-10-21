const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-internal-'));
process.env.MONITOR_DB_PATH = path.join(temp, 'test.db');
process.env.NODE_ENV = 'test';
process.env.VISITOR_SIGNAL_KEY = 'internal-signal-test-key';
const express = require('express');
const db = require('../database');
const router = require('../routes/browserSignals');

let server, base;
test.before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/signals', router);
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/signals/site`;
});
test.after(() => { server.close(); db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

const send = (id, cookie) => fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Visitor-Signal-Key': 'internal-signal-test-key', 'X-Visitor-Site-Url': 'https://www.dfusreuven.co.il/',
        'X-Visitor-IP': '1.2.3.4', 'X-Visitor-User-Agent': 'Mozilla/5.0', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ event_id: `event_${id}_1234567890ab`, visitor_id: 'visitor_1234567890abcd', session_id: 'session_1234567890abcd', path: '/' })
});

test('a browser marked internal is dropped before any signal is stored', async () => {
    const stored = (id) => db.prepare('SELECT COUNT(*) AS n FROM browser_signals WHERE event_id = ?').get(`event_${id}_1234567890ab`).n;
    const internal = await send('internal', 'theme=dark; monitor_internal=1');
    assert.equal(internal.status, 202);
    assert.equal(stored('internal'), 0);
    assert.equal((await send('cleared', 'monitor_internal=0')).status, 201);
    assert.equal(stored('cleared'), 1);
    assert.equal((await send('lookalike', 'not_monitor_internal=1')).status, 201);
});
