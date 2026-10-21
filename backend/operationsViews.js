// Read-only operations views: verified backups and TLS certificates. File names, sizes,
// dates and verification results only; never archive contents or secrets.
const fs = require('fs');
const path = require('path');
const tls = require('tls');

const STATE = process.env.MAINTENANCE_STATE || '/var/lib/lawebs-maintenance';
const CRM_BACKUPS = '/root/crm-backups';
const MAAVAR_EXPORT = '/opt/maavar/shared/export/latest.mvbak';

function readJson(file, limit = 1024 * 1024) {
    try {
        if (fs.statSync(file).size > limit) return null;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

const stampTime = (name) => {
    const match = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/.exec(name);
    return match ? new Date(Date.UTC(+match[1], match[2] - 1, +match[3], +match[4], +match[5], +match[6])).toISOString() : null;
};

function fileInfo(file) {
    try {
        const stat = fs.statSync(file);
        return { bytes: stat.size, modified: stat.mtime.toISOString() };
    } catch {
        return null;
    }
}

function backups() {
    const root = path.join(STATE, 'backups');
    let names = [];
    try { names = fs.readdirSync(root).filter((name) => stampTime(name)); } catch { /* unavailable */ }
    const snapshots = names.sort().reverse().slice(0, 14).map((name) => {
        const manifest = readJson(path.join(root, name, 'manifest.json'), 256 * 1024) || {};
        const files = Object.entries(manifest).map(([file, item]) => ({ name: file, bytes: Number(item?.bytes) || 0 }));
        return { name, created: stampTime(name), files: files.length, bytes: files.reduce((sum, item) => sum + item.bytes, 0),
            copied_to_pc: fs.existsSync(path.join(STATE, 'pc-acknowledgements', `${name}.json`)), contents: files.sort((a, b) => b.bytes - a.bytes) };
    });
    const daily = readJson(path.join(STATE, 'daily-status.json'), 4 * 1024 * 1024);
    const failure = readJson(path.join(STATE, 'daily-failure.json'));
    const retention = readJson(path.join(STATE, 'retention-status.json'), 256 * 1024);
    let crm = [];
    try {
        crm = fs.readdirSync(CRM_BACKUPS, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
            const dir = path.join(CRM_BACKUPS, entry.name);
            const files = fs.readdirSync(dir).map((name) => ({ name, ...fileInfo(path.join(dir, name)) })).filter((item) => item.modified)
                .sort((a, b) => b.modified.localeCompare(a.modified));
            return { name: entry.name, count: files.length, latest: files[0]?.modified || null, bytes: files[0]?.bytes || 0 };
        });
    } catch { /* unavailable */ }
    const maavar = fileInfo(MAAVAR_EXPORT);
    return {
        snapshots,
        last_success: snapshots[0]?.created || null,
        failure: failure ? { at: failure.failed ? new Date(failure.failed * 1000).toISOString() : null, error: String(failure.error || '').slice(0, 300) } : null,
        last_run: daily ? { at: new Date(daily.completed * 1000).toISOString(), freed_bytes: Number(daily.net_freed_bytes) || 0,
            removed: (daily.pre_cleanup?.files?.length || 0) + (daily.cleanup?.files?.length || 0) } : null,
        retained_bytes: Number(retention?.bytes) || null,
        other: [
            ...crm.map((item) => ({ name: `CRM: ${item.name}`, latest: item.latest, bytes: item.bytes, count: item.count })),
            ...(maavar ? [{ name: 'Alenu CRM: ייצוא מוצפן', latest: maavar.modified, bytes: maavar.bytes, count: 1 }] : [])
        ]
    };
}

let certificateCache = { at: 0, rows: null, pending: null };

function checkCertificate(host) {
    return new Promise((resolve) => {
        const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 8000 }, () => {
            const cert = socket.getPeerCertificate();
            const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
            resolve({ host, valid: socket.authorized, error: socket.authorized ? null : String(socket.authorizationError || ''),
                expires: validTo ? validTo.toISOString() : null,
                days_left: validTo ? Math.floor((validTo.getTime() - Date.now()) / 86400000) : null,
                issuer: cert?.issuer?.O || cert?.issuer?.CN || '' });
            socket.end();
        });
        socket.on('timeout', () => { socket.destroy(); resolve({ host, valid: false, error: 'timeout', expires: null, days_left: null, issuer: '' }); });
        socket.on('error', (error) => resolve({ host, valid: false, error: error.code || error.message, expires: null, days_left: null, issuer: '' }));
    });
}

/** Certificates of every catalog host, cached for six hours and refreshed in the background. */
async function certificates(db, { wait = false } = {}) {
    const refresh = async () => {
        const hosts = new Set(['monitor.vee-app.co.il']);
        for (const { url } of db.prepare("SELECT url FROM apps WHERE url IS NOT NULL AND trim(url) <> ''").all()) {
            try { const parsed = new URL(url); if (parsed.protocol === 'https:') hosts.add(parsed.hostname); } catch { /* invalid */ }
        }
        const rows = [];
        for (const host of [...hosts].sort()) rows.push(await checkCertificate(host));
        certificateCache = { at: Date.now(), rows, pending: null };
        return rows;
    };
    const stale = Date.now() - certificateCache.at > 6 * 3600000;
    if (stale && !certificateCache.pending) certificateCache.pending = refresh().catch(() => { certificateCache.pending = null; return certificateCache.rows; });
    if (!certificateCache.rows || wait) await certificateCache.pending;
    return { checked: certificateCache.at ? new Date(certificateCache.at).toISOString() : null, certificates: certificateCache.rows || [] };
}

module.exports = { backups, certificates, checkCertificate, stampTime };
