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
const mint = "process.chdir('/root/ServerMonitor/backend');require(process.cwd()+'/node_modules/dotenv').config({quiet:true});const db=require(process.cwd()+'/database');const a=require(process.cwd()+'/routes/auth');process.stdout.write(a.createSessionToken(db.prepare('SELECT id,username FROM users WHERE disabled=0 ORDER BY id LIMIT 1').get(),'5m'));db.close();";
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
    let reviewAuth = true;
    if (new URL(base).protocol === 'https:') await page.context().addCookies([{ name: '__Host-monitor', value: token, url: new URL(base).origin, httpOnly: true, secure: true, sameSite: 'Strict' }]);
    else await page.route(new URL(base).origin + '/serve-monitor/api/**', route => route.fallback({headers:{...route.request().headers(),...(reviewAuth?{Authorization:'Bearer '+token}:{})}}));
    const apps = await page.evaluate(async () => (await fetch('/serve-monitor/api/apps', { credentials: 'same-origin' })).json());
    const id = apps.find(a => a.name === 'LA webs').id;
    if (process.env.UI_REVIEW_OPERATIONAL_FIXTURE) {
      const operational = JSON.parse(fs.readFileSync(process.env.UI_REVIEW_OPERATIONAL_FIXTURE,'utf8'));
      await page.route('**/api/apps/operational-health', route => route.fulfill({json:operational}));
    }
    const ready = async route => { await page.goto(base + route); await page.locator('.page h1, .login h1').waitFor(); await page.locator('.skeleton-stack,.page-loader').first().waitFor({ state: 'hidden' }); await page.evaluate(() => document.fonts.ready); assert.equal(await page.locator('.error-state').count(), 0); };
    const routes = ['/visitors', `/visitors/${id}`, '/clients', `/clients/${id}`, '/infrastructure', '/services', `/services/${id}`, '/settings'];
    if (process.env.UI_REVIEW_EXTRA_ONLY) {
      routes.splice(0, routes.length, ...apps.filter(app => ['PDF Studio','Seder','Miryam Zelig','Libi Diamonds','SSH Security','WhatsApp Worker'].includes(app.name))
        .map(app => `/${app.analytics_enabled ? 'visitors' : 'services'}/${app.id}`));
    }
    if (process.env.UI_REVIEW_FLOWS_ONLY) routes.splice(0);
    for (const width of [1440,390,320]) {
      await page.setViewportSize({ width, height: 960 });
      for (const route of routes) await check(`${width}${route}`, async () => {
        await ready(route);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow: ' + JSON.stringify(await page.locator('body *').evaluateAll(els => els.filter(el => el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1).slice(0,8).map(el => ({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width})))));
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: path.join(out, `${width}-${route.slice(1).replaceAll('/', '-')}.png`), fullPage: true,
          mask: [page.locator('.terminal-window, .whatsapp-test input, .whatsapp-test textarea')] });
      });
    }
    if (process.env.UI_REVIEW_EXTRA_ONLY) { process.exitCode = results.some(r => !r.ok) ? 1 : 0; return; }
    await check('quick-switch-and-route-aliases', async () => {
      const until = new Date();
      const dates = '?' + new URLSearchParams({from:new Date(until-86400000).toISOString(),to:until.toISOString()});
      const seder=apps.find(app=>app.name==='Seder');
      await ready(`/visitors/${id}${dates}`);
      await page.keyboard.press('Control+k');
      await page.getByRole('dialog',{name:'חיפוש וניווט'}).waitFor();
      await page.getByRole('combobox',{name:'חיפוש מסך, אתר או שירות'}).fill('Seder');
      await page.getByRole('option').first().waitFor();
      for(const width of [1440,390,320]) { await page.setViewportSize({width,height:960}); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); await page.screenshot({path:path.join(out,`${width}-quick-switch.png`),fullPage:true}); }
      await page.keyboard.press('Enter');
      await page.getByRole('dialog',{name:'חיפוש וניווט'}).waitFor({state:'hidden'});
      await page.locator('.page h1').waitFor();
      assert.equal(new URL(page.url()).pathname, `/serve-monitor/visitors/${seder.id}`);
      for(const key of ['from','to'])assert.equal(new URL(page.url()).searchParams.get(key),new URLSearchParams(dates).get(key));
      await ready(`/app/${seder.id}${dates}`);
      assert.equal(new URL(page.url()).pathname, `/serve-monitor/visitors/${seder.id}`);
      await ready('/server');assert.equal(new URL(page.url()).pathname,'/serve-monitor/infrastructure');
      await ready('/dashboard');assert.equal(new URL(page.url()).pathname,'/serve-monitor/visitors');
      const open=page.getByRole('link',{name:'פתיחת האתר LA webs',exact:true});assert.equal(await open.getAttribute('href'),apps.find(app=>app.id===id).url);
      await page.getByRole('button',{name:'עם פעילות',exact:true}).click();
      assert.ok(await page.locator('.comparison-list li').count() <= apps.filter(app=>app.analytics_enabled).length);
      await page.getByRole('button',{name:'הכול',exact:true}).click();
    });
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
    for (const width of [1440,390,320]) await check(`page-panel-${width}`, async () => {
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
      const sample = await page.evaluate(async () => (await fetch('/serve-monitor/api/visitor-analytics/overview', { credentials: 'same-origin' })).json());
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
    await check('service-readiness-and-confirmation', async () => {
      const messaging = apps.find(app => app.pm2_name === 'seder-whatsapp');
      const fixture = {issues:[{id:'seder-whatsapp',appId:messaging.id,severity:'warning',title:'WhatsApp של Seder אינו מחובר',detail:'התהליך פועל; החיבור דורש בדיקה.'}]};
      let healthFailure = false;
      await page.route('**/api/apps/operational-health', r => r.fulfill(healthFailure ? {status:503,json:{error:'controlled unavailable'}} : {json:fixture}));
      await ready('/services');
      assert.notEqual(await page.locator('.service-list li').first().locator('.chip').innerText(), 'זמין');
      const total = apps.filter(app=>app.status==='online' && app.id!==messaging.id).length;
      assert.ok((await page.locator('.page-head').innerText()).includes(`${total} מתוך ${apps.length} זמינים`));
      await page.getByRole('button',{name:'זמינים',exact:true}).click();
      assert.equal(await page.locator('.service-list li').count(),total);
      healthFailure = true; await ready('/services');
      await page.getByText('בדיקת החיבורים אינה זמינה',{exact:true}).waitFor();
      await page.getByLabel('חיפוש שירות').fill('seder-whatsapp');
      await page.getByText('חיבור לא אומת',{exact:true}).waitFor();
      await page.screenshot({path:path.join(out,'320-services-unverified.png'),fullPage:true});
      await ready(`/services/${messaging.id}`);
      await page.getByText('חיבור WhatsApp לא אומת',{exact:true}).waitFor();
      healthFailure = false;
      await page.getByRole('button',{name:'בדיקה חוזרת',exact:true}).click();
      await page.getByText(fixture.issues[0].title,{exact:true}).waitFor();
      // Owner UI only; every mutation is intercepted, and no confirmation is submitted.
      await page.route('**/api/auth/session', r => r.fulfill({json:{next:'ready',csrf:'local-only',user:{id:1,username:'synthetic-owner',role:'owner'}}}));
      await page.route('**/api/apps/*/action', r => r.abort());
      await ready(`/services/${messaging.id}`);
      await page.getByText('פעולות ניהול השירות',{exact:true}).click();
      const trigger=page.getByRole('button',{name:'הפעלה מחדש',exact:true});
      await trigger.click();
      const dialog=page.getByRole('dialog',{name:`הפעלה מחדש של ${messaging.name}?`});
      await dialog.waitFor();
      assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'ביטול');
      for(let i=0;i<4;i++) {await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)), 'confirmation focus escaped');}
      await page.screenshot({path:path.join(out,'320-service-confirmation.png'),fullPage:true});
      await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
      assert.ok(await trigger.evaluate(el=>el===document.activeElement));
      await page.unroute('**/api/auth/session');await page.unroute('**/api/apps/*/action');
    });
    await check('login-destination', async () => {
      await page.context().clearCookies(); reviewAuth = false;
      const target = `/visitors/${id}${dates}&view=pages&page=%2F`;
      await page.goto(base + target); await page.getByRole('button', { name: 'כניסה', exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('returnTo'), target);
      for (const width of [1440,390,320]) { await page.setViewportSize({ width, height: 960 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(out, `${width}-login.png`), fullPage: true }); }
      // Simulate only the successful auth response; no password or production write.
      await page.route('**/api/auth/login', async r => { reviewAuth = true; if(new URL(base).protocol==='https:') await page.context().addCookies([{name:'__Host-monitor',value:token,url:new URL(base).origin,httpOnly:true,secure:true,sameSite:'Strict'}]); await r.fulfill({json:{next:'ready',csrf:'review-fixture',user:{id:1,username:'review',role:'reader'}}}); });
      await page.getByLabel('שם משתמש').fill('review'); await page.getByLabel('סיסמה', { exact: true }).fill('local-response-only');
      await page.getByRole('button', { name: 'כניסה', exact: true }).click();
      await page.locator('.page-insights').waitFor(); assert.equal(new URL(page.url()).searchParams.get('page'), '/');
    });
    await check('browser-runtime', async () => assert.deepEqual(errors, []));
  } finally { await browser.close(); fs.writeFileSync(path.join(out, process.env.UI_REVIEW_EXTRA_ONLY ? 'ui-extra-results.json' : 'ui-results.json'), JSON.stringify(results,null,2)); }
  process.exitCode = results.some(r => !r.ok) ? 1 : 0;
})().catch(e => { console.error(e.message); process.exitCode = 1; });


