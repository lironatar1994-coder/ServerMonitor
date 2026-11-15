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
  recordGrowthSignal({ body, ip: '1.2.3.4', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', siteUrl: site.url });
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
    ip: '1.2.3.4', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', siteUrl: app.url
  });
  const summary = getEngagement(app, range);
  assert.equal(summary.engagement_samples, 1); assert.equal(summary.average_dwell_seconds, 27);
  assert.equal(summary.average_scroll_depth, 80); assert.equal(summary.scroll_reach.reached_75, 100);
});
test('history lookups have an IP-leading candidate index', () => {
  const plan = db.prepare('EXPLAIN QUERY PLAN SELECT MIN(occurred_at) FROM visitor_events WHERE ip=? AND is_bot=0 AND is_page_view=1').all('1.2.3.4');
  assert.ok(plan.some(row => row.detail.includes('idx_visitor_candidate_ip_time')));
});

test('page view history identifies returning visits only from earlier same-site browser evidence', () => {
  const site = db.prepare("SELECT * FROM apps WHERE name='Alenu'").get();
  const period = { from: '2026-10-10T10:00:00.000Z', to: '2026-10-10T10:30:00.000Z' };
  const insert = db.prepare(`INSERT INTO browser_signals
    (app_id,event_id,occurred_at,ip,visitor_hash,session_hash,visit_hash,path,user_agent,automation_hint)
    VALUES (?,? ,?,'1.2.3.4',?,'session',?,?,?,?)`);
  let n = 0;
  const open = (minute, visitor, visit, page = '/history', automation = 0, owner = site) => insert.run(owner.id,
    `history-${n++}`, `2026-10-10T${minute}:00.000Z`, visitor, visit, page,
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari/604.1', automation);
  open('09:00', 'returning', 'old-visit', '/other-page');
  open('09:00', 'new', 'bot-visit', '/history', 1);
  open('09:00', 'new', 'internal-visit', '/history', 3);
  open('09:00', 'new', 'other-site-visit', '/history', 0, app);
  open('10:05', 'new', 'first-visit');
  open('10:10', 'new', 'first-visit');
  open('10:20', 'returning', 'next-visit');
  open('10:25', 'legacy', null);
  open('10:30', 'outside', 'excluded-end');
  open('11:00', 'new', 'future-visit');
  open('10:15', 'outside-path', 'unrelated', '/history-other');
  const result = getPageInsights(site, period, '/history');
  assert.equal(result.history.source, 'browser');
  assert.equal(result.history.total, 4);
  assert.deepEqual(result.history.rows.map(row => row.returning), [null, true, false, false]);
  assert.equal(result.history.rows[0].occurred_at, '2026-10-10T10:25:00.000Z');
  assert.ok(result.history.rows.every(row => row.device === 'Mobile'));
  assert.ok(result.history.rows.every(row => !('ip' in row) && !('visitor_hash' in row) && !('user_agent' in row)));
});

test('server-only page history is exact-page, filtered, paginated and never claims returning identities', () => {
  const site = db.prepare("SELECT * FROM apps WHERE name='Alenu Miluim'").get();
  const period = { from: '2026-10-11T10:00:00.000Z', to: '2026-10-11T11:00:00.000Z' };
  const insert = db.prepare(`INSERT INTO visitor_events
    (app_id,source_file_id,source_offset,occurred_at,ip,path,status,is_bot,is_page_view,device_type)
    VALUES (?,'page-history',? ,?,'1.2.3.4',?,200,?,?,'Desktop')`);
  for (let i = 0; i < 23; i++) insert.run(site.id, i, '2026-10-11T10:15:00.000Z', '/miluim-guide', 0, 1);
  insert.run(site.id, 23, '2026-10-11T10:15:00.000Z', '/miluim-guide', 1, 1);
  insert.run(site.id, 24, '2026-10-11T10:15:00.000Z', '/miluim-guide', 0, 0);
  insert.run(site.id, 25, '2026-10-11T10:15:00.000Z', '/miluim-guide-other', 0, 1);
  insert.run(site.id, 26, period.to, '/miluim-guide', 0, 1);
  insert.run(app.id, 27, '2026-10-11T10:15:00.000Z', '/miluim-guide', 0, 1);
  const first = getPageInsights(site, period, '/miluim-guide');
  assert.equal(first.log.views, 23);
  assert.equal(first.history.source, 'server');
  assert.equal(first.history.total, 23);
  assert.equal(first.history.rows.length, 20);
  assert.equal(first.history.has_more, true);
  assert.ok(first.history.rows.every(row => row.returning === null && !('ip' in row)));
  const second = getPageInsights(site, period, '/miluim-guide', { historySource: 'server', historyPage: 2 }).history;
  assert.equal(second.rows.length, 3);
  assert.equal(second.has_more, false);
  assert.ok(second.rows.every(row => !first.history.rows.some(old => old.id === row.id)));
  assert.equal(getPageInsights(site, period, '/miluim-guide', { historyPage: 999 }).history.page, 2);
  assert.equal(getPageInsights(site, period, '/miluim-guide', { historySource: 'browser' }).history.total, 0);
});
