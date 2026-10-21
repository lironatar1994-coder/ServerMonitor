/* One-time recovery of a site whose traffic went to its own Nginx log instead of the monitor
   log. Reads `<log>`, `<log>.1` and `<log>.N.gz` (combined format, no host field), adds the
   site host, and ingests only lines before the given cutoff so nothing is counted twice.
   Usage on the server: node ops/backfill-site-log.cjs "<app name>" <log path> <host> <cutoff ISO> */
process.chdir('/root/ServerMonitor/backend');
require(process.cwd() + '/node_modules/dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const db = require(process.cwd() + '/database');
const { ingestBuffer, RETENTION_DAYS } = require(process.cwd() + '/visitorAnalytics');

const [name, logPath, host, cutoffIso] = process.argv.slice(2);
const app = db.prepare('SELECT * FROM apps WHERE name = ?').get(name);
const cutoff = Date.parse(cutoffIso);
if (!app || !logPath || !/^[a-z0-9.-]+$/.test(host || '') || !Number.isFinite(cutoff)) throw new Error('Usage: <app name> <log path> <host> <cutoff ISO>');
const oldest = Date.now() - RETENTION_DAYS * 86400000;
const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const lineTime = (line) => {
    const m = /\[(\d\d)\/(\w{3})\/(\d{4}):(\d\d):(\d\d):(\d\d) ([+-])(\d\d)(\d\d)\]/.exec(line);
    if (!m) return NaN;
    const offset = (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9]));
    return Date.UTC(+m[3], months[m[2]], +m[1], +m[4], +m[5], +m[6]) - offset * 60000;
};

const dir = path.dirname(logPath);
const base = path.basename(logPath);
const files = fs.readdirSync(dir).filter((file) => file === base || new RegExp(`^${base.replace(/\./g, '\\.')}\\.\\d+(\\.gz)?$`).test(file));
let inserted = 0, lines = 0;
for (const file of files) {
    const full = path.join(dir, file);
    const raw = fs.readFileSync(full);
    const text = (file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8');
    const kept = text.split('\n').filter((line) => {
        const time = lineTime(line);
        // Skip lines that already carry a host field (three trailing quoted values).
        return line && time < cutoff && time >= oldest && !/"[^"]*" "[^"]*" "[^"]*"\s*$/.test(line);
    }).map((line) => `${line} "${host}"`);
    lines += kept.length;
    const stat = fs.statSync(full);
    // A distinct source identity per original file keeps the backfill idempotent.
    inserted += ingestBuffer(app, Buffer.from(kept.join('\n') + '\n'), `backfill:${host}:${file}:${stat.ino}`, 0).inserted;
}
console.log(JSON.stringify({ app: app.name, files: files.length, lines, inserted }));
db.close();
