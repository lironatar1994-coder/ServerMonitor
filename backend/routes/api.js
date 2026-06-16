const express = require('express');
const db = require('../database');
const { authenticateToken } = require('./auth');
const os = require('os');
const fs = require('fs');

const router = express.Router();

router.use(authenticateToken);

// Get Server General Stats
router.get('/server-stats', (req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuLoad = os.loadavg()[0]; // 1 min average
    
    res.json({
        ram: { total: totalMem, used: usedMem, percentage: (usedMem / totalMem) * 100 },
        cpu: { load: cpuLoad, cores: os.cpus().length },
        uptime: os.uptime()
    });
});

// Get all apps with latest metrics
router.get('/', (req, res) => {
    const apps = db.prepare('SELECT * FROM apps').all();
    
    const appsWithMetrics = apps.map(app => {
        const latestMetrics = db.prepare('SELECT * FROM metrics WHERE app_id = ? ORDER BY timestamp DESC LIMIT 1').get(app.id);
        const trend = db.prepare('SELECT requests, timestamp FROM metrics WHERE app_id = ? ORDER BY timestamp DESC LIMIT 10').all(app.id);
        
        return {
            ...app,
            metrics: latestMetrics || { visitors: 0, requests: 0, attacks: 0 },
            trend: trend.reverse()
        };
    });
    
    res.json(appsWithMetrics);
});

// Add new app
router.post('/', (req, res) => {
    const { name, url, pm2_name, log_path, health_port, health_path, log_filter } = req.body;
    
    if (!name) return res.status(400).json({ error: 'App name is required' });
    
    const info = db.prepare('INSERT INTO apps (name, url, pm2_name, log_path, health_port, health_path, log_filter) VALUES (?, ?, ?, ?, ?, ?, ?)')
                   .run(name, url || null, pm2_name || null, log_path || null, health_port || null, health_path || null, log_filter || null);
                   
    res.json({ id: info.lastInsertRowid, message: 'App added successfully' });
});

// Get specific app details
router.get('/:id', (req, res) => {
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    
    const history = db.prepare('SELECT * FROM metrics WHERE app_id = ? ORDER BY timestamp DESC LIMIT 24').all(req.params.id);
    
    res.json({
        ...app,
        history: history.reverse()
    });
});

// POST action on application (restart / stop / start)
router.post('/:id/action', (req, res) => {
    const { action } = req.body;
    const { id } = req.params;
    
    if (!['restart', 'stop', 'start'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be restart, stop, or start.' });
    }
    
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    if (!app.pm2_name) return res.status(400).json({ error: 'This app is not configured with PM2' });
    
    // Run PM2 action safely via CLI to prevent socket concurrency crashes (using absolute path)
    const { exec } = require('child_process');
    exec(`/usr/bin/pm2 ${action} ${app.pm2_name}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`[PM2 Action Error]:`, err.message, stderr);
            return res.status(500).json({ error: `PM2 action ${action} failed: ${stderr || err.message}` });
        }
        res.json({ message: `App ${app.name} (${action}) executed successfully` });
    });
});

// GET logs for app
router.get('/:id/logs', (req, res) => {
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    
    let logLines = [];
    
    if (app.name === 'SSH Security') {
        const logPath = '/var/log/fail2ban.log';
        if (fs.existsSync(logPath)) {
            try {
                const content = fs.readFileSync(logPath, 'utf-8');
                logLines = content.split('\n').filter(Boolean).slice(-50);
            } catch (e) {
                logLines = [`Error reading fail2ban log: ${e.message}`];
            }
        } else {
            logLines = ['Fail2ban log file not found at /var/log/fail2ban.log'];
        }
    } else if (app.log_path && fs.existsSync(app.log_path)) {
        try {
            const content = fs.readFileSync(app.log_path, 'utf-8');
            const lines = content.split('\n').filter(Boolean);
            
            if (app.log_filter) {
                logLines = lines.filter(l => l.includes(app.log_filter)).slice(-50);
            } else if (app.name === 'PDF Generator') {
                logLines = lines.filter(l => l.includes('/text-to-pdf')).slice(-50);
            } else if (app.name === 'Vee Main App') {
                logLines = lines.filter(l => !l.includes('/text-to-pdf') && !l.includes('/serve-monitor')).slice(-50);
            } else {
                logLines = lines.slice(-50);
            }
        } catch (e) {
            logLines = [`Error reading log file: ${e.message}`];
        }
    } else if (app.pm2_name) {
        const pm2 = require('pm2');
        pm2.connect((err) => {
            if (err) {
                logLines = ['Failed to connect to PM2 to retrieve logs'];
                return res.json({ logs: logLines });
            }
            pm2.describe(app.pm2_name, (err2, desc) => {
                pm2.disconnect();
                if (err2 || !desc || desc.length === 0) {
                    logLines = [`No PM2 process found for name: ${app.pm2_name}`];
                    return res.json({ logs: logLines });
                }
                const pm2LogPath = desc[0].pm2_env.pm_out_log_path;
                const pm2ErrorLogPath = desc[0].pm2_env.pm_err_log_path;
                
                try {
                    let outLogs = fs.existsSync(pm2LogPath) ? fs.readFileSync(pm2LogPath, 'utf-8').split('\n') : [];
                    let errLogs = fs.existsSync(pm2ErrorLogPath) ? fs.readFileSync(pm2ErrorLogPath, 'utf-8').split('\n') : [];
                    logLines = [...outLogs.slice(-25), ...errLogs.slice(-25)].filter(Boolean);
                    res.json({ logs: logLines });
                } catch (e) {
                    res.json({ logs: [`Error reading PM2 logs: ${e.message}`] });
                }
            });
        });
        return;
    } else {
        logLines = ['No log file or PM2 process configured for this application'];
    }
    
    res.json({ logs: logLines });
});

// GET last 100 visitors for app
router.get('/:id/visitors', (req, res) => {
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    
    // Check if the app is the WhatsApp Worker
    if (app.pm2_name === 'vee-whatsapp-worker') {
        const veeDbPath = '/root/Vee/backend/database.sqlite';
        if (!fs.existsSync(veeDbPath)) {
            // Mock data for local development/fallback
            return res.json({
                is_whatsapp: true,
                visitors: [
                    { id: 1, phone: '0508611888', message: '🔔 בדיקת מערכת התראות מנטור Vee - הודעת הבדיקה נשלחה בהצלחה!', status: 'sent', error: null, created_at: new Date().toISOString() },
                    { id: 2, phone: '0508611888', message: '⚠️ התראת שרת Vee: שגיאה - האפליקציה vee-app אינה מקוונת', status: 'failed', error: 'Failed to send message', created_at: new Date().toISOString() }
                ]
            });
        }
        try {
            const veeDb = new (require('better-sqlite3'))(veeDbPath);
            const query = `
                SELECT id, phone, message, status, error, created_at FROM whatsapp_logs
                UNION ALL
                SELECT id, to_phone AS phone, message, status, NULL AS error, created_at FROM whatsapp_outbox WHERE status = 'pending'
                ORDER BY created_at DESC LIMIT 100
            `;
            const logs = veeDb.prepare(query).all();
            veeDb.close();
            return res.json({ is_whatsapp: true, visitors: logs });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: `Failed to query WhatsApp database: ${e.message}` });
        }
    }
    
    if (!app.log_path || !fs.existsSync(app.log_path)) {
        return res.json({ is_whatsapp: false, visitors: [] });
    }
    
    try {
        const fd = fs.openSync(app.log_path, 'r');
        const stat = fs.fstatSync(fd);
        // Read last 256KB to ensure we can find up to 100 hits
        const bufferSize = Math.min(stat.size, 262144); 
        const buffer = Buffer.alloc(bufferSize);
        const position = Math.max(0, stat.size - bufferSize);
        
        fs.readSync(fd, buffer, 0, bufferSize, position);
        fs.closeSync(fd);
        
        const logData = buffer.toString('utf-8');
        const lines = logData.split('\n').filter(Boolean);
        
        const visitors = [];
        
        // Parse from bottom to top (newest first)
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            let isTargetApp = false;
            
            if (app.log_filter) {
                if (line.includes(app.log_filter)) isTargetApp = true;
            } else if (app.name === 'PDF Generator') {
                if (line.includes('/text-to-pdf')) isTargetApp = true;
            } else if (app.name === 'Vee Main App') {
                if (!line.includes('/text-to-pdf') && !line.includes('/serve-monitor')) isTargetApp = true;
            } else {
                isTargetApp = true;
            }
            
            if (isTargetApp) {
                // Regex to parse Nginx log line
                // Format: IP - - [date] "method path proto" status bytes "referrer" "user-agent"
                const match = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+-\s+-\s+\[([^\]]+)\]\s+\"(\w+)\s+([^\s?]+)[^\"]*\"\s+(\d+)/);
                if (match) {
                    const [_, ip, timestamp, method, path, status] = match;
                    
                    // Simple user agent parse
                    let agent = 'Unknown';
                    const uaMatch = line.match(/\"[^\"]*\"\s+\"([^\"]+)\"$/);
                    if (uaMatch && uaMatch[1]) {
                        const ua = uaMatch[1];
                        if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
                            agent = 'Mobile';
                        } else if (ua.includes('Windows') || ua.includes('Macintosh') || ua.includes('Linux')) {
                            agent = 'Desktop';
                        } else if (ua.includes('bot') || ua.includes('crawler') || ua.includes('Spider')) {
                            agent = 'Bot';
                        }
                    }
                    
                    visitors.push({
                        ip,
                        timestamp,
                        method,
                        path,
                        status: parseInt(status, 10),
                        agent
                    });
                    
                    if (visitors.length >= 100) break;
                }
            }
        }
        
        res.json({ is_whatsapp: false, visitors });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// GET WhatsApp status and PM2 status
router.get('/:id/whatsapp-status', (req, res) => {
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    
    if (app.pm2_name === 'vee-whatsapp-worker') {
        const statusPath = '/root/Vee/backend/whatsapp_status.json';
        let statusData = { status: 'UNKNOWN', qr: null, updatedAt: null };
        
        if (fs.existsSync(statusPath)) {
            try {
                statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            } catch (e) {
                console.error('Failed to parse whatsapp_status.json:', e.message);
            }
        }
        
        // Check PM2 state safely using CLI to prevent axon socket concurrency crashes (using absolute path)
        const { exec } = require('child_process');
        exec(`/usr/bin/pm2 pid ${app.pm2_name}`, (err, stdout, stderr) => {
            if (err) {
                console.error(`[PM2 Status Error]:`, err.message, stderr);
            }
            const pid = stdout.trim();
            const isOnline = !err && pid !== '' && pid !== '0';
            res.json({
                ...statusData,
                isOnline
            });
        });
        return;
    }
    
    res.status(400).json({ error: 'This app is not a WhatsApp worker' });
});

module.exports = router;
