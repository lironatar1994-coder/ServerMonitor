const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const argon2 = require("argon2");
const bcrypt = require("bcryptjs");
const OTPAuth = require("otpauth");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const random = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const now = () => Date.now();
const production = () => process.env.NODE_ENV === "production";
const cookieName = () => (production() ? "__Host-monitor" : "monitor-session");
const origin = () =>
  process.env.MONITOR_ORIGIN || "https://monitor.vee-app.co.il";
const failure = (res, status, error) => res.status(status).json({ error });
function initSecurity(db) {
  const columns = db
    .prepare("PRAGMA table_info(users)")
    .all()
    .map((row) => row.name);
  for (const [name, spec] of Object.entries({
    role: "TEXT NOT NULL DEFAULT 'reader'",
    disabled: "INTEGER NOT NULL DEFAULT 0",
    password_upgrade: "INTEGER NOT NULL DEFAULT 0",
    mfa_secret: "TEXT",
    mfa_pending: "TEXT",
    mfa_step: "INTEGER NOT NULL DEFAULT -1",
  }))
    if (!columns.includes(name))
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${spec}`);
  if (!columns.includes("role"))
    db.prepare("UPDATE users SET role='owner' WHERE username='admin'").run();
  db.exec(`CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,expires_at INTEGER NOT NULL,mfa_at INTEGER NOT NULL DEFAULT 0,kind TEXT NOT NULL DEFAULT 'user');
    CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);
    CREATE TABLE IF NOT EXISTS auth_recovery (user_id INTEGER NOT NULL REFERENCES users(id),code_hash TEXT NOT NULL,PRIMARY KEY(user_id,code_hash));
    CREATE TABLE IF NOT EXISTS auth_limits (bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);`);
}
function serverKey() {
  const file =
    process.env.AUTH_KEY_FILE ||
    (production()
      ? "/root/.server-monitor-auth-key"
      : path.join(__dirname, ".auth-key"));
  if (!fs.existsSync(file)) {
    if (production()) throw new Error("AUTH_KEY_FILE is required");
    fs.writeFileSync(file, crypto.randomBytes(32), { mode: 0o600, flag: "wx" });
  }
  const key = fs.readFileSync(file);
  if (key.length !== 32) throw new Error("AUTH_KEY_FILE must contain 32 bytes");
  return key;
}
function seal(value) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", serverKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
function unseal(value) {
  const b = Buffer.from(value, "base64"),
    d = crypto.createDecipheriv("aes-256-gcm", serverKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}
const passwordHash = (password) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
async function verifyPassword(user, password, db) {
  if (typeof password !== "string" || password.length > 1024) return false;
  const legacy = !user.password.startsWith("$argon2"),
    valid = legacy
      ? await bcrypt.compare(password, user.password)
      : await argon2.verify(user.password, password);
  if (valid && legacy)
    db.prepare("UPDATE users SET password=? WHERE id=?").run(
      await passwordHash(password),
      user.id,
    );
  return valid;
}
function makeSession(
  db,
  userId,
  { mfa = false, kind = "user", lifetime = 12 * 3600000 } = {},
) {
  const token = random(),
    t = now(),
    csrf = random();
  db.prepare("DELETE FROM auth_sessions WHERE expires_at<? OR last_seen<?").run(
    t,
    t - 30 * 60000,
  );
  db.prepare("INSERT INTO auth_sessions VALUES (?,?,?,?,?,?,?,?)").run(
    hash(token),
    userId,
    csrf,
    t,
    t,
    t + lifetime,
    mfa ? t : 0,
    kind,
  );
  return { token, csrf };
}
function setCookie(res, token) {
  res.cookie(cookieName(), token, {
    httpOnly: true,
    secure: production(),
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 3600000,
  });
}
function readSession(db, req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName() + "="));
  const token = cookie
    ? cookie.slice(cookie.indexOf("=") + 1)
    : req.headers.authorization?.replace(/^Bearer /, "");
  if (typeof token !== "string" || token.length > 128) return null;
  const row = db
    .prepare(
      "SELECT s.*,u.username,u.role,u.disabled,u.mfa_secret,u.password_upgrade FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?",
    )
    .get(hash(token));
  if (
    !row ||
    row.disabled ||
    row.expires_at <= now() ||
    row.last_seen < now() - 30 * 60000 ||
    (req.headers.authorization && row.kind !== "monitor")
  )
    return null;
  db.prepare("UPDATE auth_sessions SET last_seen=? WHERE token_hash=?").run(
    now(),
    row.token_hash,
  );
  return row;
}
function allowedOrigin(req) {
  return production()
    ? req.headers.origin === origin()
    : /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
        req.headers.origin || "",
      );
}
function authMiddleware(db, { pending = false } = {}) {
  return (req, res, next) => {
    const session = readSession(db, req);
    if (!session) return failure(res, 401, "ההתחברות פגה. יש להתחבר מחדש.");
    if (
      !pending &&
      (!session.mfa_at || (session.password_upgrade && session.kind === "user"))
    )
      return failure(res, 401, "נדרש אימות דו־שלבי.");
    if (session.kind === "monitor" && !["GET", "HEAD"].includes(req.method))
      return failure(res, 403, "לחשבון הבדיקה הרשאת קריאה בלבד.");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.headers["x-csrf-token"] !== session.csrf || !allowedOrigin(req))
    )
      return failure(res, 403, "הבקשה נדחתה. רעננו את הדף.");
    req.session = session;
    req.user = {
      id: session.user_id,
      username: session.username,
      role: session.role,
      service: session.kind === "monitor",
    };
    res.set("Cache-Control", "no-store");
    next();
  };
}
function owner(req, res, next) {
  return req.user.role === "owner" && !req.user.service
    ? next()
    : failure(res, 403, "הפעולה זמינה לבעלי המערכת בלבד.");
}
function recentMfa(req, res, next) {
  return req.session.kind === "user" && req.session.mfa_at > now() - 5 * 60000
    ? next()
    : res
        .status(403)
        .json({ error: "יש לאמת שוב את קוד האימות.", code: "MFA_REQUIRED" });
}
function limit(db, req, res, name, count = 10, duration = 15 * 60000) {
  const bucket = hash(name + ":" + req.ip),
    t = now();
  db.prepare("DELETE FROM auth_limits WHERE expires_at<?").run(t);
  db.prepare(
    "INSERT INTO auth_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
  ).run(bucket, t + duration);
  const entry = db
    .prepare("SELECT * FROM auth_limits WHERE bucket=?")
    .get(bucket);
  if (entry.count > count) {
    res.set("Retry-After", String(Math.ceil((entry.expires_at - t) / 1000)));
    failure(res, 429, "בוצעו ניסיונות רבים. נסו שוב מאוחר יותר.");
    return false;
  }
  return true;
}
function totp(secret, username = "ServerMonitor") {
  return new OTPAuth.TOTP({
    issuer: "Server Monitor",
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}
function consumeMfa(db, user, code, encryptedSecret = user.mfa_secret) {
  if (typeof code !== "string" || !encryptedSecret) return false;
  if (/^\d{6}$/.test(code)) {
    const delta = totp(unseal(encryptedSecret)).validate({
      token: code,
      window: 1,
    });
    if (delta == null) return false;
    const step = Math.floor(now() / 30000) + delta;
    return (
      db
        .prepare("UPDATE users SET mfa_step=? WHERE id=? AND mfa_step<?")
        .run(step, user.id, step).changes === 1
    );
  }
  return (
    db
      .prepare("DELETE FROM auth_recovery WHERE user_id=? AND code_hash=?")
      .run(user.id, hash(code)).changes === 1
  );
}
module.exports = {
  initSecurity,
  hash,
  random,
  now,
  production,
  cookieName,
  origin,
  failure,
  seal,
  unseal,
  passwordHash,
  verifyPassword,
  makeSession,
  setCookie,
  readSession,
  authMiddleware,
  allowedOrigin,
  owner,
  recentMfa,
  limit,
  totp,
  consumeMfa,
  OTPAuth,
};
