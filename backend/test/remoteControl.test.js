const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-remote-test-"));
process.env.MONITOR_DB_PATH = path.join(dir, "monitor.db");
process.env.AUTH_KEY_FILE = path.join(dir, "auth.key");
process.env.RC_AGENT_TOKEN_FILE = path.join(dir, "agent.sha256");
process.env.RC_STATE_FILE = path.join(dir, "remote-state.json");
process.env.NODE_ENV = "test";
const AGENT_TOKEN = crypto.randomBytes(32).toString("base64url");
const SECOND_TOKEN = crypto.randomBytes(32).toString("base64url");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
// One hash per installed agent: an older install keeps working beside a new one.
fs.writeFileSync(process.env.RC_AGENT_TOKEN_FILE, `${sha(AGENT_TOKEN)}\n${sha(SECOND_TOKEN)}\n`);
const db = require("../database"),
  s = require("../security");
s.initSecurity(db);
let server, base;
test.before(async () => {
  server = require("../server").listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/serve-monitor/api/remote`;
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
function identity(username, role) {
  const id = Number(db.prepare("INSERT INTO users(username,password,role) VALUES (?,?,?)").run(username, "not-a-login-hash", role).lastInsertRowid);
  return s.makeSession(db, id, { mfa: true });
}
const human = (session, url, method = "GET", body) =>
  fetch(base + url, {
    method,
    headers: { Cookie: `monitor-session=${session.token}`, "X-CSRF-Token": session.csrf, Origin: "http://127.0.0.1", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const agent = (url, options = {}, token = AGENT_TOKEN) =>
  fetch(base + "/agent" + url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });

test("only owners reach the remote panel and only the agent token reaches agent routes", async () => {
  const owner = identity("rc-owner", "owner"),
    editor = identity("rc-editor", "editor");
  assert.equal((await fetch(base + "/state")).status, 401);
  assert.equal((await human(editor, "/state")).status, 403);
  assert.equal((await human(owner, "/state")).status, 200);
  assert.equal((await agent("/report", { method: "POST" }, "wrong-token-wrong-token-1234")).status, 401);
  // A human session cookie never authenticates the agent.
  assert.equal((await fetch(base + "/agent/report", { method: "POST", headers: { Cookie: `monitor-session=${owner.token}` } })).status, 401);
  assert.equal((await agent("/screenshot", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" }, SECOND_TOKEN)).status, 415);
  const reject = await human(owner, "/jobs", "POST", { type: "format-disk" });
  assert.equal(reject.status, 400);
});

test("a queued job reaches a waiting agent, and its report completes the job", async () => {
  const owner = identity("rc-owner-2", "owner");
  const polling = agent("/poll?host=PC&v=2.0.0&claude=1").then((r) => r.json());
  await new Promise((r) => setTimeout(r, 100));
  const { job } = await (await human(owner, "/jobs", "POST", { type: "connect", args: { title: "My session", occurrence: 1 } })).json();
  const { jobs } = await polling;
  assert.equal(jobs[0].id, job.id);
  assert.deepEqual(jobs[0].args, { title: "My session", occurrence: 1 });
  const done = await agent("/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId: job.id, ok: true, result: { title: "My session", link: "https://claude.ai/code/abc", enabled: true }, sessions: [{ title: "My session", status: "Idle", section: "Show 5 more in Older" }], current: "My session" }),
  });
  assert.equal(done.status, 200);
  const state = await (await human(owner, "/state")).json();
  assert.equal(state.jobs.find((j) => j.id === job.id).status, "done");
  assert.equal(state.links["My session"].link, "https://claude.ai/code/abc");
  assert.equal(state.sessions[0].title, "My session");
  assert.equal(state.sessions[0].section, "Older");
  assert.equal(state.agent.host, "PC");
});

test("screenshots upload as images and are served only to owners", async () => {
  const owner = identity("rc-owner-3", "owner"),
    reader = identity("rc-reader", "reader");
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  assert.equal((await agent("/screenshot", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" })).status, 415);
  assert.equal((await agent("/screenshot", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: image })).status, 200);
  assert.equal((await human(reader, "/screenshot")).status, 403);
  const shot = await human(owner, "/screenshot");
  assert.equal(shot.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await shot.arrayBuffer()), image);
});

test("two connected PCs keep their own waits and the most recent poll takes the job", async () => {
  const owner = identity("rc-owner-4", "owner");
  const abort = new AbortController();
  let firstAnswered = false;
  const first = agent("/poll?host=PC-A&v=2.1.0", { signal: abort.signal }).then(() => { firstAnswered = true; }).catch(() => {});
  await new Promise((r) => setTimeout(r, 100));
  const second = agent("/poll?host=PC-B&v=2.1.0", {}, SECOND_TOKEN).then((r) => r.json());
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(firstAnswered, false, "a second PC must not end the first PC's wait");
  const { job } = await (await human(owner, "/jobs", "POST", { type: "status" })).json();
  assert.equal((await second).jobs[0].id, job.id);
  assert.equal(firstAnswered, false);
  abort.abort();
  await first;
});
