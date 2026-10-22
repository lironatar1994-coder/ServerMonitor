const fs = require('fs');
const db = require('./database');
const { checkHttp } = require('./httpHealth');
const { execFile } = require('child_process');
const { getSystemdSnapshot } = require('./systemd');
const { parseNginxLogMetrics } = require('./logParser');
const { sendAlertEmail } = require('./alerts');
const { recordStatus, recordRuntimeStarts, silentTrackers } = require('./observability');
const { MAINTENANCE_APP, SSH_APP } = require('./catalogNames');
const { runInsights } = require('./insights');

console.log('Background Monitor Started...');

const monitorInterval = 10 * 60 * 1000; // Check once every 10 minutes
const monitorDataRetentionDays = 90;
const alertReminderMs = 6 * 60 * 60 * 1000;
const slowResponseMs = 4000;
let lastDataPurgeAt = 0;
let lastSilentCheckAt = 0;
let lastInsightsAt = 0;

function purgeExpiredMonitorData() {
    const now = Date.now();
    if (now - lastDataPurgeAt < 24 * 60 * 60 * 1000) return;

    db.prepare("DELETE FROM metrics WHERE timestamp < datetime('now', ?)").run(`-${monitorDataRetentionDays} days`);
    db.prepare("DELETE FROM email_report_deliveries WHERE sent_at < datetime('now', '-400 days')").run();
    db.prepare("DELETE FROM web_vitals WHERE occurred_at < ?").run(new Date(now - 90 * 86400000).toISOString());
    db.prepare("DELETE FROM status_events WHERE started_at < ? AND id NOT IN (SELECT MAX(id) FROM status_events GROUP BY app_id)")
        .run(new Date(now - 400 * 86400000).toISOString());
    db.prepare('DELETE FROM insight_notifications WHERE created_at < ?').run(new Date(now - 90 * 86400000).toISOString());
    db.prepare('DELETE FROM push_deliveries WHERE sent_at < ?').run(new Date(now - 30 * 86400000).toISOString());
    lastDataPurgeAt = now;
}

// One PM2 listing per cycle instead of one per monitored process.
function getPm2Processes() {
    return new Promise((resolve) => {
        execFile('/usr/bin/pm2', ['jlist'], {
            env: { ...process.env, PM2_HOME: '/root/.pm2' }, maxBuffer: 8 * 1024 * 1024, timeout: 15000
        }, (error, stdout) => {
            if (error) return resolve(null);
            try {
                resolve(JSON.parse((stdout || '').trim() || '[]'));
            } catch {
                resolve(null);
            }
        });
    });
}

function pm2Status(processes, pm2Name) {
    const match = processes?.find((item) => item?.name === pm2Name);
    return match ? {
        status: match?.pm2_env?.status === 'online' ? 'online' : 'offline',
        cpu: match?.monit?.cpu || 0,
        memory: match?.monit?.memory || 0,
        startedAt: match?.pm2_env?.pm_uptime ? new Date(match.pm2_env.pm_uptime).toISOString() : null
    } : { status: 'offline', cpu: 0, memory: 0, startedAt: null };
}

function getFail2banBannedCount() {
    const logPath = '/var/log/fail2ban.log';
    if (!fs.existsSync(logPath)) return 0;
    try {
        const data = fs.readFileSync(logPath, 'utf-8');
        const lines = data.split('\n');
        const bannedIPs = new Set();
        lines.forEach(line => {
            if (line.includes('Ban ')) {
                const parts = line.split('Ban ');
                if (parts[1]) bannedIPs.add(parts[1].trim());
            } else if (line.includes('Unban ')) {
                const parts = line.split('Unban ');
                if (parts[1]) bannedIPs.delete(parts[1].trim());
            }
        });
        return bannedIPs.size;
    } catch (e) {
        console.error('Error reading fail2ban log:', e.message);
        return 0;
    }
}

const metadata = {
    get: (key) => db.prepare('SELECT value FROM monitor_metadata WHERE key = ?').get(key)?.value,
    set: (key, value) => db.prepare(`INSERT INTO monitor_metadata (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).run(key, String(value))
};
const due = (key, intervalMs) => Date.now() - Number(metadata.get(key) || 0) > intervalMs;

async function runMonitorCycle() {
    try {
        const apps = db.prepare('SELECT * FROM apps').all();
        const units = getSystemdSnapshot(apps, true);
        const processes = await getPm2Processes();
        const alerts = [];
        const starts = [];

        for (const app of apps) {
            let status = 'online';
            let metrics = { visitors: 0, requests: 0, attacks: 0 };
            let appCpu = 0;
            let appMemory = 0;
            let responseMs = null;

            // 1. Runtime state
            if (app.pm2_name) {
                const pm2Info = pm2Status(processes, app.pm2_name);
                status = pm2Info.status;
                appCpu = pm2Info.cpu;
                appMemory = pm2Info.memory;
                starts.push({ appId: app.id, startedAt: pm2Info.startedAt });
            }

            if (app.systemd_unit) {
                const unit = units.find((item) => item.systemd_unit === app.systemd_unit);
                status = unit?.status || 'unknown';
                appMemory = unit?.memory || 0;
                appCpu = unit?.cpu || 0;
                starts.push({ appId: app.id, startedAt: unit?.started_at || null });
            }

            // 2. Health URL (internal), then the public address a visitor actually loads.
            const healthUrl = app.health_url || (app.health_port
                ? `http://127.0.0.1:${app.health_port}${app.health_path || '/'}`
                : null);
            if (healthUrl && (!(app.pm2_name || app.systemd_unit) || status === 'online')) {
                const health = await checkHttp(healthUrl);
                responseMs = health.ms;
                if (health.status !== 'online') {
                    status = health.status;
                    console.warn(`[Monitor] Health check failed for ${app.name}: ${health.status} (${health.error}, ${health.attempts} attempts)`);
                }
            }
            if (app.url && status === 'online' && app.url !== healthUrl) {
                const publicCheck = await checkHttp(app.url, 10000);
                if (publicCheck.ms != null) responseMs = publicCheck.ms;
            }

            // 3. Parse logs
            if (app.name === MAINTENANCE_APP) {
                try {
                    const health = JSON.parse(fs.readFileSync('/var/lib/lawebs-maintenance/health.json', 'utf8'));
                    const stale = Date.now() - Number(health.checked) * 1000 > 30 * 60 * 1000;
                    status = stale || health.errors?.length ? 'error' : 'online';
                } catch {
                    status = 'unknown';
                }
            }
            if (app.log_path) {
                metrics = parseNginxLogMetrics(
                    app.log_path,
                    app.name,
                    app.log_filter,
                    app.log_host,
                    app.log_exclude
                );
            } else if (app.name === SSH_APP) {
                metrics.attacks = getFail2banBannedCount();
                status = 'online';
            }

            // 4. Status Transition Check & Alerts (Skip alerting on first load if old status is unknown)
            const oldApp = db.prepare('SELECT status, last_alerted_at FROM apps WHERE id = ?').get(app.id);
            const oldStatus = oldApp ? oldApp.status : 'unknown';
            const lastAlertedAt = oldApp ? oldApp.last_alerted_at : null;

            const isNewOnline = status === 'online';
            const isOldOnline = oldStatus === 'online';

            if (oldStatus !== 'unknown' && app.alerts_enabled !== 0) {
                if (!isNewOnline) {
                    // Alert after two consecutive failed cycles, then repeat every six hours.
                    const dueAlert = !isOldOnline && (!lastAlertedAt || Date.now() - new Date(lastAlertedAt.replace(' ', 'T') + 'Z').getTime() > alertReminderMs);
                    if (dueAlert) alerts.push({ id: app.id, name: app.name, status, kind: 'down', reminder: Boolean(lastAlertedAt) });
                } else if (!isOldOnline && lastAlertedAt) {
                    // Recovery is reported only for failures that were reported.
                    alerts.push({ id: app.id, name: app.name, kind: 'up' });
                    db.prepare('UPDATE apps SET last_alerted_at = NULL WHERE id = ?').run(app.id);
                }
                // Slow twice in a row while still answering: one reminder per six hours.
                const previousMs = db.prepare('SELECT response_ms FROM metrics WHERE app_id = ? ORDER BY timestamp DESC LIMIT 1').get(app.id)?.response_ms;
                if (isNewOnline && responseMs > slowResponseMs && previousMs > slowResponseMs && due(`slow-alert:${app.id}`, alertReminderMs)) {
                    alerts.push({ id: app.id, name: app.name, kind: 'slow', ms: responseMs, metaKey: `slow-alert:${app.id}` });
                }
            }

            // Save to DB
            db.prepare(`UPDATE apps SET status = ?, last_checked = CURRENT_TIMESTAMP,
                status_changed_at = CASE WHEN status IS NOT ? OR status_changed_at IS NULL THEN CURRENT_TIMESTAMP ELSE status_changed_at END
                WHERE id = ?`).run(status, status, app.id);
            recordStatus(db, app, status);
            db.prepare('INSERT INTO metrics (app_id, visitors, requests, attacks, cpu_usage, ram_usage, response_ms) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(app.id, metrics.visitors, metrics.requests, metrics.attacks, appCpu, appMemory, responseMs);
        }
        if (processes) recordRuntimeStarts(db, starts);

        // Hourly: sites whose visitors still arrive but whose browser measurement went quiet.
        if (Date.now() - lastSilentCheckAt > 3600000) {
            lastSilentCheckAt = Date.now();
            for (const app of silentTrackers(db)) {
                if (due(`silent-alert:${app.id}`, 24 * 3600000)) alerts.push({ id: app.id, name: app.name, kind: 'silent', metaKey: `silent-alert:${app.id}` });
            }
        }

        if (alerts.length) {
            const { sent } = await sendAlertEmail(alerts);
            const mark = db.prepare('UPDATE apps SET last_alerted_at = CURRENT_TIMESTAMP WHERE id = ?');
            // An undelivered failure alert is retried on the next cycle.
            if (sent) {
                alerts.filter((item) => item.kind === 'down').forEach((item) => mark.run(item.id));
                alerts.filter((item) => item.metaKey).forEach((item) => metadata.set(item.metaKey, Date.now()));
            }
        }
        // Every 30 minutes: insights for subscribed devices (each insight is pushed once).
        if (Date.now() - lastInsightsAt > 30 * 60000) {
            lastInsightsAt = Date.now();
            try { await runInsights(db); } catch (error) { console.error('[Insights] failed:', error.message); }
        }
        purgeExpiredMonitorData();
    } catch (err) {
        console.error('Monitor cycle error:', err);
    }
}

// Run initial cycle
runMonitorCycle();

// Schedule
setInterval(runMonitorCycle, monitorInterval);
