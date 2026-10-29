// Off-server watchdog: each completed monitor cycle pings a dead-man's switch (Healthchecks.io-compatible),
// which alerts when the pings stop because the monitor or the whole server is down.
// The ping URL is a secret: read it from HEARTBEAT_URL or a root-only file, never log or return it.
const fs = require('fs');

const FILE = process.env.HEARTBEAT_URL_FILE || '/root/.server-monitor-heartbeat-url';

function heartbeatUrl() {
    try {
        const url = new URL(String(process.env.HEARTBEAT_URL || fs.readFileSync(FILE, 'utf8')).trim());
        return url.protocol === 'https:' ? url : null;
    } catch {
        return null;
    }
}

// `failure` reports a cycle that threw, so the watchdog alerts at once instead of waiting for the grace period.
async function sendHeartbeat(db, failure = null) {
    const url = heartbeatUrl();
    if (!url) return { configured: false };
    const set = (key, value) => db.prepare(`INSERT INTO monitor_metadata (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).run(key, String(value));
    try {
        const target = failure ? new URL(`${url.pathname.replace(/\/$/, '')}/fail`, url) : url;
        const response = await fetch(target, failure
            ? { method: 'POST', body: String(failure).slice(0, 500), signal: AbortSignal.timeout(10000) }
            : { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        set('heartbeat-at', Date.now());
        set('heartbeat-error', '');
        return { configured: true, ok: true };
    } catch (error) {
        const message = error.name === 'TimeoutError' ? 'timeout' : String(error.message).slice(0, 120);
        set('heartbeat-error', message);
        console.error('[Heartbeat] ping failed:', message);
        return { configured: true, ok: false };
    }
}

function heartbeatStatus(db) {
    const get = (key) => db.prepare('SELECT value FROM monitor_metadata WHERE key = ?').get(key)?.value;
    return { configured: Boolean(heartbeatUrl()), at: Number(get('heartbeat-at')) || null, error: get('heartbeat-error') || null };
}

module.exports = { sendHeartbeat, heartbeatStatus, heartbeatUrl };
