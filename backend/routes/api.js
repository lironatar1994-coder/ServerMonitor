const express = require('express');
const db = require('../database');
const { authenticateToken } = require('./auth');
const os = require('os');

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
    const { name, url, pm2_name, log_path } = req.body;
    
    if (!name) return res.status(400).json({ error: 'App name is required' });
    
    const info = db.prepare('INSERT INTO apps (name, url, pm2_name, log_path) VALUES (?, ?, ?, ?)')
                   .run(name, url || null, pm2_name || null, log_path || null);
                   
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

module.exports = router;
