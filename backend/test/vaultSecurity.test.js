const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-vault-test-"));
process.env.MONITOR_DB_PATH = path.join(dir, "monitor.db");
process.env.AUTH_KEY_FILE = path.join(dir, "auth.key");
process.env.VAULT_ENABLED = "true";
process.env.NODE_ENV = "test";
const db = require("../database"),
  s = require("../security"),
  v = require("../vault");
s.initSecurity(db);
v.initVault(db);
let server, base;
test.before(async () => {
  server = require("../server").listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/serve-monitor/api`;
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
function identity(username, role = "reader") {
  const id = Number(
      db
        .prepare("INSERT INTO users(username,password,role) VALUES (?,?,?)")
        .run(username, "not-a-login-hash", role).lastInsertRowid,
    ),
    session = s.makeSession(db, id, { mfa: true });
  return { id, session };
}
async function request(user, url, method = "GET", body, extra = {}) {
  return fetch(base + url, {
    method,
    headers: {
      ...(user
        ? {
            Cookie: `monitor-session=${user.session.token}`,
            "X-CSRF-Token": user.session.csrf,
          }
        : {}),
      Origin: "http://127.0.0.1",
      "Content-Type": "application/json",
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
test("sessions require cookies, CSRF, MFA and current roles; monitoring identities cannot access vault", async () => {
  const owner = identity("owner", "owner"),
    reader = identity("reader");
  assert.equal((await request(null, "/vault/status")).status, 401);
  assert.equal((await request(owner, "/vault/status")).status, 200);
  assert.equal(
    (await request(reader, "/apps/1/action", "POST", { action: "restart" }))
      .status,
    403,
  );
  assert.equal((await request(reader, "/apps/1/logs")).status, 403);
  assert.equal(
    (await request(owner, "/vault/invites", "POST", {}, { "X-CSRF-Token": "" }))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        owner,
        "/vault/invites",
        "POST",
        {},
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(null, "/vault/status", "GET", undefined, {
        Authorization: `Bearer ${owner.session.token}`,
      })
    ).status,
    401,
  );
  const monitor = s.makeSession(db, owner.id, { kind: "monitor", mfa: true });
  assert.equal(
    (
      await request(null, "/vault/status", "GET", undefined, {
        Authorization: `Bearer ${monitor.token}`,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(null, "/apps", "GET", undefined, {
        Authorization: `Bearer ${monitor.token}`,
      })
    ).status,
    200,
  );
  db.prepare("UPDATE auth_sessions SET mfa_at=0 WHERE token_hash=?").run(
    s.hash(reader.session.token),
  );
  assert.equal((await request(reader, "/vault/status")).status, 401);
});
test("encrypted vault CRUD, reader denial, conflicts, last owner, revocation and atomic rotation", async () => {
  const c = await import("../../frontend/src/vault/crypto.js"),
    owner = identity("vault-owner", "owner"),
    reader = identity("vault-reader"),
    raw = c.randomBytes(32),
    key = await c.aes(raw);
  for (const u of [owner, reader]) {
    u.keys = await c.makeIdentity(u.id, "synthetic vault passphrase");
    assert.equal(
      (await request(u, "/vault/keys", "POST", u.keys.record)).status,
      201,
    );
  }
  assert.equal(
    (
      await request(owner, "/vault/initialize", "POST", {
        wrappedKey: await c.wrapKey(raw, owner.keys.record.publicKey),
      })
    ).status,
    201,
  );
  assert.equal((await request(reader, "/vault/entries")).status, 403);
  assert.equal(
    (
      await request(owner, `/vault/members/${owner.id}`, "PATCH", {
        role: "reader",
        disabled: false,
      })
    ).status,
    409,
    "the last owner with a vault key cannot be demoted",
  );
  const grant = {
    wrappedKey: await c.wrapKey(raw, reader.keys.record.publicKey),
    epoch: 1,
    fingerprint: v.fingerprint(reader.keys.record.publicKey),
  };
  assert.equal(
    (await request(owner, `/vault/members/${reader.id}/grant`, "POST", grant))
      .status,
    200,
  );
  const id = crypto.randomUUID(),
    metadata = await c.encrypt(
      key,
      {
        title: "synthetic",
        username: "demo@example.test",
        url: "https://example.test",
      },
      c.entryContext(id, "metadata", 1, 1),
    ),
    secret = await c.encrypt(
      key,
      { password: "secret-fixture", notes: "" },
      c.entryContext(id, "secret", 1, 1),
    ),
    body = { epoch: 1, expectedVersion: 0, metadata, secret };
  assert.equal(
    (await request(reader, `/vault/entries/${id}`, "PUT", body)).status,
    403,
  );
  assert.equal(
    (await request(owner, `/vault/entries/${id}`, "PUT", body)).status,
    200,
  );
  assert.equal(
    (await request(owner, `/vault/entries/${id}`, "PUT", body)).status,
    409,
  );
  const list = await (await request(reader, "/vault/entries")).json();
  assert.equal(list.entries.length, 1);
  assert.equal("secret" in list.entries[0], false);
  assert.equal(JSON.stringify(list).includes("demo@example.test"), false);
  assert.equal(
    db
      .prepare("SELECT secret FROM vault_entries WHERE id=?")
      .get(id)
      .secret.includes("secret-fixture"),
    false,
  );
  assert.equal(
    (
      await request(owner, `/vault/members/${reader.id}`, "PATCH", {
        role: "reader",
        disabled: true,
      })
    ).status,
    200,
  );
  assert.equal((await request(reader, "/vault/entries")).status, 401);
  const snapshot = await (await request(owner, "/vault/rotation")).json();
  assert.equal(snapshot.state.rotation_required, 1);
  assert.equal(
    (
      await request(owner, `/vault/entries/${id}`, "PUT", {
        ...body,
        expectedVersion: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(owner, "/vault/rotate", "POST", {
        revision: snapshot.state.revision,
        entries: [],
        members: [],
      })
    ).status,
    409,
  );
  const fresh = c.randomBytes(32),
    freshKey = await c.aes(fresh);
  const rotated = {
    revision: snapshot.state.revision,
    entries: [
      {
        id,
        version: 1,
        metadata: await c.encrypt(
          freshKey,
          await c.decrypt(key, metadata, c.entryContext(id, "metadata", 1, 1)),
          c.entryContext(id, "metadata", 1, 2),
        ),
        secret: await c.encrypt(
          freshKey,
          { password: "secret-fixture", notes: "" },
          c.entryContext(id, "secret", 1, 2),
        ),
      },
    ],
    members: [
      {
        userId: owner.id,
        wrappedKey: await c.wrapKey(fresh, owner.keys.record.publicKey),
      },
    ],
  };
  assert.equal(
    (await request(owner, "/vault/rotate", "POST", rotated)).status,
    200,
  );
  assert.equal(db.prepare("SELECT epoch FROM vault_state").get().epoch, 2);
  const backup = path.join(dir, "restore.db");
  await db.backup(backup);
  const restored = new (require("better-sqlite3"))(backup);
  const row = restored.prepare("SELECT * FROM vault_entries").get();
  assert.equal(
    (
      await c.decrypt(
        freshKey,
        JSON.parse(row.secret),
        c.entryContext(id, "secret", 1, 2),
      )
    ).password,
    "secret-fixture",
  );
  restored.close();
});
test("invitation is expiring and single-use; enrollment rotates sessions and logout revokes them", async () => {
  const owner = identity("inviting-owner", "owner");
  const invite = await (
    await request(owner, "/vault/invites", "POST", {})
  ).json();
  const accepted = await request(null, "/vault/accept-invite", "POST", {
    token: invite.token,
    username: "invited-user",
    password: "A long synthetic login passphrase",
  });
  assert.equal(accepted.status, 200);
  const initial = await accepted.json();
  const member = {
    session: {
      token: accepted.headers.get("set-cookie").split(";")[0].split("=")[1],
      csrf: initial.csrf,
    },
  };
  assert.equal(
    (
      await request(null, "/vault/accept-invite", "POST", {
        token: invite.token,
        username: "replayed-user",
        password: "A long synthetic login passphrase",
      })
    ).status,
    400,
  );
  assert.equal((await request(member, "/vault/status")).status, 401);
  const setup = await (
    await request(member, "/auth/mfa/setup", "POST", {})
  ).json();
  const response = await request(member, "/auth/mfa/verify", "POST", {
    code: s.totp(setup.secret).generate(),
  });
  assert.equal(response.status, 200);
  const verified = await response.json();
  assert.equal(verified.recoveryCodes.length, 8);
  assert.equal((await request(member, "/auth/session")).status, 401);
  member.session = {
    token: response.headers.get("set-cookie").split(";")[0].split("=")[1],
    csrf: verified.csrf,
  };
  assert.equal((await request(member, "/vault/status")).status, 200);
  assert.equal((await request(member, "/auth/logout", "POST", {})).status, 200);
  assert.equal((await request(member, "/auth/session")).status, 401);
  const expired = await (
    await request(owner, "/vault/invites", "POST", {})
  ).json();
  db.prepare("UPDATE vault_invites SET expires_at=0 WHERE token_hash=?").run(
    s.hash(expired.token),
  );
  assert.equal(
    (
      await request(null, "/vault/accept-invite", "POST", {
        token: expired.token,
        username: "expired-user",
        password: "A long synthetic login passphrase",
      })
    ).status,
    400,
  );
});
test("TOTP and recovery codes are one-use; session expiry and MFA recency fail closed", async () => {
  const u = identity("mfa-user", "owner"),
    secret = new s.OTPAuth.Secret({ size: 20 }).base32;
  db.prepare("UPDATE users SET mfa_secret=? WHERE id=?").run(
    s.seal(secret),
    u.id,
  );
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(u.id),
    code = s.totp(secret).generate();
  assert.equal(s.consumeMfa(db, user, code), true);
  assert.equal(s.consumeMfa(db, user, code), false);
  db.prepare("INSERT INTO auth_recovery VALUES (?,?)").run(
    u.id,
    s.hash("fixture-recovery-code"),
  );
  assert.equal(s.consumeMfa(db, user, "fixture-recovery-code"), true);
  assert.equal(s.consumeMfa(db, user, "fixture-recovery-code"), false);
  db.prepare("UPDATE auth_sessions SET mfa_at=? WHERE token_hash=?").run(
    Date.now() - 6 * 60000,
    s.hash(u.session.token),
  );
  assert.equal((await request(u, "/vault/invites", "POST", {})).status, 403);
  db.prepare("UPDATE auth_sessions SET expires_at=0 WHERE token_hash=?").run(
    s.hash(u.session.token),
  );
  assert.equal((await request(u, "/auth/session")).status, 401);
});
test("legacy short passwords require upgrade before MFA and cannot skip into a full session", async () => {
  const u = identity("legacy-short");
  db.prepare("UPDATE users SET password=? WHERE id=?").run(
    require("bcryptjs").hashSync("short-demo", 4),
    u.id,
  );
  const login = await request(null, "/auth/login", "POST", {
    username: "legacy-short",
    password: "short-demo",
  });
  const result = await login.json();
  assert.equal(result.next, "password");
  u.session = {
    token: login.headers.get("set-cookie").split(";")[0].split("=")[1],
    csrf: result.csrf,
  };
  assert.equal((await request(u, "/auth/mfa/setup", "POST", {})).status, 409);
  assert.equal((await request(u, "/vault/status")).status, 401);
  const changed = await request(u, "/auth/upgrade-password", "POST", {
    password: "A stronger synthetic password!",
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).next, "enroll");
  assert.equal((await request(u, "/auth/session")).status, 401);
});
