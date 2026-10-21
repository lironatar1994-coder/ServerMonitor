// Browser push for outage alerts. VAPID keys live in a root-only file, never in the database.
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const db = require('./database');

const KEY_FILE = process.env.PUSH_KEY_FILE || (process.env.NODE_ENV === 'production'
    ? '/root/.server-monitor-push-key.json' : path.join(__dirname, '.push-key.json'));
let keys = null;

function vapidKeys() {
    if (keys) return keys;
    try {
        keys = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    } catch {
        keys = webpush.generateVAPIDKeys();
        fs.writeFileSync(KEY_FILE, JSON.stringify(keys), { mode: 0o600 });
    }
    webpush.setVapidDetails(process.env.MONITOR_ORIGIN || 'https://monitor.vee-app.co.il', keys.publicKey, keys.privateKey);
    return keys;
}

function validSubscription(body) {
    const endpoint = String(body?.endpoint || '');
    const p256dh = String(body?.keys?.p256dh || '');
    const auth = String(body?.keys?.auth || '');
    let url;
    try { url = new URL(endpoint); } catch { return null; }
    if (url.protocol !== 'https:' || endpoint.length > 1000 || !/^[\w-]{20,200}$/.test(p256dh) || !/^[\w-]{8,100}$/.test(auth)) return null;
    return { endpoint, p256dh, auth };
}

function subscribe(userId, body) {
    const sub = validSubscription(body);
    if (!sub) throw Object.assign(new Error('המנוי להתראות אינו תקין.'), { status: 400 });
    db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, last_error = NULL`)
        .run(userId, sub.endpoint, sub.p256dh, sub.auth, new Date().toISOString());
}

function unsubscribe(userId, endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, String(endpoint || ''));
}

/** Sends to every active member's devices; expired subscriptions are removed. */
async function sendPush(message, { userId = null } = {}) {
    vapidKeys();
    const rows = db.prepare(`SELECT p.* FROM push_subscriptions p JOIN users u ON u.id = p.user_id
        WHERE u.disabled = 0 ${userId ? 'AND p.user_id = ?' : ''}`).all(...(userId ? [userId] : []));
    let delivered = 0;
    await Promise.all(rows.map(async (row) => {
        try {
            await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
                JSON.stringify(message), { TTL: 3600, urgency: 'high' });
            delivered++;
        } catch (error) {
            if ([404, 410].includes(error.statusCode)) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
            else db.prepare('UPDATE push_subscriptions SET last_error = ? WHERE id = ?').run(String(error.statusCode || error.message).slice(0, 120), row.id);
        }
    }));
    return { delivered, devices: rows.length };
}

module.exports = { vapidKeys, subscribe, unsubscribe, sendPush, validSubscription };
