const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOperationalHealth } = require('../operationalHealth');
const now = Date.UTC(2026, 9, 7, 19);
const base = { now, health: { checked: now / 1000, errors: [], warnings: [] }, browser: { checked: now, errors: [] }, backup: { completed: now / 1000, files: { 'db.sqlite': {} } } };

test('health distinguishes missing monitoring coverage, stopped alert delivery and worker connection state', () => {
  const status = buildOperationalHealth({ ...base, apps: [{id:2,name:'Legacy sender',status:'offline',pm2_name:'vee-whatsapp-worker',alerts_enabled:0},{id:3,name:'Seder WhatsApp',status:'online',pm2_name:'seder-whatsapp'}], discovered: { rows:[{unit:'cv-manager.service',name:'CV Manager'}] }, whatsapp: {status:'DISCONNECTED',updatedAt:new Date(now).toISOString(),qr:'must-never-be-exposed',phone:'private'}, pendingMessages:8922 });
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
