const express = require("express");
const db = require("../database");
const s = require("../security");
const v = require("../vault");
const { authenticateToken } = require("./auth");
const router = express.Router();
v.initVault(db);
const fail = s.failure;
const state = () =>
  db
    .prepare(
      "SELECT epoch,revision,rotation_required FROM vault_state WHERE id=1",
    )
    .get();
const bump = () =>
  db.prepare("UPDATE vault_state SET revision=revision+1 WHERE id=1").run();
const parse = (row) => ({
  ...row,
  metadata: JSON.parse(row.metadata),
  secret: row.secret ? JSON.parse(row.secret) : undefined,
});
const wrapValid = (value) =>
  typeof value === "string" && /^[A-Za-z0-9+/]{512}$/.test(value);
const asyncRoute = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};
let lastPurge = 0;
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (process.env.VAULT_ENABLED !== "true")
    return fail(res, 503, "הכספת אינה זמינה כרגע.");
  next();
});
router.post(
  "/accept-invite",
  asyncRoute(async (req, res) => {
    if (!s.allowedOrigin(req)) return fail(res, 403, "מקור הבקשה אינו מורשה.");
    if (!s.limit(db, req, res, "invite-accept", 10)) return;
    const { token, username, password } = req.body;
    if (
      typeof token !== "string" ||
      token.length > 128 ||
      typeof username !== "string" ||
      !/^[\p{L}\p{N}_.@-]{3,80}$/u.test(username) ||
      typeof password !== "string" ||
      password.length < 15 ||
      password.length > 256
    )
      return fail(res, 400, "בדקו את שם המשתמש והסיסמה (15 תווים לפחות).");
    const invite = db
      .prepare(
        "SELECT v.* FROM vault_invites v JOIN users u ON u.id=v.created_by WHERE v.token_hash=? AND v.expires_at>? AND u.role='owner' AND u.disabled=0",
      )
      .get(s.hash(token), Date.now());
    if (!invite) return fail(res, 400, "ההזמנה פגה או כבר נוצלה.");
    if (db.prepare("SELECT id FROM users WHERE username=?").get(username))
      return fail(res, 409, "שם המשתמש אינו זמין.");
    const hashed = await s.passwordHash(password);
    const userId = db.transaction(() => {
      if (
        !db
          .prepare(
          "DELETE FROM vault_invites WHERE token_hash=? AND expires_at>? AND created_by IN (SELECT id FROM users WHERE role='owner' AND disabled=0)",
          )
          .run(s.hash(token), Date.now()).changes
      )
        return null;
      const id = db
        .prepare(
          "INSERT INTO users(username,password,role) VALUES (?,?,'reader')",
        )
        .run(username, hashed).lastInsertRowid;
      v.audit(db, id, "invite.accepted");
      return Number(id);
    })();
    if (!userId) return fail(res, 409, "ההזמנה כבר נוצלה.");
    const session = s.makeSession(db, userId, { lifetime: 5 * 60000 });
    s.setCookie(res, session.token);
    res.json({ csrf: session.csrf, next: "enroll", username });
  }),
);
router.use(authenticateToken, (req, res, next) =>
  req.user.service ? fail(res, 403, "לחשבון בדיקה אין גישה לכספת.") : next(),
);
router.use((req, res, next) => {
  if (Date.now() - lastPurge > 3600000) {
    db.transaction(() => {
      const deleted = db
        .prepare(
          "DELETE FROM vault_entries WHERE trashed_at IS NOT NULL AND trashed_at<?",
        )
        .run(Date.now() - 30 * 86400000);
      if (deleted.changes) bump();
    })();
    lastPurge = Date.now();
  }
  next();
});
router.get("/status", (req, res) =>
  res.json({
    state: state() || null,
    keys: v.keysFor(db, req.user.id),
    membership:
      db
        .prepare("SELECT wrapped_key,epoch FROM vault_members WHERE user_id=?")
        .get(req.user.id) || null,
  }),
);
router.post("/keys", s.recentMfa, (req, res) => {
  if (!v.keyRecord(req.body)) return fail(res, 400, "מבנה מפתח אינו תקין.");
  if (v.keysFor(db, req.user.id)) return fail(res, 409, "כבר הוגדר מפתח.");
  v.storeKeys(db, req.user.id, req.body);
  v.audit(db, req.user.id, "keys.created");
  res.status(201).json({ ok: true });
});
router.put("/keys", s.recentMfa, (req, res) => {
  const keys = v.keysFor(db, req.user.id);
  if (!v.keyRecord(req.body) || !keys || keys.publicKey !== req.body.publicKey)
    return fail(res, 400, "מפתח הזהות חייב להישאר זהה.");
  db.prepare(
    "UPDATE vault_keys SET private_key=?,recovery_key=?,kdf=? WHERE user_id=?",
  ).run(
    JSON.stringify(req.body.privateKey),
    req.body.recoveryKey ? JSON.stringify(req.body.recoveryKey) : null,
    JSON.stringify(req.body.kdf),
    req.user.id,
  );
  v.audit(db, req.user.id, "keys.rewrapped");
  res.json({ ok: true });
});
router.post("/keys/reset", s.recentMfa, (req, res) => {
  if (req.user.role === "owner")
    return fail(res, 409, "בעלים משחזרים באמצעות מפתח השחזור.");
  db.transaction(() => {
    db.prepare("DELETE FROM vault_members WHERE user_id=?").run(req.user.id);
    db.prepare("DELETE FROM vault_keys WHERE user_id=?").run(req.user.id);
    db.prepare(
      "UPDATE vault_state SET rotation_required=1,revision=revision+1 WHERE id=1",
    ).run();
    v.audit(db, req.user.id, "keys.reset");
  })();
  res.json({ ok: true });
});
router.post("/initialize", s.owner, s.recentMfa, (req, res) => {
  if (state()) return fail(res, 409, "הכספת כבר הוגדרה.");
  if (!v.keysFor(db, req.user.id) || !wrapValid(req.body.wrappedKey))
    return fail(res, 400, "נדרש מפתח משתמש תקין.");
  db.transaction(() => {
    db.prepare("INSERT INTO vault_state VALUES (1,1,0,0)").run();
    db.prepare("INSERT INTO vault_members VALUES (?,?,1)").run(
      req.user.id,
      req.body.wrappedKey,
    );
    v.audit(db, req.user.id, "vault.created");
  })();
  res.status(201).json({ ok: true });
});
router.get("/members", s.owner, (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT u.id,u.username,u.role,u.disabled,k.public_key,k.fingerprint,m.epoch FROM users u LEFT JOIN vault_keys k ON k.user_id=u.id LEFT JOIN vault_members m ON m.user_id=u.id ORDER BY u.username",
      )
      .all(),
  ),
);
router.post("/invites", s.owner, s.recentMfa, (req, res) => {
  if (!s.limit(db, req, res, "invite-create", 20)) return;
  const token = s.random();
  db.prepare("DELETE FROM vault_invites WHERE expires_at<?").run(Date.now());
  db.prepare("INSERT INTO vault_invites VALUES (?,?,?)").run(
    s.hash(token),
    req.user.id,
    Date.now() + 86400000,
  );
  v.audit(db, req.user.id, "invite.created");
  res.json({ token, expiresAt: Date.now() + 86400000 });
});
router.post("/members/:id/grant", s.owner, s.recentMfa, (req, res) => {
  const current = state(),
    keys = v.keysFor(db, Number(req.params.id));
  if (
    !current ||
    current.rotation_required ||
    !db
      .prepare("SELECT 1 FROM vault_members WHERE user_id=? AND epoch=?")
      .get(req.user.id, current.epoch)
  )
    return fail(res, 409, "נדרשת כספת פעילה והרשאת גישה.");
  if (
    !keys ||
    keys.fingerprint !== req.body.fingerprint ||
    !wrapValid(req.body.wrappedKey) ||
    req.body.epoch !== current.epoch
  )
    return fail(res, 409, "המפתח או גרסת הכספת השתנו.");
  if (
    !db
      .prepare("SELECT 1 FROM users WHERE id=? AND disabled=0")
      .get(req.params.id)
  )
    return fail(res, 404, "המשתמש אינו פעיל.");
  db.prepare(
    "INSERT INTO vault_members VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET wrapped_key=excluded.wrapped_key,epoch=excluded.epoch",
  ).run(req.params.id, req.body.wrappedKey, current.epoch);
  bump();
  v.audit(db, req.user.id, "member.granted", req.params.id);
  res.json({ ok: true });
});
router.patch("/members/:id", s.owner, s.recentMfa, (req, res) => {
  const target = db
      .prepare("SELECT * FROM users WHERE id=?")
      .get(req.params.id),
    { role, disabled } = req.body;
  if (
    !target ||
    !["owner", "editor", "reader"].includes(role) ||
    typeof disabled !== "boolean"
  )
    return fail(res, 400, "הרשאה לא תקינה.");
  if (
    target.role === "owner" &&
    !target.disabled &&
    (role !== "owner" || disabled) &&
    db
      .prepare(
        "SELECT COUNT(*) n FROM users u JOIN vault_members m ON m.user_id=u.id WHERE u.role='owner' AND u.disabled=0",
      )
      .get().n <= 1
  )
    return fail(res, 409, "לא ניתן להסיר את הבעלים האחרון.");
  if (
    role === "owner" &&
    !db.prepare("SELECT 1 FROM vault_members WHERE user_id=?").get(target.id)
  )
    return fail(res, 409, "יש להעניק גישה לכספת לפני מינוי בעלים.");
  db.transaction(() => {
    db.prepare("UPDATE users SET role=?,disabled=? WHERE id=?").run(
      role,
      Number(disabled),
      target.id,
    );
    if (disabled) {
      db.prepare('DELETE FROM vault_invites WHERE created_by=?').run(target.id);
      db.prepare("DELETE FROM vault_members WHERE user_id=?").run(target.id);
      db.prepare("UPDATE vault_state SET rotation_required=1 WHERE id=1").run();
    }
    db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(target.id);
    bump();
    v.audit(
      db,
      req.user.id,
      disabled ? "member.revoked" : "member.role",
      String(target.id),
    );
  })();
  res.json({ ok: true });
});
router.use((req, res, next) => {
  const current = state();
  if (
    !current ||
    !db
      .prepare("SELECT 1 FROM vault_members WHERE user_id=? AND epoch=?")
      .get(req.user.id, current.epoch)
  )
    return fail(res, 403, "אין לך גישה לכספת.");
  req.vault = current;
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.path !== "/rotate" &&
    current.rotation_required
  )
    return fail(
      res,
      409,
      "מפתח הכספת מתחלף. ניתן לנסות שוב לאחר השלמת הפעולה.",
    );
  next();
});
router.get("/entries", (req, res) => {
  const after = typeof req.query.after === "string" ? req.query.after : "",
    trash = req.query.trash === "true";
  const rows = db
    .prepare(
      `SELECT e.id,e.epoch,e.version,e.metadata,e.updated_at,e.updated_by,e.trashed_at,EXISTS(SELECT 1 FROM vault_favorites f WHERE f.entry_id=e.id AND f.user_id=?) AS favorite FROM vault_entries e WHERE e.id>? AND ${trash ? "trashed_at IS NOT NULL AND trashed_at>?" : "trashed_at IS NULL"} ORDER BY e.id LIMIT 100`,
    )
    .all(
      ...(trash
        ? [req.user.id, after, Date.now() - 30 * 86400000]
        : [req.user.id, after]),
    );
  res.json({
    entries: rows.map(parse),
    next: rows.length === 100 ? rows.at(-1).id : null,
    state: state(),
  });
});
router.get("/entries/:id/secret", (req, res) => {
  const row = db
    .prepare("SELECT id,epoch,version,secret FROM vault_entries WHERE id=? AND (trashed_at IS NULL OR trashed_at>?)")
    .get(req.params.id, Date.now() - 30 * 86400000);
  if (!row) return fail(res, 404, "הפריט לא נמצא.");
  v.audit(db, req.user.id, "secret.fetched", row.id);
  res.json({ ...row, secret: JSON.parse(row.secret) });
});
router.post("/entries/:id/favorite", (req, res) => {
  if (!db.prepare("SELECT 1 FROM vault_entries WHERE id=?").get(req.params.id))
    return fail(res, 404, "הפריט לא נמצא.");
  if (req.body.favorite === true)
    db.prepare("INSERT OR IGNORE INTO vault_favorites VALUES (?,?)").run(
      req.user.id,
      req.params.id,
    );
  else
    db.prepare(
      "DELETE FROM vault_favorites WHERE user_id=? AND entry_id=?",
    ).run(req.user.id, req.params.id);
  res.json({ ok: true });
});
router.get("/audit", s.owner, (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT a.*,u.username FROM vault_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100",
      )
      .all(),
  ),
);
router.get("/rotation", s.owner, (req, res) =>
  res.json({
    state: state(),
    entries: db.prepare("SELECT * FROM vault_entries").all().map(parse),
    members: db
      .prepare(
        "SELECT m.user_id,k.public_key,k.fingerprint FROM vault_members m JOIN vault_keys k ON k.user_id=m.user_id JOIN users u ON u.id=m.user_id WHERE u.disabled=0",
      )
      .all(),
  }),
);
router.post("/rotate", s.owner, s.recentMfa, (req, res) => {
  const body = req.body,
    current = state();
  if (!s.limit(db, req, res, "rotation", 5)) return;
  const entries = db
      .prepare("SELECT id,version FROM vault_entries ORDER BY id")
      .all(),
    members = db
      .prepare("SELECT user_id FROM vault_members ORDER BY user_id")
      .all();
  if (
    body.revision !== current.revision ||
    !Array.isArray(body.entries) ||
    body.entries.length !== entries.length ||
    !Array.isArray(body.members) ||
    body.members.length !== members.length
  )
    return fail(res, 409, "הכספת השתנתה. יש להתחיל שוב את החלפת המפתח.");
  const uniqueEntries = new Set(),
    uniqueMembers = new Set();
  for (const e of body.entries) {
    if (
      uniqueEntries.has(e.id) ||
      !entries.some((row) => row.id === e.id && row.version === e.version) ||
      !v.envelope(e.metadata) ||
      !v.envelope(e.secret)
    )
      return fail(res, 400, "נתוני החלפה אינם תקינים.");
    uniqueEntries.add(e.id);
  }
  for (const m of body.members) {
    if (
      uniqueMembers.has(m.userId) ||
      !members.some((row) => row.user_id === m.userId) ||
      !wrapValid(m.wrappedKey)
    )
      return fail(res, 400, "רשימת המפתחות אינה תקינה.");
    uniqueMembers.add(m.userId);
  }
  db.transaction(() => {
    for (const e of body.entries)
      db.prepare(
        "UPDATE vault_entries SET epoch=?,metadata=?,secret=? WHERE id=?",
      ).run(
        current.epoch + 1,
        JSON.stringify(e.metadata),
        JSON.stringify(e.secret),
        e.id,
      );
    for (const m of body.members)
      db.prepare(
        "UPDATE vault_members SET epoch=?,wrapped_key=? WHERE user_id=?",
      ).run(current.epoch + 1, m.wrappedKey, m.userId);
    db.prepare(
      "UPDATE vault_state SET epoch=epoch+1,revision=revision+1,rotation_required=0",
    ).run();
    v.audit(db, req.user.id, "vault.rotated");
  })();
  res.json({ ok: true });
});
router.use((req, res, next) =>
  ["owner", "editor"].includes(req.user.role)
    ? next()
    : fail(res, 403, "יש לך הרשאת קריאה בלבד."),
);
router.put("/entries/:id", (req, res) => {
  const b = req.body,
    row = db
      .prepare("SELECT version,trashed_at FROM vault_entries WHERE id=?")
      .get(req.params.id);
  if (
    !v.idValid(req.params.id) ||
    !v.envelope(b.metadata, 8000) ||
    !v.envelope(b.secret, 32000) ||
    !Number.isSafeInteger(b.expectedVersion) ||
    b.epoch !== req.vault.epoch
  )
    return fail(res, 400, "מבנה הפריט אינו תקין.");
  if ((row?.version || 0) !== b.expectedVersion || row?.trashed_at)
    return fail(res, 409, "הפריט השתנה. טענו את הגרסה החדשה לפני שמירה.");
  if (
    !row &&
    db.prepare("SELECT COUNT(*) n FROM vault_entries").get().n >= 1000
  )
    return fail(res, 409, "הכספת מוגבלת ל־1,000 פריטים.");
  const storedBytes = db
    .prepare(
      "SELECT COALESCE(SUM(length(metadata)+length(secret)),0) n FROM vault_entries WHERE id<>?",
    )
    .get(req.params.id).n;
  if (
    storedBytes +
      JSON.stringify(b.metadata).length +
      JSON.stringify(b.secret).length >
    8 * 1024 * 1024
  )
    return fail(
      res,
      409,
      "הכספת הגיעה למגבלת האחסון (8 MB). יש לצמצם פריטים לפני שמירה.",
    );
  db.transaction(() => {
    db.prepare(
      "INSERT INTO vault_entries VALUES (?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET epoch=excluded.epoch,version=excluded.version,metadata=excluded.metadata,secret=excluded.secret,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
    ).run(
      req.params.id,
      b.epoch,
      b.expectedVersion + 1,
      JSON.stringify(b.metadata),
      JSON.stringify(b.secret),
      Date.now(),
      req.user.id,
    );
    bump();
    v.audit(
      db,
      req.user.id,
      row ? "entry.updated" : "entry.created",
      req.params.id,
    );
  })();
  res.json({ ok: true, version: b.expectedVersion + 1 });
});
router.post("/entries/:id/trash", (req, res) => {
  const row = db
    .prepare("SELECT * FROM vault_entries WHERE id=?")
    .get(req.params.id);
  if (!row) return fail(res, 404, "הפריט לא נמצא.");
  if (row.version !== req.body.expectedVersion)
    return fail(res, 409, "הפריט השתנה.");
  db.prepare("UPDATE vault_entries SET trashed_at=? WHERE id=?").run(
    req.body.restore === true ? null : Date.now(),
    req.params.id,
  );
  bump();
  v.audit(
    db,
    req.user.id,
    req.body.restore ? "entry.restored" : "entry.trashed",
    req.params.id,
  );
  res.json({ ok: true });
});
router.delete("/entries/:id", s.owner, s.recentMfa, (req, res) => {
  const row = db
    .prepare("SELECT trashed_at FROM vault_entries WHERE id=?")
    .get(req.params.id);
  if (!row?.trashed_at)
    return fail(res, 409, "יש להעביר לסל המחזור לפני מחיקה.");
  db.prepare("DELETE FROM vault_entries WHERE id=?").run(req.params.id);
  bump();
  v.audit(db, req.user.id, "entry.deleted", req.params.id);
  res.json({ ok: true });
});
module.exports = router;
