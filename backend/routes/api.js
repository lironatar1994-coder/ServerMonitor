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
    
    const pm2 = require('pm2');
    pm2.connect((err) => {
        if (err) return res.status(500).json({ error: 'Failed to connect to PM2' });
        
        const callback = (err2) => {
            pm2.disconnect();
            if (err2) {
                return res.status(500).json({ error: `PM2 action ${action} failed: ${err2.message}` });
            }
            res.json({ message: `App ${app.name} (${action}) executed successfully` });
        };
        
        if (action === 'restart') {
            pm2.restart(app.pm2_name, callback);
        } else if (action === 'stop') {
            pm2.stop(app.pm2_name, callback);
        } else if (action === 'start') {
            pm2.start(app.pm2_name, callback);
        }
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

module.exports = router;
