const os = require('os');
const fs = require('fs');
const db = require('./database');
const child_process = require('child_process');

console.log('Background Monitor Started...');

const monitorInterval = 10 * 1000; // 10 seconds for demo/dev, usually 1 minute

function parseNginxLog(logPath) {
    if (!logPath) return { requests: 0, attacks: 0, visitors: 0 };
    
    try {
        let logData = '';
        
        // If we are on Windows, we SSH into the server to get the logs
        if (process.platform === 'win32') {
            const sshCmd = `ssh root@vee-app.co.il "tail -n 100 ${logPath}"`;
            logData = child_process.execSync(sshCmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        } else {
            // If deployed on the Linux server, read directly
            if (!fs.existsSync(logPath)) return { requests: 0, attacks: 0, visitors: 0 };
            const tailCmd = `tail -n 100 ${logPath}`;
            logData = child_process.execSync(tailCmd, { encoding: 'utf-8' });
        }

        const lines = logData.split('\\n').filter(l => l.trim().length > 0);
        
        let attacks = 0;
        const ips = new Set();
        
        lines.forEach(line => {
            const ipMatch = line.match(/^(\\d+\\.\\d+\\.\\d+\\.\\d+)/);
            if (ipMatch) ips.add(ipMatch[1]);
            
            // Basic attack heuristic
            if (line.includes('PROPFIND') || line.includes('sql') || line.includes('eval(')) {
                attacks++;
            }
        });
        
        return {
            requests: lines.length,
            attacks: attacks,
            visitors: ips.size
        };
    } catch (error) {
        console.error('Error parsing log:', error.message);
        return { requests: 0, attacks: 0, visitors: 0 };
    }
}

function checkPm2Status(pm2Name) {
    try {
        let cmd = '';
        if (process.platform === 'win32') {
            cmd = `ssh root@vee-app.co.il "pm2 jlist"`;
        } else {
            cmd = `pm2 jlist`;
        }
        
        const output = child_process.execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        const pm2List = JSON.parse(output);
        const processInfo = pm2List.find(p => p.name === pm2Name);
        
        return processInfo && processInfo.pm2_env.status === 'online' ? 'online' : 'offline';
    } catch (e) {
        return 'offline';
    }
}

setInterval(() => {
    const apps = db.prepare('SELECT * FROM apps').all();
    
    apps.forEach(app => {
        let status = 'online'; // Default assumption if no check specified
        let metrics = { visitors: 0, requests: 0, attacks: 0 };
        
        // 1. Check PM2 status if configured
        if (app.pm2_name) {
            status = checkPm2Status(app.pm2_name);
        }
        
        // 2. Parse logs if configured
        if (app.log_path) {
            metrics = parseNginxLog(app.log_path);
        } else {
            // Mock data for demonstration if no log path provided
            metrics.requests = Math.floor(Math.random() * 50);
            metrics.visitors = Math.floor(Math.random() * 10);
            metrics.attacks = Math.random() > 0.9 ? 1 : 0;
        }
        
        // Save to DB
        db.prepare('UPDATE apps SET status = ?, last_checked = CURRENT_TIMESTAMP WHERE id = ?').run(status, app.id);
        db.prepare('INSERT INTO metrics (app_id, visitors, requests, attacks, cpu_usage, ram_usage) VALUES (?, ?, ?, ?, ?, ?)')
          .run(app.id, metrics.visitors, metrics.requests, metrics.attacks, os.loadavg()[0], os.freemem() / os.totalmem());
    });
    
}, monitorInterval);
