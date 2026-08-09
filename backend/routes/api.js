const express = require('express');
const db = require('../database');
const { authenticateToken } = require('./auth');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { getRecentVisitors, getUniqueVisitors, isTargetAppLine } = require('../logParser');
const { getResourceUsage } = require('../resourceUsage');

const router = express.Router();
const WHATSAPP_STATUS_PATH = process.env.WHATSAPP_STATUS_PATH || '/root/Vee/backend/whatsapp_status.json';
let pm2SnapshotCache = { fetchedAt: 0, processes: [] };
let cpuSnapshotCache = { fetchedAt: 0, snapshot: null };

function normalizeWhatsappStatus(rawStatus) {
    const qr = rawStatus?.qr || rawStatus?.qrCode || rawStatus?.qr_code || null;
    const status = (rawStatus?.status || '').toString().trim().toUpperCase();

    return {
        status: status || (qr ? 'NEEDS_SCAN' : 'UNKNOWN'),
        qr,
        updatedAt: rawStatus?.updatedAt || rawStatus?.updated_at || null
    };
}

function normalizeWhatsappMessageStatus(rawStatus) {
    const status = (rawStatus || '').toString().trim().toLowerCase();

    if (['sent', 'success', 'delivered', 'ok', 'complete', 'completed'].includes(status)) return 'sent';
    if (['failed', 'error', 'rejected', 'unsent'].includes(status)) return 'failed';
    if (['pending', 'queued', 'sending', 'waiting', 'processing'].includes(status)) return 'pending';
    return status || 'pending';
}

function getPm2Snapshot() {
    const { execFileSync } = require('child_process');
    try {
        const now = Date.now();
        if (!pm2SnapshotCache.processes.length || now - pm2SnapshotCache.fetchedAt > 5000) {
            const stdout = execFileSync('/usr/bin/pm2', ['jlist'], {
                env: { ...process.env, PM2_HOME: '/root/.pm2' }
            }).toString().trim();
            pm2SnapshotCache = {
                fetchedAt: now,
                processes: JSON.parse(stdout || '[]')
            };
        }
        return pm2SnapshotCache.processes;
    } catch (e) {
        return pm2SnapshotCache.processes;
    }
}

function getLivePm2Metrics(pm2Name) {
    if (!pm2Name) return { status: 'offline', cpu: 0, memory: 0 };

    const match = getPm2Snapshot().find(process => process?.name === pm2Name);
    if (!match) return { status: 'offline', cpu: 0, memory: 0 };
    return {
        status: match?.pm2_env?.status === 'online' ? 'online' : 'offline',
        cpu: match?.monit?.cpu || 0,
        memory: match?.monit?.memory || 0
    };
}

function getCpuSnapshot() {
    const { execFileSync } = require('child_process');

    try {
        const now = Date.now();
        if (cpuSnapshotCache.snapshot && now - cpuSnapshotCache.fetchedAt < 15000) {
            return cpuSnapshotCache.snapshot;
        }

        const output = execFileSync('/bin/bash', ['-lc', "ps -eo pid,ppid,pcpu,pmem,args --sort=-pcpu --no-headers | head -n 8"], {
            env: process.env
        }).toString();

        const topProcesses = output
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const match = line.match(/^(\d+)\s+(\d+)\s+([0-9.]+)\s+([0-9.]+)\s+(.*)$/);
                if (!match) return null;

                const [, pid, ppid, cpu, mem, command] = match;
                return {
                    pid: Number(pid),
                    ppid: Number(ppid),
                    cpu: Number(cpu),
                    mem: Number(mem),
                    command
                };
            })
            .filter(Boolean);

        const snapshot = {
            updatedAt: new Date().toISOString(),
            topProcesses
        };

        cpuSnapshotCache = {
            fetchedAt: now,
            snapshot
        };

        return snapshot;
    } catch (error) {
        if (cpuSnapshotCache.snapshot) {
            return cpuSnapshotCache.snapshot;
        }

        return {
            updatedAt: new Date().toISOString(),
            topProcesses: [],
            error: error.message
        };
    }
}

function getDiskStats() {
    if (process.platform !== 'linux') return null;
    const { execFileSync } = require('child_process');
    try {
        const output = execFileSync('/bin/df', ['-B1', '--output=size,used,avail,pcent', '/'], {
            encoding: 'utf8', timeout: 3000
        }).trim().split('\n').pop().trim();
        const [total, used, available, percentage] = output.split(/\s+/);
        return {
            total: Number(total) || 0,
            used: Number(used) || 0,
            available: Number(available) || 0,
            percentage: Number((percentage || '').replace('%', '')) || 0
        };
    } catch (error) {
        console.error('Disk snapshot failed:', error.message);
        return null;
    }
}

function getMemoryStats() {
    const total = os.totalmem();
    let available = os.freemem();
    let swap = { total: 0, used: 0, available: 0, percentage: 0 };

    if (process.platform === 'linux') {
        try {
            const values = Object.fromEntries(
                fs.readFileSync('/proc/meminfo', 'utf8')
                    .split('\n')
                    .map(line => line.match(/^([^:]+):\s+(\d+)\s+kB$/))
                    .filter(Boolean)
                    .map(([, key, value]) => [key, Number(value) * 1024])
            );

            available = values.MemAvailable || available;
            const swapTotal = values.SwapTotal || 0;
            const swapAvailable = values.SwapFree || 0;
            const swapUsed = Math.max(0, swapTotal - swapAvailable);
            swap = {
                total: swapTotal,
                used: swapUsed,
                available: swapAvailable,
                percentage: swapTotal ? (swapUsed / swapTotal) * 100 : 0
            };
        } catch (error) {
            console.error('Memory snapshot failed:', error.message);
        }
    }

    const used = Math.max(0, total - available);
    return {
        total,
        used,
        available,
        percentage: total ? (used / total) * 100 : 0,
        swap
    };
}

function enrichAppStatus(app) {
    if (!app?.pm2_name) {
        return { ...app, status: app.status || 'online', cpu: 0, memory: 0 };
    }

    const pm2Data = getLivePm2Metrics(app.pm2_name);
    const healthFailure = Boolean(app.health_url || app.health_port) && ['error', 'offline'].includes(app.status);
    const enriched = { 
        ...app, 
        status: pm2Data.status === 'online' && healthFailure ? app.status : pm2Data.status,
        cpu: pm2Data.cpu,
        memory: pm2Data.memory 
    };

    if (app.pm2_name === 'vee-whatsapp-worker') {
        try {
            if (fs.existsSync(WHATSAPP_STATUS_PATH)) {
                enriched.whatsapp_status = normalizeWhatsappStatus(
                    JSON.parse(fs.readFileSync(WHATSAPP_STATUS_PATH, 'utf8'))
                );
                if (enriched.whatsapp_status.status !== 'UNKNOWN') {
                    enriched.status = 'online';
                }
            }
        } catch (e) {
            console.error('Failed to read whatsapp_status.json for app details:', e.message);
        }
    }

    return enriched;
}

function getIsraelDateKey(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});

    return `${parts.year}-${parts.month}-${parts.day}`;
}

function getTrafficHistory(appId, days) {
    const dayKeys = [];
    const now = Date.now();

    for (let offset = days - 1; offset >= 0; offset--) {
        dayKeys.push(getIsraelDateKey(new Date(now - (offset * 24 * 60 * 60 * 1000))));
    }

    const dayMap = new Map(dayKeys.map(date => [date, {
        date,
        visitors: 0,
        requests: 0,
        attacks: 0
    }]));

    const rows = db.prepare(`
        SELECT visitors, requests, attacks, timestamp
        FROM metrics
        WHERE app_id = ?
          AND timestamp >= datetime('now', ?)
        ORDER BY timestamp ASC
    `).all(appId, `-${days + 2} days`);

    rows.forEach(row => {
        const date = getIsraelDateKey(new Date(row.timestamp));
        const bucket = dayMap.get(date);
        if (!bucket) return;

        bucket.visitors = Math.max(bucket.visitors, Number(row.visitors) || 0);
        bucket.requests = Math.max(bucket.requests, Number(row.requests) || 0);
        bucket.attacks = Math.max(bucket.attacks, Number(row.attacks) || 0);
    });

    return Array.from(dayMap.values());
}

router.use(authenticateToken);

// Get Server General Stats
router.get('/server-stats', async (req, res) => {
    const cpuLoad = os.loadavg()[0]; // 1 min average
    const cpuSnapshot = getCpuSnapshot();
    const ram = getMemoryStats();
    const disk = getDiskStats();
    const apps = db.prepare('SELECT id, name, pm2_name FROM apps WHERE pm2_name IS NOT NULL').all();
    
    res.json({
        ram,
        cpu: { load: cpuLoad, cores: os.cpus().length, snapshot: cpuSnapshot },
        uptime: os.uptime(),
        disk,
        resources: await getResourceUsage({
            pm2Processes: getPm2Snapshot(),
            apps,
            totalMemory: ram.total,
            diskTotal: disk?.total || 0
        })
    });
});

// Get all apps with latest metrics
router.get('/', (req, res) => {
    const apps = db.prepare('SELECT * FROM apps').all();
    
    const appsWithMetrics = apps.map(app => {
        const latestMetrics = db.prepare('SELECT * FROM metrics WHERE app_id = ? ORDER BY timestamp DESC LIMIT 1').get(app.id);
        const trend = db.prepare('SELECT requests, timestamp FROM metrics WHERE app_id = ? ORDER BY timestamp DESC LIMIT 10').all(app.id);
        
        return {
            ...enrichAppStatus(app),
            metrics: latestMetrics || { visitors: 0, requests: 0, attacks: 0 },
            trend: trend.reverse()
        };
    });
    
    res.json(appsWithMetrics);
});

// Add new app
router.post('/', (req, res) => {
    const {
        name, url, pm2_name, log_path, health_port, health_path,
        log_filter, log_host, log_exclude, health_url,
        analytics_enabled, reporting_enabled
    } = req.body;
    
    if (!name) return res.status(400).json({ error: 'App name is required' });
    if (health_url) {
        try {
            const parsedHealthUrl = new URL(health_url);
            if (!['http:', 'https:'].includes(parsedHealthUrl.protocol)) throw new Error('Unsupported protocol');
        } catch (error) {
            return res.status(400).json({ error: 'Health URL must be a valid HTTP or HTTPS URL' });
        }
    }
    
    const info = db.prepare(`
        INSERT INTO apps (
            name, url, pm2_name, log_path, health_port, health_path,
            log_filter, log_host, log_exclude, health_url,
            analytics_enabled, reporting_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        name,
        url || null,
        pm2_name || null,
        log_path || null,
        health_port || null,
        health_path || null,
        log_filter || null,
        log_host || null,
        log_exclude || null,
        health_url || null,
        analytics_enabled === false || analytics_enabled === 0 ? 0 : 1,
        analytics_enabled === false || analytics_enabled === 0 ||
            (reporting_enabled !== true && reporting_enabled !== 1) ? 0 : 1
    );
                   
    res.json({ id: info.lastInsertRowid, message: 'App added successfully' });
});

// Get specific app details
router.get('/:id', (req, res) => {
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    
    const history = db.prepare('SELECT * FROM metrics WHERE app_id = ? ORDER BY timestamp DESC LIMIT 24').all(req.params.id);
    
    res.json({
        ...enrichAppStatus(app),
        history: history.reverse()
    });
});

// GET sampled daily traffic history for charts
router.get('/:id/traffic-history', (req, res) => {
    const app = db.prepare('SELECT id FROM apps WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });

    const requestedDays = Number(req.query.days);
    const days = requestedDays === 30 ? 30 : 7;

    try {
        res.json({
            days,
            timezone: 'Asia/Jerusalem',
            source: 'sampled_metrics',
            buckets: getTrafficHistory(app.id, days)
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
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
    
    // Run PM2 action safely via CLI to prevent socket concurrency crashes (using absolute path and PM2_HOME env)
    const { execFile } = require('child_process');
    execFile('/usr/bin/pm2', [action, app.pm2_name], {
        env: { ...process.env, PM2_HOME: '/root/.pm2' }
    }, (err, stdout, stderr) => {
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
            
            logLines = lines
                .filter((line) => isTargetAppLine(
                    line,
                    app.name,
                    app.log_filter,
                    app.log_host,
                    app.log_exclude
                ))
                .slice(-50);
        } catch (e) {
            logLines = [`Error reading log file: ${e.message}`];
        }
    } else if (app.pm2_name) {
        const homeDir = process.env.HOME || '/root';
        const outLogPath = path.join(homeDir, '.pm2/logs', `${app.pm2_name}-out.log`);
        const errLogPath = path.join(homeDir, '.pm2/logs', `${app.pm2_name}-error.log`);
        
        try {
            let outLogs = fs.existsSync(outLogPath) ? fs.readFileSync(outLogPath, 'utf-8').split('\n') : [];
            let errLogs = fs.existsSync(errLogPath) ? fs.readFileSync(errLogPath, 'utf-8').split('\n') : [];
            logLines = [...outLogs.slice(-25), ...errLogs.slice(-25)].filter(Boolean);
            res.json({ logs: logLines });
        } catch (e) {
            res.json({ logs: [`Error reading PM2 logs: ${e.message}`] });
        }
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
            const logs = veeDb.prepare(`
                SELECT id, phone, message, status, error, created_at
                FROM whatsapp_logs
            `).all().map(row => ({
                ...row,
                status: normalizeWhatsappMessageStatus(row.status)
            }));

            const outbox = veeDb.prepare(`
                SELECT id, to_phone AS phone, message, status, NULL AS error, created_at
                FROM whatsapp_outbox
            `).all().map(row => ({
                ...row,
                status: normalizeWhatsappMessageStatus(row.status)
            }));

            const combined = [...logs, ...outbox].sort((left, right) => {
                const leftTime = new Date(left.created_at || 0).getTime();
                const rightTime = new Date(right.created_at || 0).getTime();
                if (rightTime !== leftTime) return rightTime - leftTime;
                return Number(right.id || 0) - Number(left.id || 0);
            }).slice(0, 100);

            veeDb.close();
            return res.json({ is_whatsapp: true, visitors: combined });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: `Failed to query WhatsApp database: ${e.message}` });
        }
    }
    
    if (!app.log_path || !fs.existsSync(app.log_path)) {
        return res.json({ is_whatsapp: false, visitors: [] });
    }
    
    try {
        const visitors = getRecentVisitors(
            app.log_path,
            app.name,
            app.log_filter,
            app.log_host,
            app.log_exclude,
            100
        );
        res.json({ is_whatsapp: false, visitors });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// GET grouped unique visitors for app
router.get('/:id/unique-visitors', (req, res) => {
    const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });

    if (app.pm2_name === 'vee-whatsapp-worker') {
        return res.json({
            is_whatsapp: true,
            summary: {
                total_unique: 0,
                candidate_unique: 0,
                bot_unique: 0,
                mixed_unique: 0,
                total_requests: 0,
                candidate_requests: 0,
                bot_requests: 0
            },
            visitors: []
        });
    }

    if (!app.log_path || !fs.existsSync(app.log_path)) {
        return res.json({
            is_whatsapp: false,
            summary: {
                total_unique: 0,
                candidate_unique: 0,
                bot_unique: 0,
                mixed_unique: 0,
                total_requests: 0,
                candidate_requests: 0,
                bot_requests: 0
            },
            visitors: []
        });
    }

    try {
        const uniqueVisitors = getUniqueVisitors(
            app.log_path,
            app.name,
            app.log_filter,
            app.log_host,
            app.log_exclude,
            250
        );
        res.json({ is_whatsapp: false, ...uniqueVisitors });
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
        let statusData = { status: 'UNKNOWN', qr: null, updatedAt: null };
        
        if (fs.existsSync(WHATSAPP_STATUS_PATH)) {
            try {
                statusData = normalizeWhatsappStatus(JSON.parse(fs.readFileSync(WHATSAPP_STATUS_PATH, 'utf8')));
            } catch (e) {
                console.error('Failed to parse whatsapp_status.json:', e.message);
            }
        }
        
        const isOnline = getLivePm2Metrics(app.pm2_name).status === 'online';
        const hasActiveWhatsAppState = ['INITIALIZING', 'NEEDS_SCAN', 'READY'].includes(statusData.status) || !!statusData.qr;

        res.json({
            ...statusData,
            isOnline: isOnline || hasActiveWhatsAppState,
            pm2Online: isOnline
        });
        return;
    }
    
    res.status(400).json({ error: 'This app is not a WhatsApp worker' });
});

module.exports = router;
