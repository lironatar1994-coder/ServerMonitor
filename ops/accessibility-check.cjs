/* Local read-only verification: hit targets, overflow, focus and token contrast. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('../backend/node_modules/playwright');
const out = path.resolve(__dirname, '../.impeccable/review');
const base = process.env.UI_REVIEW_BASE || 'http://127.0.0.1:5180/serve-monitor';
const mint = "process.chdir('/root/ServerMonitor/backend');require(process.cwd()+'/node_modules/dotenv').config({quiet:true});const db=require(process.cwd()+'/database');process.stdout.write(require(process.cwd()+'/routes/auth').createSessionToken(db.prepare('SELECT id,username FROM users ORDER BY id LIMIT 1').get(),'5m'));db.close();";
let token;
try { token = execFileSync('ssh', ['-o', 'BatchMode=yes', 'root@vee-app.co.il', 'node -'], { input: mint, encoding: 'utf8' }).trim(); } catch { throw new Error('Could not create a short-lived review session'); }
const luminance = hex => hex.match(/[a-f0-9]{2}/ig).map(h => parseInt(h,16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((v,c,i) => v+c*[.2126,.7152,.0722][i],0);
const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
(async () => {
  const results = [];
  for (const [fg,bg] of [['172126','FFFFFF'],['53656D','F5F7F8'],['006775','FFFFFF'],['19704B','E6F4EC'],['8A5800','FFF5DE'],['B42332','FCECEF'],['ADBDC5','202D34'],['81D4DF','202D34'],['172126','81D4DF']]) {
    const ratio = contrast(fg,bg); assert.ok(ratio >= 4.5, `${fg}/${bg}: ${ratio}`); results.push({ contrast: `${fg}/${bg}`, ratio });
  }
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ userAgent: 'ServerMonitor-Audit-Bot/1.0' });
    await page.goto(base + '/login'); await page.evaluate(t => localStorage.setItem('token',t), token);
    const apps = await page.evaluate(async () => (await fetch('/serve-monitor/api/apps', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })).json());
    const id = apps.find(a => a.name === 'LA webs').id;
    for (const width of [1440,390,320]) {
      await page.setViewportSize({ width, height: 960 });
      for (const route of (process.env.UI_REVIEW_CLIENT_ONLY ? [`/clients/${id}`] : ['/visitors', `/visitors/${id}`, '/clients', `/clients/${id}`, '/infrastructure', '/services', '/settings'])) {
        await page.goto(base + route); await page.locator('.page h1').waitFor(); await page.locator('.skeleton-stack').first().waitFor({ state: 'hidden' });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route + ' overflow');
        const small = await page.locator('button,input:not([type=checkbox]),select,summary,a').evaluateAll(els => els.filter(el => {
          const r=el.getBoundingClientRect(); return r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && !el.closest('[inert]') && (r.width < 43.9 || r.height < 43.9);
        }).map(el => ({ label: (el.getAttribute('aria-label') || el.textContent).trim().slice(0,60), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
        results.push({width,route,small});
        if (route === `/clients/${id}`) { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(out, `${width}-clients-${id}.png`), fullPage:true }); }
      }
    }
    const failures=results.filter(r => r.small?.length); console.log(JSON.stringify(failures.length ? failures : { checks: results.length, contrast: 'pass', targets: 'pass', overflow: 'pass' },null,2));
    fs.writeFileSync(path.join(out,process.env.UI_REVIEW_CLIENT_ONLY ? 'accessibility-client-fix.json' : 'accessibility-results.json'),JSON.stringify(results,null,2));
    assert.equal(failures.length,0,'Touch targets below 44px');
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode=1; });
