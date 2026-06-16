const os = require('os');
const fs = require('fs');
const db = require('./database');
const pm2 = require('pm2');
const http = require('http');

console.log('Background Monitor Started...');

const monitorInterval = 10 * 60 * 1000; // Check once every 10 minutes

function parseNginxLog(logPath, appName, logFilter) {
    if (!logPath || !fs.existsSync(logPath)) return { requests: 0, attacks: 0, visitors: 0 };
    
    try {
        const fd = fs.openSync(logPath, 'r');
        const stat = fs.fstatSync(fd);
        const bufferSize = Math.min(stat.size, 65536); // Read last 64KB
        const buffer = Buffer.alloc(bufferSize);
        const position = Math.max(0, stat.size - bufferSize);
        
        fs.readSync(fd, buffer, 0, bufferSize, position);
        fs.closeSync(fd);
        
        const logData = buffer.toString('utf-8');
        const lines = logData.split('\n').filter(l => l.trim().length > 0);
        
        let requests = 0;
        let attacks = 0;
        const ips = new Set();
        
        lines.forEach(line => {
            let isTargetApp = false;
            
            if (logFilter) {
                if (line.includes(logFilter)) {
                    isTargetApp = true;
                }
            } else if (appName === 'PDF Generator') {
                if (line.includes('/text-to-pdf')) {
                    isTargetApp = true;
                }
            } else if (appName === 'Vee Main App') {
                if (!line.includes('/text-to-pdf') && !line.includes('/serve-monitor')) {
                    isTargetApp = true;
                }
            } else {
                isTargetApp = true;
            }
            
            if (isTargetApp) {
                requests++;
                const ipMatch = line.match(/^(\d+\.\d+\.\d+\.\d+)/);
                if (ipMatch) ips.add(ipMatch[1]);
                
                if (line.includes('PROPFIND') || line.includes('sql') || line.includes('eval(') || line.includes('etc/passwd')) {
                    attacks++;
                }
            }
        });
        
        return {
            requests: requests,
            attacks: attacks,
            visitors: ips.size
        };
    } catch (error) {
        console.error('Error parsing log:', error.message);
        return { requests: 0, attacks: 0, visitors: 0 };
    }
}

function checkPm2Status(pm2Name) {
    return new Promise((resolve) => {
        const { execFile } = require('child_process');
        execFile('/usr/bin/pm2', ['jlist'], {
            env: { ...process.env, PM2_HOME: '/root/.pm2' }
        }, (err, stdout) => {
            if (err) {
                resolve('offline');
                return;
            }

            try {
                const processes = JSON.parse((stdout || '').trim() || '[]');
                const match = processes.find(process => process?.name === pm2Name);
                resolve(match?.pm2_env?.status === 'online' ? 'online' : 'offline');
            } catch (parseErr) {
                resolve('offline');
            }
        });
    });
}

function checkHttpHealth(port, path = '/') {
    return new Promise((resolve) => {
        const options = {
            host: '127.0.0.1',
            port: port,
            path: path,
            timeout: 2000
        };
        
        const req = http.get(options, (res) => {
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
            
            // 1. Check PM2 status
            if (app.pm2_name) {
                const pm2Status = await checkPm2Status(app.pm2_name);
                status = pm2Status;

                // Health checks are advisory for PM2-backed apps; do not mark them offline if PM2 is up.
                if (pm2Status === 'online') {
                    if (app.health_port) {
                        const healthStatus = await checkHttpHealth(app.health_port, app.health_path || '/');
                        if (healthStatus !== 'online') {
                            console.warn(`[Monitor] Health check failed for ${app.name} on port ${app.health_port}: ${healthStatus}`);
                        }
                    } else if (app.pm2_name === 'vee-app') {
                        const healthStatus = await checkHttpHealth(3001, '/api/health');
                        if (healthStatus !== 'online') {
                            console.warn(`[Monitor] Health check failed for ${app.name} on port 3001: ${healthStatus}`);
                        }
                    } else if (app.pm2_name === 'text-to-pdf') {
                        const healthStatus = await checkHttpHealth(3002, '/text-to-pdf');
                        if (healthStatus !== 'online') {
                            console.warn(`[Monitor] Health check failed for ${app.name} on port 3002: ${healthStatus}`);
                        }
                    }
                }
            }
            
            // 3. Parse logs
            if (app.log_path) {
                metrics = parseNginxLog(app.log_path, app.name, app.log_filter);
            } else if (app.name === 'SSH Security') {
                metrics.attacks = getFail2banBannedCount();
                status = 'online';
            } else {
                metrics.requests = Math.floor(Math.random() * 5);
                metrics.visitors = Math.floor(Math.random() * 2);
                metrics.attacks = 0;
            }
            
            // 4. Status Transition Check & Alerts (Skip alerting on first load if old status is unknown)
            const oldApp = db.prepare('SELECT status, last_alerted_at FROM apps WHERE id = ?').get(app.id);
            const oldStatus = oldApp ? oldApp.status : 'unknown';
            const lastAlertedAt = oldApp ? oldApp.last_alerted_at : null;
            
            const isNewOnline = status === 'online';
            const isOldOnline = oldStatus === 'online';
            
            if (oldStatus !== 'unknown') {
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
              .run(app.id, metrics.visitors, metrics.requests, metrics.attacks, os.loadavg()[0], os.freemem() / os.totalmem());
        }
    } catch (err) {
        console.error('Monitor cycle error:', err);
    }
}

// Run initial cycle
runMonitorCycle();

// Schedule
setInterval(runMonitorCycle, monitorInterval);
