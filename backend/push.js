// Browser push for alerts and insights. VAPID keys live in a root-only file, never in the
// database. Each device chooses its categories, quiet hours and a daily cap for insights.
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const db = require('./database');

const KEY_FILE = process.env.PUSH_KEY_FILE || (process.env.NODE_ENV === 'production'
    ? '/root/.server-monitor-push-key.json' : path.join(__dirname, '.push-key.json'));
// `outage` is operational; the rest are insights that respect quiet hours and the daily cap.
const CATEGORIES = ['outage', 'leads', 'digest', 'traffic', 'contacts', 'campaigns', 'pages', 'speed'];
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

const enabledCategories = (row) => (row.categories ? row.categories.split(',').filter((item) => CATEGORIES.includes(item)) : CATEGORIES);

function preferences(userId, endpoint) {
    const row = db.prepare('SELECT categories, quiet_start, quiet_end, daily_cap FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').get(userId, String(endpoint || ''));
    return row ? { categories: enabledCategories(row), quiet_start: row.quiet_start, quiet_end: row.quiet_end, daily_cap: row.daily_cap } : null;
}

function savePreferences(userId, body) {
    const categories = Array.isArray(body?.categories) ? body.categories.filter((item) => CATEGORIES.includes(item)) : null;
    const hour = (value) => Number.isInteger(value) && value >= 0 && value <= 23;
    const cap = Number(body?.daily_cap);
    if (!categories || !hour(body?.quiet_start) || !hour(body?.quiet_end) || !(Number.isInteger(cap) && cap >= 0 && cap <= 50)) {
        throw Object.assign(new Error('ההגדרות אינן תקינות.'), { status: 400 });
    }
    const result = db.prepare('UPDATE push_subscriptions SET categories = ?, quiet_start = ?, quiet_end = ?, daily_cap = ? WHERE user_id = ? AND endpoint = ?')
        .run(categories.length === CATEGORIES.length ? '' : categories.join(',') || 'none', body.quiet_start, body.quiet_end, cap, userId, String(body?.endpoint || ''));
    if (!result.changes) throw Object.assign(new Error('המכשיר אינו רשום להתראות.'), { status: 404 });
}

const israelHour = (now) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(now)) % 24;
const israelDayStart = (now) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
    const probe = new Date(`${day}T12:00:00Z`);
    const offset = Date.parse(probe.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })) - Date.parse(probe.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(Date.parse(`${day}T00:00:00Z`) - offset).toISOString();
};
function inQuietHours(row, now) {
    const hour = israelHour(now);
    const { quiet_start: start, quiet_end: end } = row;
    if (start === end) return false;
    return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Whether a device should receive this message now. Outage pushes ignore the daily cap, and
 * a service going down also ignores quiet hours; insights respect both.
 */
function allowed(row, { category, urgent = false }, now = new Date()) {
    if (!enabledCategories(row).includes(category)) return false;
    if (!urgent && inQuietHours(row, now)) return false;
    if (category === 'outage') return true;
    const sentToday = db.prepare("SELECT COUNT(*) AS n FROM push_deliveries WHERE subscription_id = ? AND category NOT IN ('outage', 'digest') AND sent_at >= ?")
        .get(row.id, israelDayStart(now)).n;
    return category === 'digest' || sentToday < row.daily_cap;
}

async function deliver(row, message, category, key = '') {
    vapidKeys();
    try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            JSON.stringify(message), { TTL: category === 'outage' ? 3600 : 6 * 3600, urgency: category === 'outage' ? 'high' : 'normal' });
        db.prepare('INSERT INTO push_deliveries (subscription_id, category, notification_key, sent_at) VALUES (?, ?, ?, ?)')
            .run(row.id, category, key, new Date().toISOString());
        return true;
    } catch (error) {
        if ([404, 410].includes(error.statusCode)) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
        else db.prepare('UPDATE push_subscriptions SET last_error = ? WHERE id = ?').run(String(error.statusCode || error.message).slice(0, 120), row.id);
        return false;
    }
}

function activeSubscriptions(userId = null) {
    return db.prepare(`SELECT p.* FROM push_subscriptions p JOIN users u ON u.id = p.user_id
        WHERE u.disabled = 0 ${userId ? 'AND p.user_id = ?' : ''}`).all(...(userId ? [userId] : []));
}

/** Sends one message to every device whose preferences allow it. `message` may be a function of the device. */
async function sendPush(message, { userId = null, category = 'outage', urgent = false, key = '', test = false } = {}) {
    const rows = activeSubscriptions(userId);
    let delivered = 0;
    for (const row of rows) {
        if (!test && !allowed(row, { category, urgent })) continue;
        const content = typeof message === 'function' ? message(row) : message;
        if (content && await deliver(row, content, category, key)) delivered++;
    }
    return { delivered, devices: rows.length };
}

module.exports = { CATEGORIES, vapidKeys, subscribe, unsubscribe, preferences, savePreferences, sendPush,
    validSubscription, allowed, inQuietHours, israelDayStart, activeSubscriptions };
