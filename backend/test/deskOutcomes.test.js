const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'desk-source-'));
process.env.NODE_ENV='test';process.env.MONITOR_DB_PATH=path.join(temp,'monitor.db');process.env.VISITOR_SIGNAL_KEY='fixture-only-key';
const db=require('../database'),{syncDeskOutcomes}=require('../deskOutcomes');
test.after(()=>{db.close();fs.rmSync(temp,{recursive:true,force:true});});
test('Desk source receipt hashes the shared session per site and keeps stale data explicit',async()=>{
 const file=path.join(temp,'outcomes.json'),session='anonymous_session_123456',id='a'.repeat(64),at=new Date().toISOString();
 fs.writeFileSync(file,JSON.stringify({generated_at:at,rows:[{id,site:'alenu',at,stage:'received',name:'must-not-import',attribution:{current:{source:'facebook',campaign:'launch',content:'pinned',evidence:'tagged'},navigation_session_id:session}}]}));
 await syncDeskOutcomes(db,file);
 const row=db.prepare('SELECT * FROM source_outcomes WHERE id=?').get(id);
 assert.equal(row.content,'pinned');assert.equal(row.stage,'received');
 assert.equal(row.browser_session_hash,crypto.createHmac('sha256',process.env.VISITOR_SIGNAL_KEY).update(`${row.app_id}:${session}`).digest('hex'));
 assert.ok(!JSON.stringify(row).includes('must-not-import'));assert.ok(!JSON.stringify(row).includes(session));
 await syncDeskOutcomes(db,path.join(temp,'missing'));
 assert.equal(JSON.parse(db.prepare("SELECT value FROM monitor_metadata WHERE key='desk-outcomes'").get().value).status,'unavailable');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM source_outcomes').get().n,1,'unavailable export retains last data without declaring it current');
});
