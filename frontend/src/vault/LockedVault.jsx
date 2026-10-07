import { useState } from "react";
import { Copy, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";

export default function LockedVault({
  status,
  user,
  busy,
  onUnlock,
  onSetup,
  onConfirmSetup,
  onRecover,
  onReset,
  setup,
}) {
  const [passphrase, setPassphrase] = useState(""),
    [confirm, setConfirm] = useState(""),
    [saved, setSaved] = useState(false),
    [recovery, setRecovery] = useState(false),
    [recoveryCode, setRecoveryCode] = useState(""),
    [error, setError] = useState("");
  const creating = !status.keys;
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if ((creating || recovery) && passphrase !== confirm) {
      setError("הסיסמאות אינן תואמות.");
      return;
    }
    try {
      if (recovery) await onRecover(recoveryCode, passphrase);
      else if (creating) await onSetup(passphrase);
      else await onUnlock(passphrase);
      setPassphrase("");
      setConfirm("");
      setRecoveryCode("");
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="vault-locked">
      <div className="vault-lock-mark">
        <LockKeyhole aria-hidden="true" />
      </div>
      <h2>
        {setup
          ? "מפתח השחזור שלך"
          : recovery
            ? "שחזור גישה לכספת"
            : creating
              ? "הגדרת הכספת שלך"
              : "הכספת נעולה"}
      </h2>
      <p className="muted">
        {setup
          ? "שמרו את המפתח במקום נפרד מהמערכת. הוא מאפשר לשחזר את הגישה לכספת."
          : creating
            ? "בחרו סיסמה נפרדת מסיסמת הכניסה. פרטי הגישה יוצפנו בדפדפן."
            : "הזינו את סיסמת הכספת כדי לפתוח את פרטי הגישה."}
      </p>
      {error && (
        <p role="alert" className="banner banner--error">
          {error}
        </p>
      )}
      {setup ? (
        <>
          <code className="setup-secret" dir="ltr">
            {setup.recoveryCode}
          </code>
          <button
            className="btn"
            onClick={() =>
              navigator.clipboard
                .writeText(setup.recoveryCode)
                .catch(() => setError("לא ניתן להעתיק. שמרו את המפתח ידנית."))
            }
          >
            <Copy /> העתקת מפתח
          </button>
          <label className="check-row">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
            />{" "}
            שמרתי את מפתח השחזור במקום בטוח
          </label>
          <button
            className="btn btn--primary"
            disabled={!saved || busy}
            onClick={onConfirmSetup}
          >
            השלמת ההגדרה
          </button>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          {recovery && (
            <label>
              מפתח שחזור
              <input
                dir="ltr"
                type="password"
                autoComplete="off"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            {creating || recovery ? "סיסמה חדשה לכספת" : "סיסמת הכספת"}
            <input
              type="password"
              dir="ltr"
              autoComplete={
                creating || recovery ? "new-password" : "current-password"
              }
              minLength={creating || recovery ? 15 : undefined}
              maxLength={256}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              required
            />
          </label>
          {(creating || recovery) && (
            <label>
              אימות סיסמת הכספת
              <input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                maxLength={256}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </label>
          )}
          <button className="btn btn--primary" disabled={busy}>
            {busy
              ? "מעבד…"
              : creating
                ? "יצירת מפתח"
                : recovery
                  ? "שחזור"
                  : "פתיחת הכספת"}{" "}
            <KeyRound />
          </button>
          {!creating && status.keys.recoveryKey && (
            <button
              className="text-action"
              type="button"
              onClick={() => {
                setRecovery(!recovery);
                setPassphrase("");
                setConfirm("");
              }}
            >
              {recovery ? "חזרה לפתיחה" : "שכחתי את סיסמת הכספת"}
            </button>
          )}
          {!creating && user.role !== "owner" && (
            <details>
              <summary>שחזור באמצעות בעלים</summary>
              <p>
                איפוס יבטל את המפתח הקודם. בעלים יצטרכו לאשר מפתח חדש ולהחליף את
                מפתח הכספת.
              </p>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={onReset}
              >
                בקשת גישה מחדש
              </button>
            </details>
          )}
        </form>
      )}
      <small className="vault-lock-note">
        <ShieldCheck aria-hidden="true" /> נעילה אוטומטית לאחר 5 דקות ללא פעילות
      </small>
    </div>
  );
}
