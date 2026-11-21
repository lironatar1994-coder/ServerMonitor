const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-alenu-'));
process.env.NODE_ENV = 'test';
process.env.MONITOR_DB_PATH = path.join(temp, 'monitor.db');
process.env.VISITOR_SIGNAL_KEY = 'test-alenu-journey';
const db = require('../database');
const { recordBrowserSignal } = require('../browserSignals');
const { recordGrowthSignal } = require('../growthSignals');
const { alenuJourneySummary } = require('../alenuJourney');
const { browserHistory } = require('../browserVisitors');
const app = db.prepare("SELECT * FROM apps WHERE name='Alenu'").get();
const siteUrl = app.url;
const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const range = { from: new Date(Date.now() - 60000).toISOString(), to: new Date(Date.now() + 60000).toISOString() };
const ids = () => ({ visitor_id: randomUUID(), session_id: randomUUID() });
function mark(identity, pathname, label, options = {}) {
    return recordGrowthSignal({ ip: '1.2.3.4', userAgent, siteUrl: options.siteUrl || siteUrl, body: {
        ...identity, event_id: randomUUID(), navigation_session_id: identity.session_id,
        event_type: 'alenu_journey', path: pathname, label, webdriver: options.webdriver === true
    } });
}
test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('Alenu journey keeps measured milestones and last actions anonymous and scoped', () => {
    const stopped = ids();
    mark(stopped, '/', 'landing-open'); // The initial action can reach the server ahead of navigation.
    recordBrowserSignal({ ip: '1.2.3.4', userAgent, siteUrl, body: { ...stopped, event_id: randomUUID(), path: '/' } });
    recordBrowserSignal({ ip: '1.2.3.4', userAgent, siteUrl, body: { ...stopped, event_id: randomUUID(), path: '/start' } });
    mark(stopped, '/start', 'selection-open');
    mark(stopped, '/start', 'details-open');
    mark(stopped, '/start', 'edit-phone');
    const done = ids();
    mark(done, '/start', 'selection-open');
    mark(done, '/start', 'details-open');
    mark(done, '/start', 'crm-sending');
    mark(done, '/start', 'crm-received');
    const invalid = ids();
    mark(invalid, '/start', 'selection-open');
    mark(invalid, '/start', 'details-open');
    mark(invalid, '/start', 'invalid-phone');
    mark(ids(), '/', 'landing-open', { webdriver: true });
    assert.throws(() => mark(ids(), '/start', '0501234567'), /Invalid Alenu journey action/);
    assert.throws(() => mark(ids(), '/alenu-crm/form/demo', 'details-open'), /Invalid Alenu journey action/);
    assert.throws(() => mark(ids(), '/', 'landing-open', { siteUrl: 'https://lawebs.co.il/' }), /Invalid Alenu journey action/);
    assert.deepEqual(alenuJourneySummary(app, range).stages, [
        { stage: 1, reached: 1, furthest: 0 }, { stage: 2, reached: 3, furthest: 0 },
        { stage: 3, reached: 3, furthest: 1 }, { stage: 4, reached: 2, furthest: 1 }, { stage: 5, reached: 1, furthest: 1 }
    ]);
    const visitor = db.prepare('SELECT visitor_hash FROM browser_signals WHERE app_id=? LIMIT 1').get(app.id).visitor_hash;
    const [visit] = browserHistory(app, range, { visitor }).visits;
    assert.deepEqual(visit.actions.map(action => action.label), ['landing-open', 'selection-open', 'details-open', 'edit-phone']);
    assert.equal(visit.last_journey_stage.label, 'details-open');
    assert.equal(visit.last_journey_action.label, 'edit-phone');
});
