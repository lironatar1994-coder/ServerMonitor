const fs = require('fs');
const db = require('./database');
const http = require('http');
const https = require('https');
const { parseNginxLogMetrics } = require('./logParser');

console.log('Background Monitor Started...');

const monitorInterval = 10 * 60 * 1000; // Check once every 10 minutes
const monitorDataRetentionDays = 90;
let lastDataPurgeAt = 0;

function purgeExpiredMonitorData() {
    const now = Date.now();
    if (now - lastDataPurgeAt < 24 * 60 * 60 * 1000) return;

    db.prepare("DELETE FROM metrics WHERE timestamp < datetime('now', ?)").run(`-${monitorDataRetentionDays} days`);
    db.prepare("DELETE FROM email_report_deliveries WHERE sent_at < datetime('now', '-400 days')").run();
    lastDataPurgeAt = now;
}

function checkPm2Status(pm2Name) {
    return new Promise((resolve) => {
        const { execFile } = require('child_process');
        execFile('/usr/bin/pm2', ['jlist'], {
            env: { ...process.env, PM2_HOME: '/root/.pm2' }
        }, (error, stdout) => {
            if (error) return resolve({ status: 'offline', cpu: 0, memory: 0 });
            try {
                const match = JSON.parse((stdout || '').trim() || '[]')
                    .find((process) => process?.name === pm2Name);
                resolve(match ? {
                    status: match?.pm2_env?.status === 'online' ? 'online' : 'offline',
                    cpu: match?.monit?.cpu || 0,
                    memory: match?.monit?.memory || 0
                } : { status: 'offline', cpu: 0, memory: 0 });
            } catch (parseError) {
                resolve({ status: 'offline', cpu: 0, memory: 0 });
            }
        });
    });
}

function checkHttpHealthUrl(healthUrl) {
    return new Promise((resolve) => {
        let url;
        try {
            url = new URL(healthUrl);
        } catch (error) {
            resolve('error');
            return;
        }

        const client = url.protocol === 'https:' ? https : http;
        const req = client.get(url, { timeout: 5000 }, (res) => {
            res.resume();
            if (res.statusCode >= 200 && res.statusCode < 400) {
                resolve('online');
            } else {
                resolve('error');
            }
        });
        
        req.on('error', () => {
            resolve('offline');
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve('offline');
        });
    });
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

function sendWhatsAppAlert(appName, newStatus, isFailureReminder) {
    const veeDbPath = '/root/Vee/backend/database.sqlite';
    if (!fs.existsSync(veeDbPath)) {
        console.warn('Vee Database not found, cannot queue WhatsApp alert.');
        return;
    }
    
    try {
        const veeDb = new (require('better-sqlite3'))(veeDbPath);
        const adminPhone = '0508611888';
        let message = '';
        
        if (isFailureReminder) {
            message = `⚠️ *התראת שרת Vee: שגיאה*\nהאפליקציה *${appName}* אינה מקוונת (מצב: *${newStatus}*).\nנא לבדוק את השרת.\nזמן: ${new Date().toLocaleString('he-IL')}`;
        } else {
            message = `✅ *התראת שרת Vee: תקין*\nהאפליקציה *${appName}* חזרה למצב: *תקינה ומקוונת*.\nזמן: ${new Date().toLocaleString('he-IL')}`;
        }
        
        veeDb.prepare('INSERT INTO whatsapp_outbox (to_phone, message) VALUES (?, ?)').run(adminPhone, message);
        veeDb.close();
        console.log(`[Monitor Alert] Queued WhatsApp alert for ${appName} (status: ${newStatus}, failure: ${isFailureReminder})`);
    } catch (e) {
        console.error('Failed to queue WhatsApp alert:', e.message);
    }
}

async function runMonitorCycle() {
    try {
        const apps = db.prepare('SELECT * FROM apps').all();
        
        for (const app of apps) {
            let status = 'online';
            let metrics = { visitors: 0, requests: 0, attacks: 0 };
            let appCpu = 0;
            let appMemory = 0;
            
            // 1. Check PM2 status
            if (app.pm2_name) {
                const pm2Info = await checkPm2Status(app.pm2_name);
                status = pm2Info.status;
                appCpu = pm2Info.cpu;
                appMemory = pm2Info.memory;
            }

            const healthUrl = app.health_url || (app.health_port
                ? `http://127.0.0.1:${app.health_port}${app.health_path || '/'}`
                : null);
            if (healthUrl && (!app.pm2_name || status === 'online')) {
                const healthStatus = await checkHttpHealthUrl(healthUrl);
                if (healthStatus !== 'online') {
                    status = healthStatus;
                    console.warn(`[Monitor] Health check failed for ${app.name} at ${healthUrl}: ${healthStatus}`);
                }
            }
            
            // 3. Parse logs
            if (app.log_path) {
                metrics = parseNginxLogMetrics(
                    app.log_path,
                    app.name,
                    app.log_filter,
                    app.log_host,
                    app.log_exclude
                );
            } else if (app.name === 'SSH Security') {
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
                    // Send/repeat warning alert every 1 hour (60 minutes cooldown)
                    const now = Date.now();
                    const cooldDownTime = 60 * 60 * 1000; // 1 hour
                    const shouldAlert = !lastAlertedAt || (now - new Date(lastAlertedAt).getTime() > cooldDownTime);
                    
                    if (shouldAlert) {
                        sendWhatsAppAlert(app.name, status, true);
                        db.prepare('UPDATE apps SET last_alerted_at = CURRENT_TIMESTAMP WHERE id = ?').run(app.id);
                    }
                } else if (!isOldOnline && isNewOnline) {
                    // Send recovery alert when transitioning back to online
                    sendWhatsAppAlert(app.name, 'online', false);
                    db.prepare('UPDATE apps SET last_alerted_at = NULL WHERE id = ?').run(app.id);
                }
            }
            
            // Save to DB
            db.prepare('UPDATE apps SET status = ?, last_checked = CURRENT_TIMESTAMP WHERE id = ?').run(status, app.id);
            db.prepare('INSERT INTO metrics (app_id, visitors, requests, attacks, cpu_usage, ram_usage) VALUES (?, ?, ?, ?, ?, ?)')
              .run(app.id, metrics.visitors, metrics.requests, metrics.attacks, appCpu, appMemory);
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
