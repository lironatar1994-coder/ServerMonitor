const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-device-test-"));
process.env.MONITOR_DB_PATH = path.join(dir, "monitor.db");
process.env.AUTH_KEY_FILE = path.join(dir, "auth.key");
process.env.NODE_ENV = "test";
const db = require("../database"),
  s = require("../security");
s.initSecurity(db);
let server, base;
const PASSWORD = "a-long-test-password-123";
const SECRET = new s.OTPAuth.Secret({ size: 20 }).base32;
test.before(async () => {
  server = require("../server").listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/serve-monitor/api`;
  db.prepare("INSERT INTO users(username,password,role,mfa_secret) VALUES (?,?,?,?)")
    .run("device-owner", await s.passwordHash(PASSWORD), "owner", s.seal(SECRET));
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
const cookies = (response) => Object.fromEntries(response.headers.getSetCookie().map((line) => {
  const [pair] = line.split(";");
  return [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
}));
const call = (url, { method = "GET", cookie = "", csrf = "", body, headers = {} } = {}) => fetch(base + url, {
  method,
  headers: { Origin: "http://127.0.0.1", "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrf, ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
async function signIn(remember) {
  const login = await call("/auth/login", { method: "POST", body: { username: "device-owner", password: PASSWORD } });
  assert.equal(login.status, 200);
  const pending = cookies(login)["monitor-session"], { csrf } = await login.json();
  // Codes are single-use per 30 seconds; reset the replay guard so the test can sign in repeatedly.
  db.prepare("UPDATE users SET mfa_step=-1 WHERE username='device-owner'").run();
  const code = s.totp(SECRET).generate();
  const verify = await call("/auth/mfa/verify", { method: "POST", cookie: `monitor-session=${pending}`, csrf, body: { code, remember } });
  assert.equal(verify.status, 200);
  const set = cookies(verify), data = await verify.json();
  return { session: set["monitor-session"], device: set["monitor-device"], csrf: data.csrf };
}

test("a remembered device reopens the account without password or code and rotates its token", async () => {
  const first = await signIn(true);
  assert.ok(first.device, "device cookie is set only when asked");
  assert.equal((await signIn(false)).device, undefined);
  const resumed = await call("/auth/session", { cookie: `monitor-device=${first.device}` });
  assert.equal(resumed.status, 200);
  assert.equal((await resumed.json()).next, "ready");
  const rotated = cookies(resumed);
  assert.ok(rotated["monitor-session"]);
  assert.ok(rotated["monitor-device"] && rotated["monitor-device"] !== first.device);
  // The resumed session keeps the original code time, so recent-code checks still ask again.
  const device = db.prepare("SELECT * FROM auth_devices").get();
  db.prepare("UPDATE auth_devices SET mfa_at=?").run(Date.now() - 600000);
  const again = await call("/auth/session", { cookie: `monitor-device=${rotated["monitor-device"]}` });
  const session = db.prepare("SELECT * FROM auth_sessions WHERE token_hash=?").get(s.hash(cookies(again)["monitor-session"]));
  assert.equal(session.device_id, device.id);
  assert.ok(session.mfa_at < Date.now() - 500000);
  assert.equal(db.prepare("SELECT label FROM auth_devices").get().label.includes("·"), true);
});

test("a copied device token is detected after the grace window and revokes the device", async () => {
  db.prepare("DELETE FROM auth_devices").run();
  const { device } = await signIn(true);
  const first = cookies(await call("/auth/session", { cookie: `monitor-device=${device}` }))["monitor-device"];
  // A second tab within a minute still gets in with the previous token.
  assert.equal((await call("/auth/session", { cookie: `monitor-device=${device}` })).status, 200);
  db.prepare("UPDATE auth_devices SET rotated_at=?").run(Date.now() - 120000);
  assert.equal((await call("/auth/session", { cookie: `monitor-device=${device}` })).status, 401);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM auth_devices").get().n, 0);
  assert.equal((await call("/auth/session", { cookie: `monitor-device=${first}` })).status, 401);
});

test("cross-site requests, sign-out, password changes and removal end device trust", async () => {
  db.prepare("DELETE FROM auth_devices").run();
  let { device } = await signIn(true);
  assert.equal((await call("/auth/session", { cookie: `monitor-device=${device}`, headers: { "Sec-Fetch-Site": "cross-site" } })).status, 401);
  const resumed = await call("/auth/session", { cookie: `monitor-device=${device}` });
  const set = cookies(resumed), { csrf } = await resumed.json();
  const list = await (await call("/auth/devices", { cookie: `monitor-session=${set["monitor-session"]}; monitor-device=${set["monitor-device"]}` })).json();
  assert.equal(list.devices.length, 1);
  assert.equal(list.devices[0].current, true);
  assert.equal((await call("/auth/logout", { method: "POST", cookie: `monitor-session=${set["monitor-session"]}; monitor-device=${set["monitor-device"]}`, csrf })).status, 200);
  assert.equal((await call("/auth/session", { cookie: `monitor-device=${set["monitor-device"]}` })).status, 401);

  ({ device } = await signIn(true));
  const other = await signIn(true);
  const removal = await call(`/auth/devices/${db.prepare("SELECT id FROM auth_devices WHERE token_hash=?").get(s.hash(device)).id}`,
    { method: "DELETE", cookie: `monitor-session=${other.session}`, csrf: other.csrf });
  assert.equal(removal.status, 200);
  assert.equal((await call("/auth/session", { cookie: `monitor-device=${device}` })).status, 401);
  const change = await call("/auth/change-password", { method: "POST", cookie: `monitor-session=${other.session}`, csrf: other.csrf,
    body: { oldPassword: PASSWORD, newPassword: PASSWORD } });
  assert.equal(change.status, 200);
  assert.equal((await call("/auth/session", { cookie: `monitor-device=${other.device}` })).status, 401);
});
