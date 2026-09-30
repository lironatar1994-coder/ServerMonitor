/* Render production report inputs using the working template. Never sends mail. */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../backend/node_modules/playwright');
const { renderEmail } = require('../backend/emailReportTemplate');
const out = path.resolve(__dirname, '../.impeccable/review');
fs.mkdirSync(out, { recursive: true });
const script = "process.chdir('/root/ServerMonitor/backend');require(process.cwd()+'/node_modules/dotenv').config({quiet:true});const r=require(process.cwd()+'/emailReports');const result=['daily','weekly'].map(type=>{const period=r.buildPeriod(type);return {type,period,rows:r.buildReportData(period),operations:r.buildOperationsData()}});process.stdout.write(JSON.stringify(result));require(process.cwd()+'/database').close();";
const inputs = JSON.parse(execFileSync('ssh', ['-o', 'BatchMode=yes', 'root@vee-app.co.il', 'node -'], { input: script, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    for (const input of inputs) {
      const report = renderEmail(input.type, input.period, input.rows, input.operations);
      fs.writeFileSync(path.join(out, `${input.type}.html`), report.html);
      fs.writeFileSync(path.join(out, `${input.type}.txt`), report.text);
      const variants = [
        ...[1440, 390, 320].map(width => ({ width, scheme: 'light' })),
        { width: 390, scheme: 'dark' },
        { width: 320, scheme: 'light', noStyles: true }
      ];
      for (const { width, scheme, noStyles } of variants) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: 960 });
        await page.setContent(noStyles ? report.html.replace(/<style>[\s\S]*?<\/style>/, '') : report.html);
        if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) throw new Error(`${input.type} ${width} overflow`);
        const tableChecks = await page.evaluate(() => [...document.querySelectorAll('table:not([role="presentation"])')].map(table => ({
          widths: [...table.querySelector('tbody tr').children].map(cell => cell.getBoundingClientRect().width),
          headings: table.querySelectorAll('thead th').length
        })));
        assert.ok(tableChecks.every(table => table.headings >= 3 && table.widths.every(width => width > 0)));
        const suffix = noStyles ? '-inline' : scheme === 'dark' ? '-dark' : '';
        await page.screenshot({ path: path.join(out, `${width}-email-${input.type}${suffix}.png`), fullPage: true });
      }
      console.log(`PASS ${input.type} email: ${input.rows.length} sites; desktop/390px/320px/dark/inline fallback; HTML and text; no delivery`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
