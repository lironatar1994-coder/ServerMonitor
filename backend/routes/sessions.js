const express = require("express");
const db = require("../database");
const s = require("../security");
const router = express.Router();
s.initSecurity(db);
const authenticateToken = s.authMiddleware(db),
  pending = s.authMiddleware(db, { pending: true });
const profile = (session) => ({
  id: session.user_id,
  username: session.username,
  role: session.kind === "monitor" ? "reader" : session.role,
  service: session.kind === "monitor",
});
const route = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};
router.post(
  "/login",
  route(async (req, res) => {
    if (!s.allowedOrigin(req))
      return s.failure(res, 403, "מקור הבקשה אינו מורשה.");
    if (!s.limit(db, req, res, "login", 15)) return;
    const { username, password } = req.body;
    if (
      typeof username !== "string" ||
      username.length > 80 ||
      typeof password !== "string" ||
      password.length > 256
    )
      return s.failure(res, 401, "שם המשתמש או הסיסמה אינם נכונים.");
    if (
      !s.limit(
        db,
        { ip: s.hash(username.toLowerCase()) },
        res,
        "login-account",
        30,
      )
    )
      return;
    const user =
      typeof username === "string" &&
      db
        .prepare("SELECT * FROM users WHERE username=? AND disabled=0")
        .get(username);
    if (!user) await s.passwordHash(password);
    if (!user || !(await s.verifyPassword(user, password, db)))
      return s.failure(res, 401, "שם המשתמש או הסיסמה אינם נכונים.");
    const session = s.makeSession(db, user.id, { lifetime: 5 * 60000 });
    const passwordUpgrade = password.length < 15 || user.password_upgrade;
    if (passwordUpgrade)
      db.prepare("UPDATE users SET password_upgrade=1 WHERE id=?").run(user.id);
    s.setCookie(res, session.token);
    res.json({
      csrf: session.csrf,
      next: passwordUpgrade ? "password" : user.mfa_secret ? "mfa" : "enroll",
      username: user.username,
    });
  }),
);
router.get("/session", pending, (req, res) =>
  res.json({
    user: profile(req.session),
    csrf: req.session.csrf,
    next:
      req.session.password_upgrade && req.session.kind === "user"
        ? "password"
        : req.session.mfa_at
          ? "ready"
          : req.session.mfa_secret
            ? "mfa"
            : "enroll",
  }),
);
router.post("/logout", pending, (req, res) => {
  db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(
    req.session.token_hash,
  );
  res.clearCookie(s.cookieName(), {
    path: "/",
    secure: s.production(),
    httpOnly: true,
    sameSite: "strict",
  });
  res.json({ ok: true });
});
router.post(
  "/upgrade-password",
  pending,
  route(async (req, res) => {
    if (!req.session.password_upgrade || req.session.mfa_at)
      return s.failure(res, 409, "אין צורך בעדכון סיסמה.");
    const password = req.body.password;
    if (
      typeof password !== "string" ||
      password.length < 15 ||
      password.length > 256
    )
      return s.failure(res, 400, "הסיסמה צריכה להכיל 15–256 תווים.");
    const encoded = await s.passwordHash(password);
    db.transaction(() => {
      db.prepare(
        "UPDATE users SET password=?,password_upgrade=0 WHERE id=?",
      ).run(encoded, req.user.id);
      db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(req.user.id);
    })();
    const session = s.makeSession(db, req.user.id, { lifetime: 5 * 60000 });
    s.setCookie(res, session.token);
    res.json({
      csrf: session.csrf,
      next: req.session.mfa_secret ? "mfa" : "enroll",
    });
  }),
);
router.post("/mfa/setup", pending, (req, res) => {
  if (req.session.password_upgrade)
    return s.failure(res, 409, "יש לעדכן תחילה את סיסמת הכניסה.");
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (user.mfa_secret) return s.failure(res, 409, "כבר הוגדר אימות דו־שלבי.");
  // Refresh/retry keeps the phone's just-scanned key valid until enrollment.
  const secret = user.mfa_pending
    ? s.unseal(user.mfa_pending)
    : new s.OTPAuth.Secret({ size: 20 }).base32;
  if (!user.mfa_pending) db.prepare("UPDATE users SET mfa_pending=? WHERE id=?").run(s.seal(secret), user.id);
  res.json({ secret, uri: s.totp(secret, user.username).toString() });
});
router.post("/mfa/verify", pending, (req, res) => {
  if (req.session.password_upgrade)
    return s.failure(res, 409, "יש לעדכן תחילה את סיסמת הכניסה.");
  if (!s.limit(db, req, res, "mfa:" + req.user.id, 10)) return;
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id),
    enrolling = !user.mfa_secret;
  if (
    !s.consumeMfa(db, user, req.body.code, user.mfa_secret || user.mfa_pending)
  )
    return s.failure(res, 400, "הקוד אינו תקין או כבר נוצל.");
  let recoveryCodes;
  db.transaction(() => {
    if (enrolling) {
      db.prepare(
        "UPDATE users SET mfa_secret=mfa_pending,mfa_pending=NULL WHERE id=?",
      ).run(user.id);
      recoveryCodes = Array.from({ length: 8 }, () => s.random(15));
      db.prepare("DELETE FROM auth_recovery WHERE user_id=?").run(user.id);
      for (const code of recoveryCodes)
        db.prepare("INSERT INTO auth_recovery VALUES (?,?)").run(
          user.id,
          s.hash(code),
        );
    }
    db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(
      req.session.token_hash,
    );
  })();
  const session = s.makeSession(db, user.id, { mfa: true });
  s.setCookie(res, session.token);
  res.json({
    csrf: session.csrf,
    user: { id: user.id, username: user.username, role: user.role },
    next: "ready",
    recoveryCodes,
  });
});
router.post(
  "/change-password",
  authenticateToken,
  route(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!s.limit(db, req, res, "change-password:" + req.user.id, 10)) return;
    if (
      typeof newPassword !== "string" ||
      newPassword.length < 15 ||
      newPassword.length > 256
    )
      return s.failure(res, 400, "הסיסמה החדשה צריכה להכיל 15–256 תווים.");
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
    if (!(await s.verifyPassword(user, oldPassword, db)))
      return s.failure(res, 400, "הסיסמה הנוכחית אינה נכונה.");
    db.prepare("UPDATE users SET password=? WHERE id=?").run(
      await s.passwordHash(newPassword),
      user.id,
    );
    db.prepare(
      "DELETE FROM auth_sessions WHERE user_id=? AND token_hash<>?",
    ).run(user.id, req.session.token_hash);
    res.json({ message: "הסיסמה שונתה. שאר ההתחברויות נותקו." });
  }),
);
router.get("/sessions", authenticateToken, (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT created_at,last_seen,expires_at,token_hash=? AS current FROM auth_sessions WHERE user_id=? AND expires_at>? AND kind='user'",
      )
      .all(req.session.token_hash, req.user.id, Date.now()),
  ),
);
router.post("/sessions/revoke", authenticateToken, (req, res) => {
  db.prepare("DELETE FROM auth_sessions WHERE user_id=? AND token_hash<>?").run(
    req.user.id,
    req.session.token_hash,
  );
  res.json({ ok: true });
});
router.post(
  "/test-whatsapp",
  authenticateToken,
  s.owner,
  route(async (req, res) => {
    const { phone, message } = req.body;
    if (
      typeof phone !== "string" ||
      !/^\+?[\d -]{8,20}$/.test(phone) ||
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 2000
    )
      return s.failure(res, 400, "בדקו את המספר ואת תוכן ההודעה.");
    const { promisify } = require("node:util"),
      { execFile } = require("node:child_process");
    let active = false;
    try {
      const { stdout } = await promisify(execFile)("pm2", ["jlist"], {
        timeout: 5000,
        maxBuffer: 4 * 1024 * 1024,
      });
      active = JSON.parse(stdout).some(
        (p) =>
          p.name === "vee-whatsapp-worker" && p.pm2_env?.status === "online",
      );
    } catch {
      return s.failure(res, 409, "לא ניתן לאמת ששירות WhatsApp פעיל.");
    }
    if (!active)
      return s.failure(res, 409, "שירות WhatsApp אינו פעיל. ההודעה לא נשלחה.");
    const file = "/root/Vee/backend/database.sqlite";
    if (!require("node:fs").existsSync(file))
      return s.failure(res, 409, "בסיס נתוני ההודעות אינו זמין.");
    const messages = new (require("better-sqlite3"))(file, {
      fileMustExist: true,
    });
    try {
      messages
        .prepare("INSERT INTO whatsapp_outbox(to_phone,message) VALUES (?,?)")
        .run(phone, message);
    } finally {
      messages.close();
    }
    res.json({ message: "ההודעה נוספה לתור השליחה." });
  }),
);
const createSessionToken = (user) =>
  s.makeSession(db, user.id, {
    mfa: true,
    kind: "monitor",
    lifetime: 5 * 60000,
  }).token;
module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.createSessionToken = createSessionToken;
