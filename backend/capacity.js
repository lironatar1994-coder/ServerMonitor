// Capacity trends: one host sample an hour (disk and memory, from statfs and /proc, no child
// process) inside the existing monitor cycle, and cached forecasts for the operations screen.
const fs = require('fs');

const HOUR = 3600000;
const DAY = 24 * HOUR;
const RETENTION_DAYS = 120;
const CACHE_MS = 30 * 60000;
let cache = { at: 0, value: null };

function initializeCapacity(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS host_samples (
        at TEXT PRIMARY KEY, disk_used INTEGER NOT NULL, disk_available INTEGER NOT NULL,
        mem_total INTEGER, mem_available INTEGER
    )`);
}

function readHost() {
    if (process.platform !== 'linux') return null;
    const disk = fs.statfsSync('/');
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const kb = (name) => Number(new RegExp(`^${name}:\\s+(\\d+)`, 'm').exec(meminfo)?.[1] || 0) * 1024;
    return {
        disk_used: (disk.blocks - disk.bfree) * disk.bsize,
        disk_available: disk.bavail * disk.bsize,
        mem_total: kb('MemTotal'),
        mem_available: kb('MemAvailable'),
    };
}

/** At most one row an hour; old rows go in the same statement batch. */
function sampleHost(db, now = Date.now(), read = readHost) {
    const last = db.prepare('SELECT at FROM host_samples ORDER BY at DESC LIMIT 1').get()?.at;
    if (last && now - Date.parse(last) < HOUR - 5 * 60000) return false;
    const sample = read();
    if (!sample) return false;
    db.prepare(`INSERT OR IGNORE INTO host_samples (at, disk_used, disk_available, mem_total, mem_available)
        VALUES (?, ?, ?, ?, ?)`).run(new Date(now).toISOString(), sample.disk_used, sample.disk_available, sample.mem_total, sample.mem_available);
    db.prepare('DELETE FROM host_samples WHERE at < ?').run(new Date(now - RETENTION_DAYS * DAY).toISOString());
    return true;
}

/** Least-squares slope in bytes per day. */
function slopePerDay(points) {
    const n = points.length;
    const mx = points.reduce((sum, p) => sum + p.x, 0) / n;
    const my = points.reduce((sum, p) => sum + p.y, 0) / n;
    const den = points.reduce((sum, p) => sum + (p.x - mx) ** 2, 0);
    return den ? points.reduce((sum, p) => sum + (p.x - mx) * (p.y - my), 0) / den : 0;
}

/** Days until the root disk fills at the last two weeks' pace; needs two days of samples. */
function diskForecast(db, now = Date.now()) {
    const rows = db.prepare('SELECT at, disk_used, disk_available FROM host_samples WHERE at >= ? ORDER BY at')
        .all(new Date(now - 14 * DAY).toISOString());
    const span = rows.length ? (now - Date.parse(rows[0].at)) / DAY : 0;
    if (rows.length < 24 || span < 2) return { status: 'collecting', samples: rows.length, days_covered: Math.round(span * 10) / 10 };
    const perDay = slopePerDay(rows.map((row) => ({ x: (Date.parse(row.at) - now) / DAY, y: row.disk_used })));
    const available = rows.at(-1).disk_available;
    const days = perDay > 0 ? available / perDay : null;
    return {
        status: days != null && days < 365 ? 'filling' : 'stable',
        growth_per_day: Math.round(perDay),
        days_to_full: days != null && days < 365 ? Math.round(days) : null,
        days_covered: Math.round(span),
    };
}

/** Services whose memory grew by more than 30% and 50 MB between a week ago and the last day. */
function memoryGrowth(db) {
    const apps = db.prepare('SELECT id, name FROM apps WHERE pm2_name IS NOT NULL OR systemd_unit IS NOT NULL').all();
    const window = db.prepare(`SELECT AVG(ram_usage) AS avg, COUNT(*) AS n FROM metrics
        WHERE app_id = ? AND ram_usage > 0 AND timestamp >= datetime('now', ?) AND timestamp < datetime('now', ?)`);
    return apps.map((app) => {
        const before = window.get(app.id, '-7 days', '-6 days');
        const after = window.get(app.id, '-1 days', '+1 minutes');
        if (before.n < 20 || after.n < 20) return null;
        const growth = after.avg - before.avg;
        return growth > 50 * 1024 * 1024 && growth > before.avg * 0.3
            ? { app_id: app.id, name: app.name, from: Math.round(before.avg), to: Math.round(after.avg), percent: Math.round(growth / before.avg * 100) }
            : null;
    }).filter(Boolean).sort((a, b) => b.percent - a.percent).slice(0, 3);
}

function capacityForecast(db, now = Date.now()) {
    if (cache.value && now - cache.at < CACHE_MS) return cache.value;
    cache = { at: now, value: { disk: diskForecast(db, now), memory_growth: memoryGrowth(db) } };
    return cache.value;
}

module.exports = { initializeCapacity, sampleHost, diskForecast, memoryGrowth, capacityForecast, slopePerDay };
