/* Hourly bounded production smoke check. All visits identify as automation. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const fromBackend = createRequire(path.join(__dirname, '../backend/package.json'));
fromBackend('dotenv').config({ path: path.join(__dirname, '../backend/.env'), quiet: true });
const { chromium } = fromBackend('playwright');
const db = fromBackend('./database');
const { createSessionToken } = fromBackend('./routes/auth');
const output = process.env.BROWSER_CHECK_RESULT || '/var/lib/lawebs-maintenance/browser-check.json';
const result = { checked: Date.now(), errors: [], checks: [], timings: {} };
const check = async (name, fn) => {
  try { await fn(); result.checks.push(name); console.log('PASS', name); }
  catch (error) { result.errors.push(`${name}: ${error.message.slice(0, 350)}`); console.log('FAIL', name); }
};
let browser;
(async () => {
  const app = db.prepare("SELECT id FROM apps WHERE name='LA webs'").get();
  const user = db.prepare('SELECT id,username FROM users ORDER BY id LIMIT 1').get();
  const token = createSessionToken(user, '5m');
  const monitor = 'https://monitor.vee-app.co.il/serve-monitor';
  for (const days of [1, 30, 90]) await check(`monitor-api-${days}d`, async () => {
    const end = new Date(), start = Date.now();
    const query = new URLSearchParams({ from: new Date(end - days * 86400000).toISOString(), to: end.toISOString() });
    const response = await fetch(`${monitor}/api/visitor-analytics/overview?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200); const data = await response.json();
    assert.ok(Array.isArray(data.sites) && data.sites.some(s => s.app_id === app.id));
    result.timings[`${days}d`] = Date.now() - start;
    assert.ok(result.timings[`${days}d`] < 10000, 'Overview exceeded 10 seconds');
  });
  browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--renderer-process-limit=2'] });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 ServerMonitor-Audit-Bot/1.0', viewport: { width: 1365, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(25000);
  const failures = [];
  page.on('pageerror', () => failures.push('JavaScript exception'));
  page.on('response', r => { if (r.status() >= 400 && ['script', 'stylesheet', 'image', 'font'].includes(r.request().resourceType())) failures.push(`Resource HTTP ${r.status()}: ${new URL(r.url()).pathname}`); });
  await check('login-screen', async () => { await page.goto(`${monitor}/login`); await page.getByRole('button', { name: 'כניסה', exact: true }).waitFor(); });
  await context.addInitScript(({ token, monitor }) => { if (location.origin === new URL(monitor).origin || (location.origin === 'https://vee-app.co.il' && location.pathname.startsWith('/serve-monitor'))) localStorage.setItem('token', token); }, { token, monitor });
  const routes = ['/visitors', `/visitors/${app.id}`, '/infrastructure', '/services', '/settings', `/clients/${app.id}`];
  for (const width of [1365, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) await check(`monitor-${width}${route}`, async () => {
      await page.goto(monitor + route);
      await page.locator('.page h1').waitFor();
      await page.locator('.skeleton-stack,.page-loader').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.error-state').count(), 0, 'Dashboard reported a loading error');
      if (process.env.BROWSER_CHECK_CAPTURE === '1' && route === `/visitors/${app.id}`) await page.screenshot({ path: path.join(path.dirname(output), `monitor-${width}.png`) });
      await page.addStyleTag({ content: '*,*::before,*::after { transition:none!important; animation:none!important; }' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Horizontal overflow');
    });
  }
  await check('page-drill-down-and-plain-labels', async () => {
    await page.goto(`${monitor}/visitors/${app.id}`);
    await page.getByText('מבקרים משוערים', { exact: true }).waitFor();
    await page.locator('.ranked-row__button').first().click();
    await page.getByRole('heading', { name: 'מה עשו אחר כך?', exact: true }).waitFor();
    assert.equal(await page.locator('.page-insights .error-state').count(), 0);
    if (process.env.BROWSER_CHECK_CAPTURE === '1') await page.screenshot({ path: path.join(path.dirname(output), 'page-insights-mobile.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  });
  await check('legacy-monitor-url', async () => {
    await page.goto(`https://vee-app.co.il/serve-monitor/visitors/${app.id}`);
    await page.getByText('מבקרים משוערים', { exact: true }).waitFor();
    await page.locator('.skeleton-stack').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.error-state').count(), 0);
  });
  const recorded = [];
  page.on('response', response => {
    if (response.url().startsWith('https://lawebs.co.il/.well-known/vee-') && response.request().method() === 'POST') {
      const body = response.request().postDataJSON(); recorded.push({ kind: body.kind || 'navigation', id: body.event_id, status: response.status() });
    }
  });
  await check('portfolio-mobile-navigation-and-engagement', async () => {
    await page.goto('https://lawebs.co.il/');
    await page.getByRole('button', { name: 'תפריט', exact: true }).click();
    await page.locator('#site-nav').getByRole('link', { name: 'יצירת קשר', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'תפריט', exact: true }).getAttribute('aria-expanded'), 'false');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#work').scrollIntoViewIfNeeded();
    await page.waitForResponse(r => r.url().endsWith('/.well-known/vee-visitor-signal') && r.request().postDataJSON()?.kind === 'engagement', { timeout: 22000 });
    await page.locator('#work a[href="/work/miryam/"]').click();
    await page.getByRole('slider').press('ArrowRight');
    assert.equal(await page.getByRole('slider').inputValue(), '51');
  });
  await check('portfolio-contact-attribution', async () => {
    // Observe the click without opening WhatsApp or sending any message.
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.addEventListener('click', e => { if (e.target.closest('a[href*="wa.me"]')) e.preventDefault(); }, { once: true }));
    const response = page.waitForResponse(r => r.url().endsWith('/.well-known/vee-growth-signal') && r.request().postDataJSON()?.event_type === 'contact_click');
    await page.locator('#contact a[href*="wa.me"]').click();
    const r = await response; assert.ok(r.ok());
    const sent = r.request().postDataJSON(); assert.equal(sent.project, 'miryam'); assert.equal(sent.placement, 'contact');
  });
  await page.setViewportSize({ width: 1365, height: 900 });
  for (const project of ['koral', 'miryam', 'pinhas', 'libi', 'reuven', 'sos', 'seder', 'pdf']) await check(`portfolio-project-${project}`, async () => {
    const response = await page.goto(`https://lawebs.co.il/work/${project}/`); assert.equal(response.status(), 200);
    await page.locator('h1').waitFor();
    assert.equal(await page.locator('img').evaluateAll(images => images.filter(i => i.complete && !i.naturalWidth).length), 0);
  });
  await check('tracking-receipts-and-automation-filter', async () => {
    for (const kind of ['navigation', 'growth', 'engagement']) {
      const event = recorded.find(row => row.kind === kind && [200, 201].includes(row.status)); assert.ok(event, `No ${kind} receipt`);
      const table = { navigation: 'browser_signals', growth: 'growth_events', engagement: 'engagement_signals' }[kind];
      assert.equal(db.prepare(`SELECT automation_hint FROM ${table} WHERE app_id=? AND event_id=?`).get(app.id, event.id)?.automation_hint, 1, `${kind} must be excluded`);
    }
  });
  await check('internal-browser-opt-out', async () => {
    const before = recorded.length;
    await page.goto('https://lawebs.co.il/?monitor_internal=1');
    assert.equal(await page.evaluate(() => document.cookie.includes('monitor_internal=1')), true);
    const after = recorded.length;
    // Background beacons from the outgoing page may finish during navigation.
    assert.ok(after >= before);
    await page.locator('#work').scrollIntoViewIfNeeded();
    await page.waitForTimeout(16000);
    assert.equal(recorded.length, after, 'Internal browser emitted analytics');
  });
  await check('browser-runtime-and-assets', async () => assert.deepEqual(failures, []));
  await context.close();
})().catch(error => { result.errors.push(`Browser check could not finish: ${error.message.slice(0, 350)}`); }).finally(async () => {
  if (browser) await browser.close();
  db.close();
  result.checked = Date.now();
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  fs.writeFileSync(`${output}.tmp`, JSON.stringify(result, null, 2), { mode: 0o600 });
  fs.renameSync(`${output}.tmp`, output);
  console.log(JSON.stringify(result)); process.exitCode = result.errors.length ? 1 : 0;
});
