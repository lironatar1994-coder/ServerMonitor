// The Desk-owned export contains only anonymous source tags and business stages.
const fs = require('node:fs/promises');
async function syncDeskOutcomes(db, file = '/var/lib/desk/attribution-outcomes.json') {
    const now = new Date().toISOString();
    try {
        if ((await fs.stat(file)).size > 2 * 1024 * 1024) throw new Error('oversized');
        const data = JSON.parse(await fs.readFile(file, 'utf8'));
        if (!Array.isArray(data.rows) || data.rows.length > 1000 || !Number.isFinite(Date.parse(data.generated_at))) throw new Error('invalid');
        const insert = db.prepare('INSERT OR REPLACE INTO source_outcomes(id,app_id,occurred_at,source,medium,campaign,content,evidence,stage,first_source,latest_source,browser_session_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
        const tag = v => typeof v === 'string' && /^[\p{L}\p{N}_. -]{1,80}$/u.test(v) ? v : '';
        db.transaction(() => {
            db.prepare('DELETE FROM source_outcomes').run();
            for (const row of data.rows) {
                // Alenu's reserve-duty pages are their own site; an inquiry belongs to whichever measured the visit.
                const names = { alenu: ['Alenu', 'Alenu Miluim'], cv: ['Mila Tova CV'] }[row.site] || [];
                const apps = names.map((name) => db.prepare('SELECT id FROM apps WHERE name=?').get(name)).filter(Boolean);
                if (!apps.length || !/^[a-f0-9]{64}$/.test(row.id) || !Number.isFinite(Date.parse(row.at)) || !['submitted','received','qualified','customer','lost'].includes(row.stage)) continue;
                const a = row.attribution?.current || {};
                const session = row.attribution?.navigation_session_id || '';
                const key = require('./browserSignals').getSignalKey();
                const hashFor = (id) => key && /^[A-Za-z0-9_-]{16,96}$/.test(session) ? require('node:crypto').createHmac('sha256',key).update(`${id}:${session}`).digest('hex') : '';
                const app = apps.find((candidate) => hashFor(candidate.id)
                    && db.prepare('SELECT 1 FROM browser_signals WHERE app_id=? AND session_hash=? LIMIT 1').get(candidate.id, hashFor(candidate.id))) || apps[0];
                const hash = hashFor(app.id);
                insert.run(row.id, app.id, row.at, tag(a.source), tag(a.medium), tag(a.campaign), tag(a.content), tag(a.evidence), row.stage,
                    tag(row.attribution?.first?.source), tag(row.attribution?.latest?.source),hash);
            }
        })();
        db.prepare('INSERT OR REPLACE INTO monitor_metadata(key,value,updated_at) VALUES(?,?,?)').run('desk-outcomes', JSON.stringify({ status: 'ok', generated_at: data.generated_at, checked_at: now }), now);
    } catch {
        db.prepare('INSERT OR REPLACE INTO monitor_metadata(key,value,updated_at) VALUES(?,?,?)').run('desk-outcomes', JSON.stringify({ status: 'unavailable', checked_at: now }), now);
    }
}
module.exports = { syncDeskOutcomes };
