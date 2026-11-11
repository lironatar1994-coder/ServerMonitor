// The owner's own networks: public addresses the monitor's PC agents connect from. Browser signals and
// server visits from them are the owner's browsing, kept as auditable rows with automation_hint = 3
// (browser) or bot_classification 'internal' (server log), never counted and never deleted.
const net = require('net');

const WINDOW_MS = 30 * 86400000;
const WRITE_EVERY_MS = 10 * 60000;
let cache = { at: 0, keys: new Map() };
const lastWrite = new Map();

// IPv4 exactly; IPv6 by its /64, since browsers rotate privacy addresses inside one network.
function networkKey(value) {
    const ip = String(value || '').split(',')[0].trim().replace(/^::ffff:/, '');
    const family = net.isIP(ip);
    if (family === 4) return ip;
    if (family !== 6) return '';
    const [head, tail = ''] = ip.toLowerCase().split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const groups = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    return groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

function initializeInternalNetworks(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS internal_networks (
        network TEXT PRIMARY KEY, host TEXT NOT NULL DEFAULT '', first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
        applied_until TEXT)`);
}

/** Called for every authenticated PC-agent request; writes at most every ten minutes per network. */
function noteAgentAddress(db, ip, host) {
    const network = networkKey(ip);
    if (!network || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(network) || network.startsWith('fe80')) return;
    if (Date.now() - (lastWrite.get(network) || 0) < WRITE_EVERY_MS) return;
    lastWrite.set(network, Date.now());
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO internal_networks (network, host, first_seen, last_seen) VALUES (?, ?, ?, ?)
        ON CONFLICT(network) DO UPDATE SET last_seen = excluded.last_seen, host = excluded.host`)
        .run(network, String(host || '').replace(/[^\w.-]/g, '').slice(0, 64), now, now);
    cache.at = 0;
}

function activeNetworks(db, now = Date.now()) {
    if (now - cache.at < 60000) return cache.keys;
    const since = new Date(now - WINDOW_MS).toISOString();
    const rows = db.prepare('SELECT network, first_seen, last_seen FROM internal_networks WHERE last_seen >= ?').all(since);
    cache = { at: now, keys: new Map(rows.map((row) => [row.network, row])) };
    return cache.keys;
}

function isInternalAddress(db, ip) {
    const network = networkKey(ip);
    return Boolean(network && activeNetworks(db).has(network));
}

/**
 * Marks earlier records from each network once, from 30 days before it was first seen up to now,
 * then only the stretch since the last pass. Rows other people sent from the same address are
 * marked too; that is the accepted trade-off of excluding a whole network.
 */
function markPastInternalVisits(db, now = Date.now()) {
    const networks = [...activeNetworks(db, now).values()];
    if (!networks.length) return 0;
    const until = new Date(now).toISOString();
    let marked = 0;
    for (const row of db.prepare('SELECT network, first_seen, applied_until FROM internal_networks WHERE last_seen >= ?')
        .all(new Date(now - WINDOW_MS).toISOString())) {
        const from = row.applied_until || new Date(Date.parse(row.first_seen) - WINDOW_MS).toISOString();
        const browserIps = db.prepare(`SELECT DISTINCT ip FROM browser_signals WHERE automation_hint IN (0, 2) AND occurred_at >= ? AND occurred_at < ?`)
            .all(from, until).map((item) => item.ip).filter((ip) => networkKey(ip) === row.network);
        const serverIps = db.prepare(`SELECT DISTINCT ip FROM visitor_events WHERE is_bot = 0 AND is_page_view = 1 AND occurred_at >= ? AND occurred_at < ?`)
            .all(from, until).map((item) => item.ip).filter((ip) => networkKey(ip) === row.network);
        db.transaction(() => {
            for (const ip of browserIps) {
                const sessions = db.prepare(`SELECT DISTINCT app_id, session_hash FROM browser_signals
                    WHERE ip = ? AND automation_hint IN (0, 2) AND occurred_at >= ? AND occurred_at < ?`).all(ip, from, until);
                marked += db.prepare(`UPDATE browser_signals SET automation_hint = 3
                    WHERE ip = ? AND automation_hint IN (0, 2) AND occurred_at >= ? AND occurred_at < ?`).run(ip, from, until).changes;
                // Engagement, product and growth rows carry no address; they follow their measured session.
                for (const session of sessions) {
                    const engaged = db.prepare(`SELECT event_id FROM engagement_signals WHERE app_id = ? AND session_hash = ? AND automation_hint IN (0, 2)`)
                        .all(session.app_id, session.session_hash).map((item) => item.event_id);
                    db.prepare('UPDATE engagement_signals SET automation_hint = 3 WHERE app_id = ? AND session_hash = ? AND automation_hint IN (0, 2)')
                        .run(session.app_id, session.session_hash);
                    for (const table of ['engagement_zones', 'engagement_zone_views', 'engagement_heatmap_cells']) {
                        const update = db.prepare(`UPDATE ${table} SET automation_hint = 3 WHERE app_id = ? AND event_id = ? AND automation_hint IN (0, 2)`);
                        engaged.forEach((eventId) => update.run(session.app_id, eventId));
                    }
                    db.prepare('UPDATE product_events SET automation_hint = 3 WHERE app_id = ? AND session_hash = ? AND automation_hint IN (0, 2)')
                        .run(session.app_id, session.session_hash);
                    db.prepare('UPDATE growth_events SET automation_hint = 3 WHERE app_id = ? AND browser_session_hash = ? AND automation_hint IN (0, 2)')
                        .run(session.app_id, session.session_hash);
                }
            }
            for (const ip of serverIps) {
                marked += db.prepare(`UPDATE visitor_events SET is_bot = 1, bot_classification = 'internal', bot_reason = 'internal network', bot_confidence = 100
                    WHERE ip = ? AND is_bot = 0 AND is_page_view = 1 AND occurred_at >= ? AND occurred_at < ?`).run(ip, from, until).changes;
            }
            db.prepare('UPDATE internal_networks SET applied_until = ? WHERE network = ?').run(until, row.network);
        })();
    }
    return marked;
}

function listInternalNetworks(db) {
    return db.prepare('SELECT network, host, first_seen, last_seen FROM internal_networks ORDER BY last_seen DESC LIMIT 20').all()
        .map((row) => ({ ...row, active: Date.parse(row.last_seen) >= Date.now() - WINDOW_MS }));
}

function resetInternalCacheForTests() { cache = { at: 0, keys: new Map() }; lastWrite.clear(); }

module.exports = { networkKey, initializeInternalNetworks, noteAgentAddress, isInternalAddress, markPastInternalVisits,
    listInternalNetworks, resetInternalCacheForTests };
