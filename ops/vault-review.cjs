/* Synthetic end-to-end vault exercise. Never connects to production or captures real secrets. */
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-vault-browser-"));
process.env.MONITOR_DB_PATH = path.join(temp, "monitor.db");
process.env.AUTH_KEY_FILE = path.join(temp, "auth.key");
process.env.NODE_ENV = "test";
process.env.VAULT_ENABLED = "true";
const db = require("../backend/database"),
  s = require("../backend/security");
s.initSecurity(db);
const { chromium } = require("../backend/node_modules/playwright");
const out = path.resolve(__dirname, "../.impeccable/review/vault");
fs.mkdirSync(out, { recursive: true });
const loginPassword = "Synthetic login passphrase 2026!",
  vaultPassword = "Synthetic vault passphrase 2026!";
const results = [],
  check = (name) => {
    results.push({ name, ok: true });
    console.log("PASS", name);
  };
let browser, server;
(async () => {
  const otpSecret = new s.OTPAuth.Secret({ size: 20 }).base32;
  const ownerId = Number(
    db
      .prepare(
        "INSERT INTO users(username,password,role,mfa_secret) VALUES (?,?,?,?)",
      )
      .run(
        "demo-owner",
        await s.passwordHash("short-demo"),
        "owner",
        s.seal(otpSecret),
      ).lastInsertRowid,
  );
  server = require("../backend/server").listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/serve-monitor`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const writes = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/vault/entries/") && req.method() === "PUT")
      writes.push(req.postData());
  });
  await page.goto(base + "/login");
  await page.getByRole("button", { name: "כניסה", exact: true }).waitFor();
  await page.screenshot({
    path: path.join(out, "login-1440.png"),
    fullPage: true,
  });
  await page.getByLabel("שם משתמש", { exact: true }).fill("demo-owner");
  await page.getByLabel("סיסמה", { exact: true }).fill("short-demo");
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await page.getByLabel("סיסמה חדשה", { exact: true }).waitFor();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: path.join(out, `password-upgrade-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByLabel("סיסמה חדשה", { exact: true }).fill(loginPassword);
  await page.getByRole("button", { name: "הצגת סיסמה", exact: true }).click();
  assert.equal(
    await page.getByLabel("סיסמה חדשה", { exact: true }).getAttribute("type"),
    "text",
  );
  await page.getByRole("button", { name: "הסתרת סיסמה", exact: true }).click();
  await page
    .getByRole("button", { name: "עדכון והמשך לאימות", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("קוד בן 6 ספרות", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(out, "mfa-1440.png"),
    fullPage: true,
  });
  check("legacy password upgrade, reveal and MFA continuation");
  await page
    .getByLabel("קוד בן 6 ספרות", { exact: true })
    .fill(s.totp(otpSecret).generate());
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await page.getByRole("heading", { name: "אתרים", exact: true }).waitFor();
  check("password login followed by real MFA");
  await page.goto(base + "/vault");
  await page
    .getByLabel("סיסמה חדשה לכספת", { exact: true })
    .fill(vaultPassword);
  await page
    .getByLabel("אימות סיסמת הכספת", { exact: true })
    .fill(vaultPassword);
  await page.getByRole("button", { name: "יצירת מפתח", exact: true }).click();
  await page.getByText("מפתח השחזור שלך", { exact: true }).waitFor();
  const recovery = await page.locator(".setup-secret").textContent();
  assert.ok(recovery.length > 40);
  await page.screenshot({
    path: path.join(out, "vault-recovery-1440.png"),
    fullPage: true,
    mask: [page.locator(".setup-secret")],
  });
  await page.getByLabel("שמרתי את מפתח השחזור במקום בטוח").check();
  await page.getByRole("button", { name: "השלמת ההגדרה" }).click();
  await page
    .getByRole("button", { name: "פרטי גישה חדשים", exact: true })
    .waitFor();
  check("vault setup and confirmed offline recovery key");
  await page
    .getByRole("button", { name: "פרטי גישה חדשים", exact: true })
    .click();
  await page.getByLabel("שם הפריט", { exact: true }).fill("Seder — ניהול");
  await page
    .getByLabel("שם משתמש / אימייל", { exact: true })
    .fill("demo@example.test");
  await page
    .getByLabel("סיסמה", { exact: true })
    .fill("SyntheticSavedSecret!2026");
  await page
    .getByLabel("כתובת כניסה", { exact: true })
    .fill("https://lawebs.co.il/seder");
  await page.getByLabel("הערות", { exact: true }).fill("נתוני הדגמה בלבד");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await page.getByRole("button", { name: "העתקת סיסמה" }).waitFor();
  assert.equal(writes.length, 1);
  for (const plain of [
    "SyntheticSavedSecret!2026",
    "demo@example.test",
    "נתוני הדגמה",
  ])
    assert.ok(!writes[0].includes(plain));
  check("entry save transmits ciphertext only");
  await page.getByRole("button", { name: "העתקת סיסמה" }).click();
  await page.getByRole("status").filter({ hasText: "הועתק" }).waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "SyntheticSavedSecret!2026",
  );
  assert.equal(
    await page.locator(".vault-password").innerText(),
    "••••••••••••",
  );
  assert.equal(
    await page.getByRole("link", { name: "פתיחת אתר" }).getAttribute("href"),
    "https://lawebs.co.il/seder",
  );
  check("copy without reveal and exact safe destination");
  await page.getByRole("button", { name: "הצגת סיסמה", exact: true }).click();
  await page.getByText("SyntheticSavedSecret!2026", { exact: true }).waitFor();
  await page.getByRole("button", { name: "הסתרת סיסמה", exact: true }).click();
  check("reveal and hide");
  // Populate additional synthetic entries using the same encrypted API envelopes.
  const c = await import("../frontend/src/vault/crypto.js"),
    record = require("../backend/vault").keysFor(db, ownerId),
    privateKey = await c.openIdentity(ownerId, vaultPassword, record),
    raw = await c.unwrapKey(
      db
        .prepare("SELECT wrapped_key FROM vault_members WHERE user_id=?")
        .get(ownerId).wrapped_key,
      privateKey,
    ),
    key = await c.aes(raw);
  for (const [name, url] of [
    ["LA webs", "https://lawebs.co.il/"],
    ["PDF Studio", "https://vee-app.co.il/pdf-studio/"],
    ["Libi Diamonds", "https://www.libidiamonds.co.il/"],
    ["Manager Site", "https://manager.example.test/"],
  ]) {
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO vault_entries VALUES (?,?,?,?,?,?,?,NULL)").run(
      id,
      1,
      1,
      JSON.stringify(
        await c.encrypt(
          key,
          {
            title: name,
            username: "demo@example.test",
            url,
            environment: "production",
            appId: "",
          },
          c.entryContext(id, "metadata", 1, 1),
        ),
      ),
      JSON.stringify(
        await c.encrypt(
          key,
          { password: "SyntheticSavedSecret!2026", notes: "נתוני הדגמה בלבד" },
          c.entryContext(id, "secret", 1, 1),
        ),
      ),
      Date.now(),
      ownerId,
    );
  }
  await page.getByRole("button", { name: "נעילה", exact: true }).click();
  assert.equal(await page.locator(".vault-list-row").count(), 0);
  await page.getByLabel("סיסמת הכספת", { exact: true }).fill(vaultPassword);
  await page.getByRole("button", { name: "פתיחת הכספת", exact: true }).click();
  await page.locator(".vault-list-row").first().waitFor();
  check("lock removes decrypted interface and unlock restores entries");
  await page.getByLabel("חיפוש פרטי גישה", { exact: true }).fill("Seder");
  assert.equal(await page.locator(".vault-list-row").count(), 1);
  await page.getByLabel("חיפוש פרטי גישה", { exact: true }).fill("");
  check("local metadata search");
  await page.locator(".vault-toast").waitFor({ state: "hidden" });
  for (const width of [1536, 1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1536 ? 1024 : 1000 });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({
      content:
        "*,*::before,*::after{transition:none!important;animation:none!important;}",
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "vault overflow " + width,
    );
    assert.ok(
      (
        await page.evaluate(() => getComputedStyle(document.body).fontFamily)
      ).includes("Heebo"),
    );
    await page.screenshot({
      path: path.join(out, `vault-detail-${width}.png`),
      fullPage: true,
    });
    if (width < 1000) {
      await page
        .getByRole("button", { name: "חזרה לרשימה", exact: true })
        .click();
      await page.screenshot({
        path: path.join(out, `vault-list-${width}.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: /Seder — ניהול/ }).click();
      await page.waitForFunction(() =>
        document.activeElement?.matches(".vault-detail h2"),
      );
    }
    check("RTL detail/list layout " + width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "עריכה", exact: true }).click();
  await page.getByRole("heading", { name: "עריכת פרטי גישה", exact: true }).waitFor();
  await page.screenshot({
    path: path.join(out, "vault-edit-1440.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({
    path: path.join(out, "vault-edit-390.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "שמירה", exact: true })
    .scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const saveBox = await page
    .getByRole("button", { name: "שמירה", exact: true })
    .boundingBox();
  const navBox = await page.locator(".bottom-nav").boundingBox();
  assert.ok(
    saveBox.y + saveBox.height <= navBox.y,
    "Save must be reachable above mobile navigation",
  );
  await page.screenshot({ path: path.join(out, "vault-edit-footer-390.png") });
  check("mobile save and cancel are reachable above navigation");
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "ביטול", exact: true }).click();
  await page.getByRole("button", { name: "ניהול צוות" }).click();
  await page.locator(".vault-members").getByText("demo-owner", {exact:true}).waitFor();
  await page.screenshot({
    path: path.join(out, "vault-team-1440.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "סגירת ניהול צוות" }).click();
  await page.getByRole("button", { name: "נעילה", exact: true }).click();
  await page.screenshot({
    path: path.join(out, "vault-locked-1440.png"),
    fullPage: true,
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      "/visitors",
      "/clients",
      "/infrastructure",
      "/services",
      "/settings",
    ]) {
      await page.goto(base + route);
      await page.locator(".page h1").waitFor();
      await page.waitForTimeout(150);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "overflow " + route + " " + width,
      );
      await page.screenshot({
        path: path.join(out, `${route.slice(1)}-${width}.png`),
        fullPage: true,
      });
    }
    check("workspace layouts " + width);
  }
  await page.goto(base + "/vault");
  await page.getByLabel("סיסמת הכספת", { exact: true }).fill(vaultPassword);
  await page.getByRole("button", { name: "פתיחת הכספת", exact: true }).click();
  await page.locator(".vault-list-row").first().waitFor();
  await page.getByRole("button", { name: /Seder — ניהול/ }).click();
  await page.clock.install();
  await page.getByRole("button", { name: "הצגת סיסמה", exact: true }).click();
  await page.getByText("SyntheticSavedSecret!2026", { exact: true }).waitFor();
  await page.clock.runFor(15500);
  assert.equal(
    await page.locator(".vault-password").innerText(),
    "••••••••••••",
  );
  check("password automatically hides after 15 seconds");
  await page.clock.runFor(300001);
  await page.getByLabel("סיסמת הכספת", { exact: true }).waitFor();
  assert.equal(await page.locator(".vault-list-row").count(), 0);
  check("five-minute idle lock clears decrypted state");
  assert.deepEqual(errors, []);
  check("no browser exceptions");
})()
  .catch((e) => {
    console.error(e.stack);
    results.push({ name: e.message, ok: false });
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    if (server) await new Promise((r) => server.close(r));
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(results, null, 2),
    );
    db.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });
