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
        'X-Visitor-IP': '1.2.3.4', 'X-Visitor-User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ event_id: `event_${id}_1234567890ab`, visitor_id: 'visitor_1234567890abcd', session_id: 'session_1234567890abcd', path: '/' })
});

test('a page its site excludes is accepted and nothing of it is kept, whatever the kind of post', async () => {
    const stored = () => ['browser_signals', 'growth_events', 'engagement_signals', 'engagement_zone_views', 'product_events', 'web_vitals', 'js_errors', 'browser_interactions']
        .reduce((sum, table) => sum + db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
    const kinds = [{}, { kind: 'growth', event_type: 'page_view' }, { kind: 'engagement', scroll_depth: 50, views: [{ zone: 'hero', views: 1, dwell_ms: 500 }] },
        { kind: 'product', event_type: 'tool_opened', label: 'tool' }, { kind: 'vitals', lcp: 900 }, { kind: 'error', name: 'TypeError', message: 'x is not a function' },
        { kind: 'interaction' }, { kind: 'anything' }];
    let count = 0;
    const post = (kind, page) => fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Visitor-Signal-Key': 'internal-signal-test-key', 'X-Visitor-Site-Url': 'https://lawebs.co.il/',
            'X-Visitor-IP': '1.2.3.4', 'X-Visitor-User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' },
        body: JSON.stringify({ event_id: `event_page_${++count}_1234567890`, visitor_id: 'visitor_1234567890abcd', session_id: 'session_1234567890abcd', path: page, ...kind })
    });
    const before = stored();
    for (const kind of kinds) for (const page of ['/bestpresent', '/bestpresent/noa-30?x=1', '//bestpresent/noa-30', '/cv/']) {
        const answer = await post(kind, page);
        assert.equal(answer.status, 202);
        assert.deepEqual(await answer.json(), { accepted: false, excluded: true });
    }
    assert.equal(stored(), before);
    for (const kind of kinds) for (const page of ['/', '/work/koral/', '/bestpresents']) assert.equal((await post(kind, page)).status, 201, `${kind.kind} ${page}`);
    assert.ok(stored() > before);
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
