/* Isolated Google Authenticator enrollment/recovery review. No production accounts. */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-auth-review-'));
process.env.MONITOR_DB_PATH = path.join(temp, 'monitor.db');
process.env.AUTH_KEY_FILE = path.join(temp, 'auth.key');
process.env.NODE_ENV = 'test'; process.env.VAULT_ENABLED = 'true';
const db = require('../backend/database'), security = require('../backend/security');
const { chromium } = require('../backend/node_modules/playwright');
const decode = require('../backend/node_modules/jsqr');
security.initSecurity(db);
const out = path.resolve(__dirname, '../.impeccable/review/auth');
fs.mkdirSync(out, { recursive: true });
let browser, server;
const results = [], pass = name => { results.push({name,ok:true}); console.log('PASS',name); };
(async () => {
  const username = 'synthetic-google-user', password = 'Synthetic login passphrase 2026!';
  const userId = Number(db.prepare('INSERT INTO users(username,password,role) VALUES (?,?,?)').run(username, await security.passwordHash(password), 'owner').lastInsertRowid);
  server = require('../backend/server').listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  const base = `http://127.0.0.1:${server.address().port}/serve-monitor`;
  browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror',e=>errors.push(e.message));
  const external = [];
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith('http') && new URL(url).origin!==new URL(base).origin){external.push(new URL(url).origin);return route.abort();}
    return route.continue();
  });
  const target='/visitors?from=2026-10-07T00%3A00%3A00.000Z&to=2026-10-08T00%3A00%3A00.000Z';
  const login=base+'/login?returnTo='+encodeURIComponent(target);
  await page.goto(login);
  await page.getByLabel('שם משתמש',{exact:true}).fill(username);
  await page.getByLabel('סיסמה',{exact:true}).fill(password);
  await page.getByRole('button',{name:'כניסה',exact:true}).click();
  const qr = page.getByRole('img',{name:'קוד QR לחיבור חשבון Server Monitor ל־Google Authenticator'});
  await qr.waitFor();
  const pixels=await qr.evaluate(img=>{
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    return {data:Array.from(ctx.getImageData(0,0,canvas.width,canvas.height).data),width:canvas.width,height:canvas.height};
  });
  const decoded=decode(Uint8ClampedArray.from(pixels.data),pixels.width,pixels.height);
  assert.ok(decoded,'rendered QR must decode');
  const otp=security.OTPAuth.URI.parse(decoded.data);
  assert.equal(otp.issuer,'Server Monitor');assert.equal(otp.label,username);
  assert.equal(otp.digits,6);assert.equal(otp.period,30);assert.equal(otp.algorithm,'SHA1');
  assert.equal(otp.secret.base32,security.unseal(db.prepare('SELECT mfa_pending FROM users WHERE id=?').get(userId).mfa_pending));
  assert.deepEqual(external,[]);pass('actual local QR decodes to Google-compatible TOTP; no external secret transmission');
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(out,`enroll-${width}.png`),fullPage:true});
  }
  await page.getByText('באותו טלפון או בלי סריקה?',{exact:true}).click();
  assert.equal((await page.locator('.setup-secret').innerText()).trim(),otp.secret.base32);
  await page.getByRole('button',{name:'העתקת מפתח',exact:true}).click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),otp.secret.base32);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'manual-320.png'),fullPage:true});
  pass('desktop/mobile QR and same-phone manual setup with copied key');
  await page.reload();await qr.waitFor();
  assert.equal(security.unseal(db.prepare('SELECT mfa_pending FROM users WHERE id=?').get(userId).mfa_pending),otp.secret.base32);
  pass('refresh preserves the scanned setup key');
  await page.route('**/api/auth/mfa/setup',r=>r.fulfill({status:503,json:{error:'לא ניתן להכין את החיבור כרגע.'}}));
  await page.reload();await page.getByRole('button',{name:'ניסיון נוסף',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'setup-failed-320.png'),fullPage:true});
  await page.unroute('**/api/auth/mfa/setup');
  await page.getByRole('button',{name:'ניסיון נוסף',exact:true}).click();await qr.waitFor();
  pass('setup failure is recoverable without changing key');
  await page.getByLabel('קוד בן 6 ספרות',{exact:true}).fill(otp.generate());
  await page.getByRole('button',{name:'חיבור והמשך',exact:true}).click();
  await page.getByRole('heading',{name:'הטלפון חובר',exact:true}).waitFor();
  assert.equal(await qr.count(),0);assert.equal(await page.locator('.setup-secret').count(),0);
  const codes=(await page.locator('.recovery-codes').innerText()).trim().split('\n');assert.equal(codes.length,8);
  assert.equal(await page.getByRole('button',{name:'סיום וכניסה',exact:true}).isEnabled(),false);
  const downloadWait=page.waitForEvent('download');await page.getByRole('button',{name:'הורדת קובץ',exact:true}).click();
  const download=await downloadWait;assert.equal(download.suggestedFilename(),'server-monitor-backup-codes.txt');
  const downloaded=fs.readFileSync(await download.path(),'utf8');for(const code of codes)assert.ok(downloaded.includes(code));
  await page.getByRole('button',{name:'העתקת קודים',exact:true}).click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),codes.join('\n'));
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(out,`backup-save-${width}.png`),fullPage:true});
  }
  await page.getByLabel('שמרתי את הקודים במקום בטוח',{exact:true}).check();
  await page.getByRole('button',{name:'סיום וכניסה',exact:true}).click();
  await page.getByRole('heading',{name:'אתרים',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('from'),'2026-10-07T00:00:00.000Z');
  pass('real enrollment, backup download/copy, explicit saving and intended destination');
  const signIn=async()=>{
    await context.clearCookies();await page.goto(login);
    await page.getByLabel('שם משתמש',{exact:true}).fill(username);await page.getByLabel('סיסמה',{exact:true}).fill(password);
    await page.getByRole('button',{name:'כניסה',exact:true}).click();await page.getByRole('heading',{name:'קוד מהטלפון',exact:true}).waitFor();
  };
  await signIn();
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:path.join(out,'mfa-default-1440.png'),fullPage:true});
  const bad=Array.from({length:100},(_,i)=>String(i).padStart(6,'0')).find(v=>otp.validate({token:v,window:1})===null);
  await page.getByLabel('קוד בן 6 ספרות',{exact:true}).fill(bad);await page.getByRole('button',{name:'כניסה',exact:true}).click();
  await page.getByRole('alert').waitFor();assert.ok((await page.getByRole('alert').innerText()).includes('הקוד החדש'));
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(out,`verify-${width}.png`),fullPage:true});
  }
  await page.getByRole('button',{name:'הטלפון לא זמין — קוד גיבוי',exact:true}).click();
  await page.getByLabel('קוד גיבוי',{exact:true}).fill(codes[0]);await page.getByRole('button',{name:'כניסה',exact:true}).click();
  await page.getByRole('heading',{name:'אתרים',exact:true}).waitFor();
  pass('clear invalid-code recovery and real backup-code login');
  await signIn();await page.getByRole('button',{name:'הטלפון לא זמין — קוד גיבוי',exact:true}).click();
  await page.getByLabel('קוד גיבוי',{exact:true}).fill(codes[0]);await page.getByRole('button',{name:'כניסה',exact:true}).click();
  await page.getByRole('alert').waitFor();assert.ok((await page.getByRole('alert').innerText()).includes('קוד אחר'));
  await page.screenshot({path:path.join(out,'backup-used-320.png'),fullPage:true});
  pass('used backup code cannot be replayed');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);pass('no browser errors or external network requests');
})().catch(e=>{console.error(e.stack);results.push({name:e.message,ok:false});process.exitCode=1;})
  .finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));db.close();fs.rmSync(temp,{recursive:true,force:true});});
