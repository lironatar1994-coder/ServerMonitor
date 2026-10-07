import { useState } from "react";
import { Link } from "react-router-dom";
import {
  KeyRound,
  Save,
  ShieldCheck,
  Users,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { Panel, PageHead, Tabs } from "../components/AnalyticsParts";
import { apiFetch } from "../lib/api";
import { getSessionSnapshot } from "../lib/session";
const tabs = [
  { id: "account", label: "חשבון" },
  { id: "security", label: "אבטחה" },
  { id: "team", label: "צוות" },
  { id: "notifications", label: "התראות" },
];
export default function Settings() {
  const user = getSessionSnapshot(),
    [tab, setTab] = useState("account"),
    [oldPassword, setOld] = useState(""),
    [newPassword, setNew] = useState(""),
    [confirm, setConfirm] = useState(""),
    [feedback, setFeedback] = useState(null),
    [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    setFeedback(null);
    try {
      await fn();
    } catch (e) {
      setFeedback({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  };
  const change = (e) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setFeedback({ error: true, text: "הסיסמאות אינן תואמות." });
      return;
    }
    run(async () => {
      const result = await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      setOld("");
      setNew("");
      setConfirm("");
      setFeedback({ text: result.message });
    });
  };
  return (
    <div className="page page--settings">
      <PageHead
        title="הגדרות"
        meta={<span className="muted">{user.username}</span>}
      />
      <div className="settings-tabs">
        <Tabs tabs={tabs} value={tab} onChange={setTab} label="הגדרות מערכת" />
      </div>
      {feedback && (
        <div
          className={`banner banner--${feedback.error ? "error" : "success"}`}
          role="status"
        >
          {feedback.text}
        </div>
      )}
      <div className="settings-content">
        {tab === "account" && (
          <Panel title="סיסמת הכניסה" action={<KeyRound aria-hidden="true" />}>
            <form className="form" onSubmit={change}>
              <label>
                סיסמה נוכחית
                <input
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(e) => setOld(e.target.value)}
                  required
                />
              </label>
              <div className="form-pair">
                <label>
                  סיסמה חדשה
                  <input
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={256}
                    value={newPassword}
                    onChange={(e) => setNew(e.target.value)}
                    required
                  />
                </label>
                <label>
                  אימות סיסמה
                  <input
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={256}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </label>
              </div>
              <small className="muted">
                לפחות 15 תווים. שינוי זה אינו משנה את סיסמת הכספת.
              </small>
              <button className="btn btn--primary" disabled={busy}>
                <Save /> שמירה
              </button>
            </form>
          </Panel>
        )}
        {tab === "security" && (
          <Panel
            title="אבטחת החשבון"
            action={<ShieldCheck aria-hidden="true" />}
          >
            <dl className="spec-list">
              <div>
                <dt>אימות דו־שלבי</dt>
                <dd>{user.service ? "חשבון בדיקה" : "פעיל"}</dd>
              </div>
              <div>
                <dt>נעילת כספת</dt>
                <dd>5 דקות ללא פעילות</dd>
              </div>
              <div>
                <dt>נעילה ברקע</dt>
                <dd>דקה אחת</dd>
              </div>
              <div>
                <dt>התחברות</dt>
                <dd>עד 12 שעות</dd>
              </div>
            </dl>
            <div className="settings-security-actions">
              <button
                className="btn"
                disabled={busy || user.service}
                onClick={() =>
                  run(async () => {
                    await apiFetch("/auth/sessions/revoke", {
                      method: "POST",
                      body: "{}",
                    });
                    setFeedback({ text: "שאר ההתחברויות נותקו." });
                  })
                }
              >
                <LogOut /> ניתוק מכשירים אחרים
              </button>
              <Link className="btn" to="/vault">
                <KeyRound /> פתיחת הכספת
              </Link>
            </div>
          </Panel>
        )}
        {tab === "team" && (
          <Panel title="הרשאות צוות" action={<Users aria-hidden="true" />}>
            <p>
              קוראים יכולים להעתיק פרטי גישה ולצפות בניטור. עורכים יכולים גם
              לשמור פרטי גישה. בעלים מנהלים את הצוות ואת פעולות השרת.
            </p>
            {user.role === "owner" ? (
              <Link className="btn btn--primary" to="/vault">
                ניהול צוות מתוך הכספת
              </Link>
            ) : (
              <p className="muted">הזמנות ושינוי הרשאות זמינים לבעלי המערכת.</p>
            )}
          </Panel>
        )}
        {tab === "notifications" && (
          <Panel title="דוחות והתראות">
            <p>
              דוחות ההשוואה היומיים והשבועיים ממשיכים להישלח לפי הגדרות השרת.
            </p>
            <p className="muted">תוכן הכספת אינו נכלל בדוחות.</p>
            {user.role === "owner" && (
              <Link className="btn" to="/services">
                שירותי התראות <ExternalLink />
              </Link>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}
