import { useState } from "react";
import { RefreshCw, Save, X } from "lucide-react";
import { safeLoginUrl } from "./crypto";
export default function EntryForm({
  entry,
  secret,
  apps,
  cryptoClient,
  onSave,
  onClose,
  busy,
}) {
  const [fields, setFields] = useState(
      entry?.fields || {
        title: "",
        appId: "",
        username: "",
        url: "",
        environment: "production",
      },
    ),
    [password, setPassword] = useState(secret?.password || ""),
    [notes, setNotes] = useState(secret?.notes || ""),
    [length, setLength] = useState(24),
    [symbols, setSymbols] = useState(true),
    [error, setError] = useState("");
  const change = (name, value) => setFields((f) => ({ ...f, [name]: value }));
  const submit = async (e) => {
    e.preventDefault();
    if (fields.url && !safeLoginUrl(fields.url)) {
      setError("יש להזין כתובת HTTP או HTTPS ללא פרטי גישה בתוך הכתובת.");
      return;
    }
    setError("");
    try {
      await onSave(fields, { password, notes });
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <section className="vault-detail">
      <div className="vault-detail-head">
        <h2>{entry ? "עריכת פרטי גישה" : "פרטי גישה חדשים"}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="סגירת עריכה">
          <X />
        </button>
      </div>
      <form className="form vault-entry-form" onSubmit={submit}>
        {error && (
          <p role="alert" className="banner banner--error">
            {error}
          </p>
        )}
        <label>
          שם הפריט
          <input
            dir="auto"
            value={fields.title}
            maxLength={160}
            required
            onChange={(e) => change("title", e.target.value)}
          />
        </label>
        <div className="form-pair">
          <label>
            אפליקציה
            <select
              value={fields.appId}
              onChange={(e) => {
                const app = apps.find((a) => String(a.id) === e.target.value);
                setFields((f) => ({
                  ...f,
                  appId: e.target.value,
                  ...(!f.url && app?.url ? { url: app.url } : {}),
                }));
              }}
            >
              <option value="">שירות חיצוני / ללא שיוך</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            סביבת עבודה
            <select
              value={fields.environment}
              onChange={(e) => change("environment", e.target.value)}
            >
              <option value="production">ייצור</option>
              <option value="staging">בדיקות</option>
              <option value="local">מקומית</option>
            </select>
          </label>
        </div>
        <label>
          שם משתמש / אימייל
          <input
            dir="auto"
            value={fields.username}
            maxLength={320}
            required
            autoComplete="off"
            onChange={(e) => change("username", e.target.value)}
          />
        </label>
        <label>
          סיסמה
          <input
            type="password"
            dir="ltr"
            value={password}
            maxLength={2048}
            autoComplete="new-password"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <details className="password-generator">
          <summary>יצירת סיסמה אקראית</summary>
          <div className="generator-controls">
            <label>
              אורך
              <input
                type="number"
                min="16"
                max="64"
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={symbols}
                onChange={(e) => setSymbols(e.target.checked)}
              />{" "}
              סימנים
            </label>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                try {
                  setPassword(
                    await cryptoClient.call("generate", { length, symbols }),
                  );
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              <RefreshCw /> יצירה
            </button>
          </div>
        </details>
        <label>
          כתובת כניסה
          <input
            type="url"
            dir="ltr"
            value={fields.url}
            maxLength={2048}
            placeholder="https://"
            required
            onChange={(e) => change("url", e.target.value)}
          />
        </label>
        {safeLoginUrl(fields.url)?.insecure && (
          <small className="banner banner--attention">
            הקישור אינו מוצפן (HTTP). מומלץ להשתמש ב־HTTPS.
          </small>
        )}
        <label>
          הערות
          <textarea
            dir="auto"
            rows="3"
            value={notes}
            maxLength={6000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="vault-form-footer">
          <button className="btn btn--primary" disabled={busy}>
            <Save /> {busy ? "שומר…" : "שמירה"}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </form>
    </section>
  );
}
