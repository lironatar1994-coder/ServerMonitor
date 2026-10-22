const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { checkHttp } = require('../httpHealth');

async function serve(t, handler) {
    const server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => {
        server.closeAllConnections();
        server.close(resolve);
    }));
    return `http://127.0.0.1:${server.address().port}/`;
}

test('healthy and redirect responses succeed on a fresh connection', async (t) => {
    let calls = 0;
    const url = await serve(t, (req, res) => {
        assert.equal(req.headers['user-agent'], 'ServerMonitor-Health/1.0');
        assert.equal(req.headers.connection, 'close');
        res.writeHead(++calls === 1 ? 200 : 302).end();
    });
    for (let i = 0; i < 2; i++) {
        const result = await checkHttp(url);
        assert.equal(result.status, 'online');
        assert.equal(result.attempts, 1);
        assert.ok(result.ms >= 0);
    }
});

test('a transient reset is confirmed by one fresh successful retry', async (t) => {
    let calls = 0;
    const url = await serve(t, (req, res) => {
        if (++calls === 1) req.socket.destroy();
        else res.end('ok');
    });
    const result = await checkHttp(url);
    assert.equal(result.status, 'online');
    assert.equal(result.attempts, 2);
    assert.equal(calls, 2);
});

test('persistent resets stay unavailable after exactly two attempts', async (t) => {
    let calls = 0;
    const url = await serve(t, req => { calls++; req.socket.destroy(); });
    const result = await checkHttp(url);
    assert.equal(result.status, 'offline');
    assert.equal(result.error, 'ECONNRESET');
    assert.equal(result.ms, null);
    assert.equal(calls, 2);
});

test('recovery after a timeout includes the failed attempt in latency', async (t) => {
    let calls = 0;
    const url = await serve(t, (req, res) => {
        if (++calls === 2) res.end('ok');
    });
    const result = await checkHttp(url, 100);
    assert.equal(result.status, 'online');
    assert.equal(result.attempts, 2);
    assert.ok(result.ms >= 100);
});

test('health finishes at the response headers even if the body never ends', async (t) => {
    const url = await serve(t, (req, res) => { res.writeHead(200); res.flushHeaders(); });
    assert.equal((await checkHttp(url, 100)).status, 'online');
});

test('HTTP failures remain errors without a transport retry', async (t) => {
    let calls = 0;
    const url = await serve(t, (req, res) => { calls++; res.writeHead(503).end(); });
    const result = await checkHttp(url);
    assert.equal(result.status, 'error');
    assert.equal(result.error, 'HTTP_503');
    assert.equal(calls, 1);
});

test('a hanging response has a bounded deadline and remains unavailable', async (t) => {
    let calls = 0;
    const url = await serve(t, () => { calls++; });
    const started = Date.now();
    const result = await checkHttp(url, 80);
    assert.equal(result.status, 'offline');
    assert.equal(result.error, 'ETIMEDOUT');
    assert.equal(calls, 2);
    assert.ok(Date.now() - started < 1500);
});

test('invalid and unsupported URLs fail without a network request', async () => {
    for (const url of ['invalid', 'ftp://127.0.0.1/']) {
        assert.deepEqual(await checkHttp(url), { status: 'error', ms: null, error: 'INVALID_URL', attempts: 0 });
    }
});
