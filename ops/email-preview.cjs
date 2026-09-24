/* Render production report inputs using the working template. Never sends mail. */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
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
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 960 }); await page.setContent(report.html);
        if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) throw new Error(`${input.type} ${width} overflow`);
        await page.screenshot({ path: path.join(out, `${width}-email-${input.type}.png`), fullPage: true });
      }
      console.log(`PASS ${input.type} email: ${input.rows.length} sites; HTML and text; no delivery`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
