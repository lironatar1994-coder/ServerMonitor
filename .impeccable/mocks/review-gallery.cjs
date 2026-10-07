const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('../../backend/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  const checks = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      checks.push({ width, noOverflow: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), direction: await page.locator('html').getAttribute('dir') });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const assets = await page.evaluate(async () => Promise.all(window.MOCK_GALLERY.screens.map(screen => new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve({ file: screen.file, loaded: true, dimensionsMatch: image.naturalWidth === screen.width && image.naturalHeight === screen.height });
      image.onerror = () => resolve({ file: screen.file, loaded: false });
      image.src = screen.path;
    }))));
    await page.locator('#category-filter [data-value="vault"]').click();
    checks.push({ filter: 'vault', count: await page.locator('.card').count() });
    await page.locator('#viewport-filter [data-value="mobile"]').click();
    checks.push({ filter: 'vault-mobile', count: await page.locator('.card').count(), allMobile: await page.locator('.card:not(.mobile)').count() === 0 });
    await page.locator('.preview').first().click();
    checks.push({ viewerOpened: await page.locator('dialog').evaluate(el => el.open), viewerImageLoaded: await page.locator('#viewer-image').evaluate(el => el.complete && el.naturalWidth > 0) });
    await page.keyboard.press('Escape');
    checks.push({ viewerClosedWithEscape: await page.locator('dialog').evaluate(el => !el.open) });
    await page.locator('#category-filter [data-value="reference"]').click();
    checks.push({ emptyCombination: await page.locator('#empty-state').isVisible() });
    await page.locator('#viewport-filter [data-value="all"]').click();
    checks.push({ referenceOnly: await page.locator('.card').count() === 1 });
    await page.locator('#category-filter [data-value="all"]').click();
    await page.screenshot({ path: path.join(__dirname, 'gallery-review-desktop.png') });
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({ path: path.join(__dirname, 'gallery-review-mobile.png') });
    const result = { errors, checks, assets };
    fs.writeFileSync(path.join(__dirname, 'gallery-review.json'), JSON.stringify(result, null, 2));
    if (errors.length || checks.some(c => c.noOverflow === false || c.allMobile === false || c.viewerOpened === false || c.viewerImageLoaded === false || c.viewerClosedWithEscape === false || c.emptyCombination === false || c.referenceOnly === false) || assets.some(a => !a.loaded || !a.dimensionsMatch)) throw new Error('Gallery check failed');
    console.log(JSON.stringify({ passed: true, assets: assets.length, checks: checks.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
