const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-alerts-'));
process.env.MONITOR_DB_PATH = path.join(temp, 'test.db');
process.env.NODE_ENV = 'test';
const { renderAlert, sendAlertEmail } = require('../alerts');

test.after(() => { require('../database').close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('renders one escaped Hebrew alert with service links and reminders', () => {
    const alert = renderAlert([
        { id: 4, name: 'Desk <b>', status: 'offline', kind: 'down', reminder: true },
        { id: 5, name: 'Seder', kind: 'up' }
    ], new Date('2026-10-21T08:00:00Z'));
    assert.equal(alert.subject, 'לא זמין: Desk <b> · חזר לפעול: Seder');
    assert.match(alert.html, /Desk &lt;b&gt;/);
    assert.doesNotMatch(alert.html, /Desk <b>/);
    assert.match(alert.text, /Desk <b>: לא פועל \(עדיין\) — https:\/\/monitor\.vee-app\.co\.il\/serve-monitor\/services\/4/);
    assert.match(alert.text, /Seder: חזר לפעול/);
});

test('reports an unconfigured mailer as undelivered instead of throwing', async () => {
    delete process.env.RESEND_API_KEY;
    assert.deepEqual(await sendAlertEmail([{ id: 1, name: 'Desk', status: 'offline', kind: 'down' }]), { sent: false });
});
