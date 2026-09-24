/* Read-only local UI review against production. Token stays in process memory.
   Usage: node ops/ui-review.cjs (local Vite dev:live must run on 5180). */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('../backend/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.impeccable/review');
fs.mkdirSync(out, { recursive: true });
const mint = "process.chdir('/root/ServerMonitor/backend');require(process.cwd()+'/node_modules/dotenv').config({quiet:true});const db=require(process.cwd()+'/database');const a=require(process.cwd()+'/routes/auth');process.stdout.write(a.createSessionToken(db.prepare('SELECT id,username FROM users ORDER BY id LIMIT 1').get(),'5m'));db.close();";
let token;
try { token = execFileSync('ssh', ['-o', 'BatchMode=yes', 'root@vee-app.co.il', 'node -'], { input: mint, encoding: 'utf8' }).trim(); } catch { throw new Error('Could not create a short-lived review session'); }
const base = process.env.UI_REVIEW_BASE || 'http://127.0.0.1:5180/serve-monitor';
const results = [];
const check = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); } catch(e) { results.push({ name, ok: false, error: e.message.slice(0, 500) }); console.log('FAIL', name, e.message.slice(0,500)); } };
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ userAgent: 'ServerMonitor-Audit-Bot/1.0', viewport: { width: 1440, height: 960 } });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/login');
    await page.evaluate(t => localStorage.setItem('token', t), token);
    const apps = await page.evaluate(async () => (await fetch('/serve-monitor/api/apps', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })).json());
    const id = apps.find(a => a.name === 'LA webs').id;
    const ready = async route => { await page.goto(base + route); await page.locator('.page h1, .login h1').waitFor(); await page.locator('.skeleton-stack,.page-loader').first().waitFor({ state: 'hidden' }); await page.evaluate(() => document.fonts.ready); assert.equal(await page.locator('.error-state').count(), 0); };
    const routes = ['/visitors', `/visitors/${id}`, '/clients', `/clients/${id}`, '/infrastructure', '/services', `/services/${id}`, '/settings'];
    if (process.env.UI_REVIEW_FLOWS_ONLY) routes.splice(0);
    for (const width of [1440,390,320]) {
      await page.setViewportSize({ width, height: 960 });
      for (const route of routes) await check(`${width}${route}`, async () => {
        await ready(route);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow: ' + JSON.stringify(await page.locator('body *').evaluateAll(els => els.filter(el => el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1).slice(0,8).map(el => ({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width})))));
        await page.screenshot({ path: path.join(out, `${width}-${route.slice(1).replaceAll('/', '-')}.png`), fullPage: true });
      });
    }
    await check('period-sort-search', async () => {
      await ready('/visitors'); await page.getByRole('button', { name: '7 ימים', exact: true }).click();
      await page.waitForResponse(r => r.url().includes('visitor-analytics/overview'));
      await page.getByLabel('מיון אתרים').selectOption('name');
      await page.getByLabel('חיפוש אתר', { exact: true }).fill('LA webs');
      assert.equal(await page.locator('.comparison-list li').count(), 1);
      await page.reload(); await page.locator('.comparison-list li').first().waitFor();
      assert.equal(await page.getByLabel('מיון אתרים').inputValue(), 'name');
      assert.equal(await page.getByRole('button', { name: '7 ימים', exact: true }).getAttribute('aria-pressed'), 'true');
    });
    const end = Math.floor(Date.now() / 86400000) * 86400000;
    const from = new Date(end - 3 * 86400000).toISOString(), to = new Date(end).toISOString();
    const dates = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    await check('shared-page-pins-preset-dates', async () => {
      await ready(`/visitors/${id}`);
      await page.getByRole('button', { name: '7 ימים', exact: true }).click();
      await page.locator('.range-picker__refresh:not([disabled])').waitFor();
      await page.locator('.ranked-row__button').first().click();
      await page.locator('.page-insights h3').first().waitFor();
      const shared = page.url(), query = new URL(shared).searchParams;
      assert.ok(query.has('from') && query.has('to'));
      assert.equal(Date.parse(query.get('to')) - Date.parse(query.get('from')), 7 * 86400000);
      await page.evaluate(() => localStorage.removeItem('vee-monitor.range'));
      await page.goto(shared); await page.locator('.page-insights h3').first().waitFor();
      assert.equal(new URL(page.url()).searchParams.get('from'), query.get('from'));
    });
    for (const width of [1440,390]) await check(`page-panel-${width}`, async () => {
      await page.setViewportSize({ width, height: 960 }); await ready(`/visitors/${id}${dates}`);
      const row = page.locator('.ranked-row__button').first(); const selected = await row.getAttribute('data-page-path');
      await row.focus(); await page.keyboard.press('Enter'); await page.locator('.page-insights h3').first().waitFor();
      assert.equal(new URL(page.url()).searchParams.get('page'), selected);
      if(width < 760) assert.equal(Math.round((await page.locator('.page-insights').boundingBox()).y), 0);
      assert.equal(new URL(page.url()).searchParams.get('from'), from);
      if (width < 760) {
        await page.locator('.page-insights a').last().focus(); await page.keyboard.press('Tab');
        assert.ok(await page.locator('.page-insights').evaluate(el => el.contains(document.activeElement)), 'focus escaped mobile panel');
      }
      await page.screenshot({ path: path.join(out, `${width}-page-panel.png`), fullPage: width > 760 });
      await page.reload(); await page.locator('.page-insights h3').first().waitFor();
      assert.ok(await page.locator('.page-insights').evaluate(el => el.contains(document.activeElement)));
      await page.keyboard.press('Escape'); await page.locator('.page-insights').waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => document.activeElement.dataset.pagePath), selected);
      await page.locator('.ranked-row__button').first().click(); await page.locator('.page-insights').waitFor();
      await page.goBack(); await page.locator('.page-insights').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'החלפת אתר' }).click();
      await page.getByLabel('חיפוש אתר להחלפה').fill('PDF');
      await page.locator('.site-switcher__menu a').first().click();
      assert.equal(new URL(page.url()).searchParams.get('from'), from);
      await page.locator('.page h1').filter({ hasText: 'PDF' }).waitFor();
    });
    await check('loading-empty-failed-stale-long-name-states', async () => {
      await page.setViewportSize({ width: 320, height: 960 });
      const sample = await page.evaluate(async () => (await fetch('/serve-monitor/api/visitor-analytics/overview', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })).json());
      let scenario = 'loading';
      await page.route('**/api/visitor-analytics/overview?*', async route => {
        if (scenario === 'loading') return;
        if (scenario === 'failed') return route.fulfill({ status: 503, json: { error: 'בדיקת כשל מבוקרת' } });
        const fixture = structuredClone(sample);
        if (scenario === 'empty') { fixture.sites = []; fixture.series = []; fixture.summary = {}; }
        if (scenario === 'stale') fixture.tracking_health = { status: 'stale', checked: null };
        if (scenario === 'long') fixture.sites[0].name = 'אתר עם שם ארוך במיוחד לצורך בדיקת שורות והשוואת פעילות '.repeat(5);
        await route.fulfill({ json: fixture });
      });
      await page.goto(base + '/visitors'); await page.locator('.skeleton-stack').waitFor();
      scenario = 'failed'; await page.reload(); await page.getByText('הנתונים לא נטענו', { exact: true }).waitFor();
      scenario = 'empty'; await page.getByRole('button', { name: 'נסה שוב' }).click(); await page.getByText('אין אתרים מוגדרים למדידה').waitFor();
      scenario = 'stale'; await page.reload(); await page.getByText('אין תוצאת בדיקה אוטומטית עדכנית').waitFor();
      scenario = 'long'; await page.reload(); await page.locator('.comparison-list li').first().waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(out, '320-long-name.png'), fullPage: true });
      await page.unroute('**/api/visitor-analytics/overview?*');
    });
    await check('login-destination', async () => {
      await page.evaluate(() => localStorage.removeItem('token'));
      const target = `/visitors/${id}${dates}&view=pages&page=%2F`;
      await page.goto(base + target); await page.getByRole('button', { name: 'כניסה', exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('returnTo'), target);
      for (const width of [1440,390,320]) { await page.setViewportSize({ width, height: 960 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(out, `${width}-login.png`), fullPage: true }); }
      // Simulate only the successful auth response; no password or production write.
      await page.route('**/api/auth/login', r => r.fulfill({ json: { token } }));
      await page.getByLabel('שם משתמש').fill('review'); await page.getByLabel('סיסמה', { exact: true }).fill('local-response-only');
      await page.getByRole('button', { name: 'כניסה', exact: true }).click();
      await page.locator('.page-insights').waitFor(); assert.equal(new URL(page.url()).searchParams.get('page'), '/');
    });
    await check('browser-runtime', async () => assert.deepEqual(errors, []));
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'ui-results.json'), JSON.stringify(results,null,2)); }
  process.exitCode = results.some(r => !r.ok) ? 1 : 0;
})().catch(e => { console.error(e.message); process.exitCode = 1; });


