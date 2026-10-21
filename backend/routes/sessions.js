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
// No valid session: a remembered device may open a new one without password or code.
const resume = (req, res, next) => {
  if (s.readSession(db, req)) return pending(req, res, next);
  if (req.headers.cookie?.includes(s.deviceCookieName() + "=")) {
    if (!s.limit(db, req, res, "device-resume", 60)) return;
    const resumed = s.resumeDevice(db, req, res);
    if (resumed) {
      s.setCookie(res, resumed.token);
      const user = db.prepare("SELECT id,username,role FROM users WHERE id=?").get(resumed.userId);
      res.set("Cache-Control", "no-store");
      return res.json({ user: { ...user, service: false }, csrf: resumed.csrf, next: "ready" });
    }
  }
  return pending(req, res, next);
};
router.get("/session", resume, (req, res) =>
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
  // Signing out also forgets this browser, so the next visit asks for password and code.
  const device = s.currentDeviceId(db, req) ?? req.session.device_id;
  if (device) s.forgetDeviceById(db, req.user.id, device);
  s.clearDeviceCookie(res);
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
      db.prepare("DELETE FROM auth_devices WHERE user_id=?").run(req.user.id);
    })();
    s.clearDeviceCookie(res);
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
  // "Remember this device" is offered only after password and code both succeeded.
  const deviceId = req.body.remember === true && req.session.kind === "user"
    ? s.rememberDevice(db, res, user.id, { userAgent: req.headers["user-agent"] })
    : null;
  const session = s.makeSession(db, user.id, { mfa: true, deviceId });
  s.setCookie(res, session.token);
  if (deviceId) notifyRemembered(user.id, s.deviceLabel(req.headers["user-agent"]));
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
    db.prepare("DELETE FROM auth_devices WHERE user_id=?").run(user.id);
    s.clearDeviceCookie(res);
    res.json({ message: "הסיסמה שונתה. שאר ההתחברויות והמכשירים השמורים נותקו." });
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
  db.prepare("DELETE FROM auth_devices WHERE user_id=? AND id IS NOT ?").run(
    req.user.id,
    s.currentDeviceId(db, req) ?? req.session.device_id ?? null,
  );
  res.json({ ok: true });
});
router.get("/devices", authenticateToken, (req, res) => {
  const current = s.currentDeviceId(db, req) ?? req.session.device_id ?? null;
  res.json({
    devices: db
      .prepare("SELECT id,label,created_at,last_used,expires_at FROM auth_devices WHERE user_id=? AND expires_at>? ORDER BY last_used DESC")
      .all(req.user.id, Date.now())
      .map((row) => ({ ...row, current: row.id === current })),
  });
});
router.delete("/devices/:id", authenticateToken, (req, res) => {
  if (req.user.service) return s.failure(res, 403, "לחשבון הבדיקה הרשאת קריאה בלבד.");
  const id = Number(req.params.id);
  const current = s.currentDeviceId(db, req) ?? req.session.device_id ?? null;
  // Keep this tab signed in even when forgetting this browser; only future visits ask again.
  if (id === current) db.prepare("UPDATE auth_sessions SET device_id=NULL WHERE token_hash=?").run(req.session.token_hash);
  if (!Number.isInteger(id) || !s.forgetDeviceById(db, req.user.id, id))
    return s.failure(res, 404, "המכשיר לא נמצא.");
  if (id === current) s.clearDeviceCookie(res);
  res.json({ ok: true });
});
function notifyRemembered(userId, label) {
  require("../push")
    .sendPush({ title: "מכשיר נשמר בחשבון", body: `${label} יתחבר בלי סיסמה וקוד עד 30 יום. לא אתם? הסירו אותו בהגדרות › אבטחה.`, url: "/serve-monitor/settings?tab=security" },
      { userId, urgent: true })
    .catch(() => {});
}
const createSessionToken = (user) =>
  s.makeSession(db, user.id, {
    mfa: true,
    kind: "monitor",
    lifetime: 5 * 60000,
  }).token;
module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.createSessionToken = createSessionToken;
