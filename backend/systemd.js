const { execFileSync } = require('child_process');
const UNIT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.@-]*\.service$/;
let cache = { key: '', time: 0, rows: [] };

function parseSystemdSnapshot(output) {
    return String(output).trim().split(/\n\s*\n/).filter(Boolean).map((block) => {
        const fields = Object.fromEntries(block.split('\n').map((line) => {
            const index = line.indexOf('=');
            return [line.slice(0, index), line.slice(index + 1)];
        }));
        return { name: fields.Id, systemd_unit: fields.Id, pid: Number(fields.MainPID) || 0,
            status: fields.LoadState === 'loaded' && fields.ActiveState === 'active' && Number(fields.MainPID) > 0 ? 'online' : 'offline',
            memory: Number(fields.MemoryCurrent) || 0 };
    }).filter((row) => UNIT_PATTERN.test(row.systemd_unit));
}

function getSystemdSnapshot(apps, force = false) {
    const units = [...new Set(apps.map((app) => app.systemd_unit).filter((unit) => UNIT_PATTERN.test(unit)))].sort();
    if (!units.length || process.platform !== 'linux') return [];
    const key = units.join(',');
    if (!force && key === cache.key && Date.now() - cache.time < 5000) return cache.rows;
    let rows;
    try {
        rows = parseSystemdSnapshot(execFileSync('/usr/bin/systemctl', ['show', ...units,
            '--property=Id,LoadState,ActiveState,MainPID,MemoryCurrent'], { encoding: 'utf8', timeout: 3000, maxBuffer: 128 * 1024 }));
    } catch {
        rows = units.map((unit) => ({ name: unit, systemd_unit: unit, pid: 0, status: 'unknown', memory: 0 }));
    }
    cache = { key, time: Date.now(), rows };
    return rows;
}

module.exports = { UNIT_PATTERN, parseSystemdSnapshot, getSystemdSnapshot };
