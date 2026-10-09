import { useCallback, useEffect, useState } from "react";
import { Copy, Download } from "lucide-react";
import QRCode from "qrcode";
import { apiFetch } from "../lib/api";
import { getSessionSnapshot, setSession } from "../lib/session";
import "../vault/vault.css";
import "./security-step.css";

export default function SecurityStep({ mode = "mfa", onComplete, username, purpose = "action" }) {
  const enrolling = mode === "enroll";
  const Heading = purpose === "login" ? "h1" : "h2";
  const account = username || getSessionSnapshot()?.username;
  const [setup, setSetup] = useState(null), [qr, setQr] = useState("");
  const [setupError, setSetupError] = useState(""), [setupBusy, setSetupBusy] = useState(enrolling);
  const [code, setCode] = useState(""), [backup, setBackup] = useState(false);
  const [codes, setCodes] = useState(null), [ready, setReady] = useState(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false), [notice, setNotice] = useState("");

  const loadSetup = useCallback(async (signal) => {
    setSetupBusy(true); setSetupError("");
    try {
      const data = await apiFetch("/auth/mfa/setup", { method: "POST", body: "{}", signal });
      if (signal?.aborted) return;
      setSetup(data);
      try {
        const image = await QRCode.toDataURL(data.uri, { errorCorrectionLevel: "M", margin: 4, width: 240 });
        if (!signal?.aborted) setQr(image);
      } catch {
        if (!signal?.aborted) setSetupError("לא ניתן להציג QR. אפשר להוסיף את החשבון עם המפתח הידני למטה.");
      }
    } catch (e) {
      if (!signal?.aborted) setSetupError(e.message);
    } finally {
      if (!signal?.aborted) setSetupBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!enrolling) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => loadSetup(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [enrolling, loadSetup]);

  const copy = async (value, confirmation) => {
    try { await navigator.clipboard.writeText(value); setNotice(confirmation); }
    catch { setError("ההעתקה לא הצליחה. אפשר לסמן ולהעתיק ידנית."); }
  };
  const verify = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiFetch("/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code: code.trim() }) });
      setCode(""); setSetup(null); setQr("");
      if (result.recoveryCodes) { setCodes(result.recoveryCodes); setReady(result); }
      else { setSession(result); onComplete?.(); }
    } catch (e) {
      setError(e.status === 400
        ? backup ? "קוד הגיבוי לא התקבל. נסו קוד אחר שלא השתמשתם בו."
          : "הקוד לא התקבל. בדקו שבחרתם את חשבון הניטור בטלפון ונסו את הקוד החדש."
        : e.message);
    } finally { setBusy(false); }
  };
  const form = (
    <form className="form" onSubmit={verify}>
      <label>
        {backup ? "קוד גיבוי" : "קוד בן 6 ספרות"}
        <input className={backup ? "" : "security-code"} dir="ltr"
          inputMode={backup ? "text" : "numeric"} autoComplete={backup ? "off" : "one-time-code"}
          value={code} onChange={(e) => { setCode(backup ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
          required maxLength={backup ? 64 : 6} pattern={backup ? undefined : "[0-9]{6}"}
          aria-describedby="security-code-help" aria-invalid={Boolean(error)} />
      </label>
      <small id="security-code-help">{backup
        ? "כל קוד גיבוי מאפשר כניסה אחת בלבד."
        : "הקוד מופיע בטלפון ומתחלף כל 30 שניות."}</small>
      {error && <p role="alert" className="banner banner--error">{error}</p>}
      <button className="btn btn--primary btn--wide" disabled={busy || (enrolling && !setup) || (!backup && code.length !== 6)}>
        {busy ? "בודק…" : enrolling ? "חיבור והמשך" : purpose === "login" ? "כניסה" : "אישור והמשך"}
      </button>
    </form>
  );
  return (
    <section className="security-step">
      <Heading>{codes ? "הטלפון חובר" : enrolling ? "קישור לטלפון" : backup ? "כניסה עם קוד גיבוי" : "קוד מהטלפון"}</Heading>
      {codes ? <>
        <p>שמרו את קודי הגיבוי מחוץ לכספת. הם יאפשרו כניסה אם הטלפון לא יהיה זמין.</p>
        <pre dir="ltr" className="recovery-codes">{codes.join("\n")}</pre>
        <div className="security-links">
          <button type="button" className="btn" onClick={() => copy(codes.join("\n"), "קודי הגיבוי הועתקו")}><Copy aria-hidden="true" /> העתקת קודים</button>
          <button type="button" className="btn" onClick={() => {
            const url = URL.createObjectURL(new Blob(["Server Monitor — backup codes\nEach code can be used once.\n\n" + codes.join("\n")], { type: "text/plain;charset=utf-8" }));
            const link = document.createElement("a"); link.href = url; link.download = "server-monitor-backup-codes.txt"; link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("קובץ קודי הגיבוי הורד");
          }}><Download aria-hidden="true" /> הורדת קובץ</button>
        </div>
        {error && <p role="alert" className="banner banner--error">{error}</p>}
        <label className="check-row"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> שמרתי את הקודים במקום בטוח</label>
        <button className="btn btn--primary btn--wide" disabled={!saved} onClick={() => { setSession(ready); setCodes(null); setReady(null); onComplete?.(); }}>סיום וכניסה</button>
      </> : enrolling ? <>
        <p>הגדרה חד־פעמית. בכניסות הבאות תצטרכו רק את הקוד מהטלפון.</p>
        <ol className="security-setup">
          <li><b>פתחו Google Authenticator בטלפון</b>
            <details><summary>אין לי את האפליקציה</summary><div className="security-links">
              <a className="btn" href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" rel="noreferrer">Android</a>
              <a className="btn" href="https://apps.apple.com/app/google-authenticator/id388497605" target="_blank" rel="noreferrer">iPhone</a>
            </div></details>
          </li>
          <li><b>בחרו + ואז ״סריקת קוד QR״</b>
            {setupBusy && <p role="status">מכין את קוד הסריקה…</p>}
            {qr && <img className="security-qr" src={qr} width="240" height="240" alt="קוד QR לחיבור חשבון Server Monitor ל־Google Authenticator" />}
            {setupError && <p role="alert">{setupError}</p>}
            {!setup && !setupBusy && <button className="btn" type="button" onClick={() => loadSetup()}>ניסיון נוסף</button>}
            {setup && <details className="security-manual"><summary>באותו טלפון או בלי סריקה?</summary>
              <p>בחרו ״הזנת מפתח להגדרה״. שם החשבון: <bdi>Server Monitor{account ? `: ${account}` : ""}</bdi>. סוג המפתח: ״מבוסס זמן״.</p>
              <code className="setup-secret" dir="ltr">{setup.secret}</code>
              <button type="button" className="btn" onClick={() => copy(setup.secret, "המפתח הועתק. הדביקו אותו ב־Google Authenticator.")}><Copy aria-hidden="true" /> העתקת מפתח</button>
            </details>}
          </li>
          <li><b>הזינו את הקוד שמופיע בטלפון</b>{form}</li>
        </ol>
      </> : <>
        <p>{backup ? "הזינו אחד מהקודים ששמרתם בזמן ההגדרה." : <>פתחו Google Authenticator ובחרו <bdi>Server Monitor{account ? `: ${account}` : ""}</bdi>.</>}</p>
        {form}
        <button type="button" className="btn security-alternative" disabled={busy} onClick={() => { setBackup(!backup); setCode(""); setError(""); }}>
          {backup ? "חזרה לקוד מהטלפון" : "הטלפון לא זמין — קוד גיבוי"}
        </button>
        {!backup && <details><summary>הקוד לא עובד?</summary><p>חכו לקוד הבא ובדקו שהתאריך והשעה בטלפון מוגדרים אוטומטית.</p></details>}
      </>}
      <span role="status" className="security-notice">{notice}</span>
    </section>
  );
}
