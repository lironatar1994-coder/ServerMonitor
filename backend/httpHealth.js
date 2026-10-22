const http = require('node:http');
const https = require('node:https');

function probe(url, timeout) {
    return new Promise((resolve) => {
        const started = process.hrtime.bigint();
        let settled = false;
        let deadline;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(deadline);
            resolve(result);
        };
        const client = url.protocol === 'https:' ? https : http;
        // Each independent health sample gets a fresh connection, never an idle pooled socket.
        const req = client.get(url, { agent: false, headers: { 'User-Agent': 'ServerMonitor-Health/1.0' } }, (res) => {
            const ms = Number((process.hrtime.bigint() - started) / 1000000n);
            const online = res.statusCode >= 200 && res.statusCode < 400;
            finish({ status: online ? 'online' : 'error', ms, error: online ? null : `HTTP_${res.statusCode}` });
            // Health measures response headers; do not keep downloading an unbounded body.
            res.destroy();
        });
        req.on('error', (error) => finish({ status: 'offline', ms: null, error: error.code || 'NETWORK_ERROR' }));
        // Bound DNS, connection, TLS and headers together, including a peer that trickles bytes.
        deadline = setTimeout(() => {
            finish({ status: 'offline', ms: null, error: 'ETIMEDOUT' });
            req.destroy();
        }, timeout);
    });
}

/** Retry a failed transport once before publishing a ten-minute unavailable sample. */
async function checkHttp(target, timeout = 5000) {
    let url;
    try {
        url = new URL(target);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    } catch {
        return { status: 'error', ms: null, error: 'INVALID_URL', attempts: 0 };
    }
    const started = Date.now();
    const first = await probe(url, timeout);
    if (first.status !== 'offline') return { ...first, attempts: 1 };
    const second = await probe(url, timeout);
    return {
        ...second,
        // Include the failed attempt in visitor latency instead of disguising a slow recovery.
        ms: second.ms == null ? null : Date.now() - started,
        attempts: 2
    };
}

module.exports = { checkHttp };
