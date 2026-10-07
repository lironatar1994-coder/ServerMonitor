const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execute = promisify(execFile);
let discovery = { checked: 0, rows: [], error: false };

function readJson(file) {
  try {
    if (fs.statSync(file).size > 65536) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
const timestamp = (value) => {
  const n =
    typeof value === "number"
      ? value < 1e12
        ? value * 1000
        : value
      : Date.parse(value || "");
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
};
const fresh = (value, now, age) =>
  Boolean(timestamp(value)) &&
  now - Date.parse(timestamp(value)) < age &&
  Date.parse(timestamp(value)) <= now + 60000;

async function applicationServices() {
  if (process.platform !== "linux") return { rows: [], error: false };
  if (Date.now() - discovery.checked < 60000) return discovery;
  try {
    const units = fs
      .readdirSync("/etc/systemd/system")
      .filter(
        (name) =>
          /^[a-zA-Z0-9_.@-]+\.service$/.test(name) &&
          !/^(pm2-|lawebs-)/.test(name),
      )
      .slice(0, 100);
    if (!units.length) return { rows: [], error: false };
    const { stdout } = await execute(
      "/usr/bin/systemctl",
      [
        "show",
        ...units,
        "--property=Id,ActiveState,MainPID,WorkingDirectory,Description",
      ],
      { timeout: 3000, maxBuffer: 131072 },
    );
    const rows = stdout
      .trim()
      .split(/\n\s*\n/)
      .map((block) =>
        Object.fromEntries(
          block.split("\n").map((line) => {
            const i = line.indexOf("=");
            return [line.slice(0, i), line.slice(i + 1)];
          }),
        ),
      )
      .filter(
        (row) =>
          row.ActiveState === "active" &&
          Number(row.MainPID) > 0 &&
          /^\/(opt|root|var\/lib)\//.test(row.WorkingDirectory || ""),
      )
      .map((row) => ({
        unit: row.Id,
        name: String(row.Description || row.Id).slice(0, 100),
      }));
    discovery = { checked: Date.now(), rows, error: false };
  } catch {
    discovery = { checked: Date.now(), rows: [], error: true };
  }
  return discovery;
}

function buildOperationalHealth({
  health,
  browser,
  backup,
  reports = [],
  apps = [],
  processes = [],
  discovered = { rows: [], error: false },
  whatsapp,
  pendingMessages = null,
  now = Date.now(),
}) {
  const issues = [];
  const add = (
    id,
    title,
    detail,
    severity = "warning",
    appId = null,
    diagnostics = null,
  ) => issues.push({ id, title, detail, severity, appId, diagnostics });
  const healthFresh = fresh(health?.checked, now, 30 * 60000);
  if (!healthFresh)
    add(
      "health-stale",
      "בדיקות השרת אינן עדכניות",
      "לא ניתן לאמת את מצב השרת כרגע.",
      "unknown",
    );
  if (healthFresh) {
    if (Number(health.disk_used_percent) >= 80)
      add(
        "disk",
        "האחסון מתקרב למגבלה",
        `${Number(health.disk_used_percent).toFixed(0)}% מהדיסק בשימוש`,
        Number(health.disk_used_percent) >= 90 ? "error" : "warning",
      );
    if ((health.warnings || []).some((value) => /reboot required/i.test(value)))
      add("reboot", "נדרש אתחול שרת", "לתיאום בחלון תחזוקה");
    const other = (health.errors || []).filter(
      (value) => !/Disk usage/.test(value),
    );
    if (other.length)
      add(
        "host-checks",
        "בדיקות השרת זיהו תקלה",
        `${other.length} בדיקות דורשות טיפול`,
        "error",
        null,
        other.slice(0, 12).map((value) => String(value).slice(0, 400)),
      );
  }
  const registered = new Set(
    apps.map((app) => app.systemd_unit).filter(Boolean),
  );
  const missing = (discovered.rows || []).filter(
    (row) => !registered.has(row.unit),
  );
  if (missing.length)
    add(
      "coverage",
      "יישומים אינם כלולים בניטור",
      missing.map((row) => row.name).join(" · "),
      "warning",
      null,
      missing.map((row) => row.unit),
    );
  if (discovered.error)
    add(
      "coverage-unavailable",
      "כיסוי הניטור לא נבדק",
      "בדיקת שירותי השרת אינה זמינה.",
      "unknown",
    );

  const legacy = apps.find((app) => app.pm2_name === "vee-whatsapp-worker");
  const sender = processes.find((item) => item.name === "vee-whatsapp-worker");
  if (legacy && sender?.pm2_env?.status !== "online")
    add(
      "alert-delivery",
      "התראות WhatsApp אינן זמינות",
      pendingMessages == null
        ? "שירות ההתראות אינו פעיל."
        : `${pendingMessages.toLocaleString("he-IL")} הודעות ממתינות בתור הישן`,
      "warning",
      legacy.id,
    );
  for (const app of apps)
    if (app.status !== "online" && app !== legacy)
      add(
        `service-${app.id}`,
        `${app.name} אינו זמין`,
        "לפי בדיקת השירות האחרונה",
        app.alerts_enabled === 0 ? "warning" : "error",
        app.id,
      );

  const seder = apps.find((app) => app.pm2_name === "seder-whatsapp");
  if (seder && seder.status === "online") {
    if (!fresh(whatsapp?.updatedAt, now, 3 * 60000))
      add(
        "seder-whatsapp",
        "חיבור WhatsApp של Seder לא אומת",
        "תהליך פעיל; אין מצב חיבור עדכני.",
        "unknown",
        seder.id,
      );
    else if (!["READY", "CONNECTED"].includes(whatsapp.status))
      add(
        "seder-whatsapp",
        "WhatsApp של Seder אינו מחובר",
        "התהליך פועל; חיבור WhatsApp דורש בדיקה.",
        "warning",
        seder.id,
      );
  }
  const browserFresh = fresh(browser?.checked, now, 7 * 3600000);
  const backupFresh = fresh(backup?.completed, now, 36 * 3600000);
  if (!browserFresh || browser?.errors?.length)
    add(
      "browser-check",
      "בדיקת האתרים דורשת בדיקה",
      browserFresh
        ? "הבדיקה האחרונה דיווחה על כשל."
        : "אין בדיקה אוטומטית עדכנית.",
      browserFresh ? "error" : "unknown",
    );
  if (!backupFresh)
    add(
      "backup",
      "אין גיבוי מתועד עדכני",
      "לא נמצא גיבוי מוצלח מ־36 השעות האחרונות.",
      "error",
    );
  const report = (type) => {
    const row = reports.find((item) => item.report_type === type);
    return {
      status: row?.status === "sent" ? "ok" : row ? "failed" : "unknown",
      checkedAt: timestamp(
        row?.sent_at ? row.sent_at.replace(" ", "T") + "Z" : null,
      ),
    };
  };
  const priorities = { 'alert-delivery': 0, 'seder-whatsapp': 1, coverage: 2, disk: 3, reboot: 5 };
  issues.sort(
    (a, b) =>
      ({ error: 0, warning: 1, unknown: 2 })[a.severity] -
      { error: 0, warning: 1, unknown: 2 }[b.severity] || (priorities[a.id] ?? 4) - (priorities[b.id] ?? 4),
  );
  return {
    generatedAt: new Date(now).toISOString(),
    status: !healthFresh
      ? "unknown"
      : issues.some((item) => item.severity === "error")
        ? "failed"
        : issues.length
          ? "attention"
          : "ok",
    issues,
    checks: {
      health: {
        status: healthFresh
          ? health.errors?.length
            ? "failed"
            : "ok"
          : "unknown",
        checkedAt: timestamp(health?.checked),
      },
      browser: {
        status: browserFresh
          ? browser.errors?.length
            ? "failed"
            : "ok"
          : "unknown",
        checkedAt: timestamp(browser?.checked),
      },
      backup: {
        status: backupFresh ? "ok" : "failed",
        checkedAt: timestamp(backup?.completed),
        files: Object.keys(backup?.files || {}).length,
      },
      dailyReport: report("daily"),
      weeklyReport: report("weekly"),
    },
  };
}

async function operationalHealth(db, processes) {
  let pendingMessages = null;
  const file = "/root/Vee/backend/database.sqlite";
  if (fs.existsSync(file)) {
    let queue;
    try {
      queue = new (require("better-sqlite3"))(file, {
        readonly: true,
        fileMustExist: true,
        timeout: 250,
      });
      pendingMessages = queue
        .prepare(
          "SELECT COUNT(*) n FROM whatsapp_outbox WHERE status='pending'",
        )
        .get().n;
    } catch {
      /* Never read message contents or contacts. */
    } finally {
      queue?.close();
    }
  }
  return buildOperationalHealth({
    health: readJson("/var/lib/lawebs-maintenance/health.json"),
    browser: readJson("/var/lib/lawebs-maintenance/browser-check.json"),
    backup: readJson("/var/lib/lawebs-maintenance/backup-status.json"),
    whatsapp: readJson("/var/lib/seder/whatsapp-status.json"),
    reports: db
      .prepare(
        "SELECT report_type,status,sent_at FROM email_report_deliveries ORDER BY id DESC LIMIT 30",
      )
      .all(),
    apps: db
      .prepare(
        "SELECT id,name,status,pm2_name,systemd_unit,alerts_enabled FROM apps",
      )
      .all().map(app => { if (!app.pm2_name || !processes.length) return app; const running = processes.find(item => item.name === app.pm2_name); return running?.pm2_env?.status === 'online' ? app : {...app,status:'offline'}; }),
    processes,
    discovered: await applicationServices(),
    pendingMessages,
  });
}
module.exports = { operationalHealth, buildOperationalHealth, readJson };
