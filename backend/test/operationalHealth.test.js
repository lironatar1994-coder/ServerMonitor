const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOperationalHealth } = require('../operationalHealth');
const now = Date.UTC(2026, 9, 7, 19);
const base = { now, health: { checked: now / 1000, errors: [], warnings: [] }, browser: { checked: now, errors: [] }, backup: { completed: now / 1000, files: { 'db.sqlite': {} } } };

test('health distinguishes missing monitoring coverage, stopped alert delivery and worker connection state', () => {
  const status = buildOperationalHealth({ ...base, apps: [{id:3,name:'Seder WhatsApp',status:'online',pm2_name:'seder-whatsapp'}], discovered: { rows:[{unit:'cv-manager.service',name:'CV Manager'}] }, whatsapp: {status:'DISCONNECTED',updatedAt:new Date(now).toISOString(),qr:'must-never-be-exposed',phone:'private'}, alertsConfigured:false });
  assert.deepEqual(status.issues.map(item => item.id),['alert-delivery','seder-whatsapp','coverage']);
  assert.equal(status.status,'attention');
  assert.equal(status.issues.find(item=>item.id==='seder-whatsapp').appId,3);
  assert.equal(JSON.stringify(status).includes('must-never-be-exposed'),false);
  assert.equal(JSON.stringify(status).includes('private'),false);
});
test('stale or missing health never becomes a healthy empty response', () => {
  const status=buildOperationalHealth({...base,health:{checked:(now-31*60000)/1000,errors:[]},browser:null,backup:null});
  assert.equal(status.status,'unknown');
  assert.equal(status.checks.health.status,'unknown');
  assert.equal(status.checks.browser.status,'unknown');
  assert.equal(status.checks.backup.status,'failed');
  assert.ok(status.issues.some(item=>item.id==='backup'));
});
test('registered services and a recent connected worker do not create false gaps', () => {
  const status=buildOperationalHealth({...base,apps:[{id:3,name:'Seder',status:'online',pm2_name:'seder-whatsapp'},{id:4,status:'online',systemd_unit:'cv-manager.service'}],discovered:{rows:[{unit:'cv-manager.service',name:'CV Manager'}]},whatsapp:{status:'READY',updatedAt:new Date(now).toISOString()}});
  assert.equal(status.status,'ok');assert.deepEqual(status.issues,[]);
  const stale=buildOperationalHealth({...base,apps:[{id:3,status:'online',pm2_name:'seder-whatsapp'}],whatsapp:{status:'READY',updatedAt:new Date(now-4*60000).toISOString()}});
  assert.equal(stale.issues[0].severity,'unknown');
});
test('legacy application destinations retain exact dates and reject unsafe return paths', async () => {
  const {safeReturnPath,legacyAppDestination}=await import('../../frontend/src/lib/reportNavigation.js');
  const query='?from=2026-10-01T00%3A00%3A00.000Z&to=2026-10-02T00%3A00%3A00.000Z';
  assert.equal(legacyAppDestination({id:19,analytics_enabled:1},query),'/visitors/19'+query);
  assert.equal(legacyAppDestination({id:30,analytics_enabled:0},query),'/services/30'+query);
  assert.equal(safeReturnPath('/app/19'+query),'/app/19'+query);
  assert.equal(safeReturnPath('/server'+query),'/server'+query);
  assert.equal(safeReturnPath('//evil.example'),'\/visitors');
});
test('a stale or missing PC backup copy is a warning, an unreadable check is not', () => {
  const stale = buildOperationalHealth({ ...base, pcCopiedAt: now / 1000 - 3 * 86400 });
  assert.equal(stale.issues.find(item => item.id === 'backup-pc')?.severity, 'warning');
  assert.ok(buildOperationalHealth({ ...base, pcCopiedAt: null }).issues.some(item => item.id === 'backup-pc'));
  assert.equal(buildOperationalHealth({ ...base, pcCopiedAt: now / 1000 - 3600 }).issues.some(item => item.id === 'backup-pc'), false);
  assert.equal(buildOperationalHealth({ ...base }).issues.some(item => item.id === 'backup-pc'), false);
});
test('browser-check issues name failing sites and keep checker faults a warning', () => {
  const issue = (browser) => buildOperationalHealth({ ...base, browser: { checked: now, ...browser } }).issues.find(item => item.id === 'browser-check');
  const sites = issue({ errors: ['a'], failures: [{ check: 'site-browser-signal-Alenu', area: 'site', site: 'Alenu' }] });
  assert.equal(sites.severity, 'error'); assert.equal(sites.detail, 'Alenu');
  assert.equal(issue({ errors: ['a'], failures: [{ check: 'monitor-390/visitors', area: 'monitor', site: null }] }).severity, 'error');
  assert.equal(issue({ errors: ['a'], failures: [{ check: 'runner', area: 'checker', site: null }] }).severity, 'warning');
  assert.equal(issue({ errors: [] }), undefined);
});
test('the off-server watchdog is visible when missing or silent', () => {
  const issue = (heartbeat) => buildOperationalHealth({ ...base, heartbeat }).issues.find(item => item.id === 'heartbeat');
  assert.equal(issue({ configured: false }).severity, 'warning');
  assert.equal(issue({ configured: true, at: now - 40 * 60000, error: 'HTTP 404' }).severity, 'error');
  assert.equal(issue({ configured: true, at: null, error: null }).severity, 'warning');
  assert.equal(issue({ configured: true, at: now - 5 * 60000, error: null }), undefined);
  assert.equal(issue(undefined), undefined);
});
