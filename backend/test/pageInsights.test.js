const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-page-'));
process.env.NODE_ENV = 'test';
process.env.MONITOR_DB_PATH = path.join(temp, 'test.db');
process.env.VISITOR_SIGNAL_KEY = 'page-insight-test-key';
const db = require('../database');
const { getPageInsights } = require('../pageInsights');
const { recordGrowthSignal } = require('../growthSignals');
const { recordEngagementSignal } = require('../browserSignals');
const { getEngagement } = require('../routes/visitorAnalytics');
const growth = require('../clientGrowth');
const app = db.prepare("SELECT * FROM apps WHERE name='LA webs'").get();
const range = { from: '2000-01-01T00:00:00.000Z', to: '2100-01-01T00:00:00.000Z' };
test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
const session = crypto.randomUUID();
let offset = 0;
function event(type, page, extras = {}, site = app) {
  const body = { event_id: crypto.randomUUID(), visitor_id: session, session_id: session, path: page, event_type: type, ...extras };
  recordGrowthSignal({ body, ip: '1.2.3.4', userAgent: 'Mozilla/5.0', siteUrl: site.url });
  db.prepare('UPDATE growth_events SET occurred_at=? WHERE event_id=?').run(new Date(Date.now() - 60000 + offset++ * 1000).toISOString(), body.event_id);
  return body;
}
test('page drill-down follows ordered visits, excludes prior actions, bots and other sites', () => {
  event('contact_click', '/', { label: 'phone' });
  event('page_view', '/work/miryam/');
  event('page_view', '/work/libi/');
  event('contact_click', '/', { label: 'whatsapp', placement: 'footer', project: 'miryam' });
  event('contact_click', '/work/miryam/', { label: 'phone', webdriver: true });
  event('contact_click', '/work/miryam/', { label: 'email' }, db.prepare("SELECT * FROM apps WHERE name='Miryam Zelig'").get());
  const result = getPageInsights(app, range, '/work/miryam/');
  assert.equal(result.visits, 1); assert.equal(result.contact_visits, 1);
  assert.equal(result.actions.length, 1); assert.equal(result.actions[0].label, 'whatsapp');
  assert.deepEqual(result.next, [{ path: '/work/libi/', transitions: 1, visits: 1 }]);
  assert.equal(result.low_sample, true);
  assert.throws(() => getPageInsights(app, range, '//outside.example'), /Invalid/);
  assert.equal(getPageInsights(app, range, '/work/pdf/').visits, 0);
});
test('portfolio action dimensions are allow-listed and a lead remains a separate manual outcome', () => {
  const row = event('outbound_click', '/work/miryam/', { project: 'private name', placement: 'private text' });
  const stored = db.prepare('SELECT project,placement FROM growth_events WHERE event_id=?').get(row.event_id);
  assert.deepEqual(stored, { project: '', placement: '' });
  assert.equal(growth.metrics(app.id, range.from, range.to).lead_received, 0);
  const lead = growth.save(app.id, 'leads', null, { reference: 'test-reference', status: 'contacted' }, 'test');
  assert.equal(growth.save(app.id, 'leads', lead.id, { status: 'qualified' }, 'test').status, 'qualified');
  assert.equal(growth.overview({}).sites.find(s => s.id === app.id).open_leads, 1);
});
test('portfolio engagement sums active-time deltas and uses max scroll per visit/page', () => {
  for (const [dwell, depth] of [[15000, 25], [12000, 80]]) recordEngagementSignal({
    body: { event_id: crypto.randomUUID(), visitor_id: session, session_id: session, path: '/work/miryam/', scroll_depth: depth, dwell_ms: dwell },
    ip: '1.2.3.4', userAgent: 'Mozilla/5.0', siteUrl: app.url
  });
  const summary = getEngagement(app, range);
  assert.equal(summary.engagement_samples, 1); assert.equal(summary.average_dwell_seconds, 27);
  assert.equal(summary.average_scroll_depth, 80); assert.equal(summary.scroll_reach.reached_75, 100);
});
test('history lookups have an IP-leading candidate index', () => {
  const plan = db.prepare('EXPLAIN QUERY PLAN SELECT MIN(occurred_at) FROM visitor_events WHERE ip=? AND is_bot=0 AND is_page_view=1').all('1.2.3.4');
  assert.ok(plan.some(row => row.detail.includes('idx_visitor_candidate_ip_time')));
});
