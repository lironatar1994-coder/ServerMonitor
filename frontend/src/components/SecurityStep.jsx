import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { apiFetch } from "../lib/api";
import { setSession } from "../lib/session";
import "../vault/vault.css";

export default function SecurityStep({ mode = "mfa", onComplete }) {
  const [setup, setSetup] = useState(null),
    [code, setCode] = useState(""),
    [codes, setCodes] = useState(null),
    [ready, setReady] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const verify = () =>
    run(async () => {
      const result = await apiFetch("/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setCode("");
      if (result.recoveryCodes) {
        setCodes(result.recoveryCodes);
        setReady(result);
      } else {
        setSession(result);
        onComplete?.();
      }
    });
  return (
    <section className="security-step">
      <h2>
        {codes
          ? "שמירת קודי גיבוי"
          : mode === "enroll"
            ? "הגדרת אימות דו־שלבי"
            : "אימות דו־שלבי"}
      </h2>
      {error && (
        <p role="alert" className="banner banner--error">
          {error}
        </p>
      )}
      {codes ? (
        <>
          <p>
            שמרו את הקודים במקום נפרד. כל קוד מאפשר כניסה אחת ללא האפליקציה.
          </p>
          <pre dir="ltr" className="recovery-codes">
            {codes.join("\n")}
          </pre>
          <button
            className="btn"
            onClick={() =>
              navigator.clipboard
                .writeText(codes.join("\n"))
                .catch(() => setError("לא ניתן להעתיק. שמרו את הקודים ידנית."))
            }
          >
            <Copy /> העתקת קודים
          </button>
          <label className="check-row">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
            />{" "}
            שמרתי את הקודים במקום בטוח
          </label>
          <button
            className="btn btn--primary"
            disabled={!saved}
            onClick={() => {
              setSession(ready);
              setCodes(null);
              setReady(null);
              onComplete?.();
            }}
          >
            המשך
          </button>
        </>
      ) : (
        <>
          {mode === "enroll" && (
            <>
              <p>הוסיפו חשבון באפליקציית האימות באמצעות המפתח הבא.</p>
              {setup ? (
                <>
                  <code className="setup-secret" dir="ltr">
                    {setup.secret}
                  </code>
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(setup.secret)
                        .catch(() => setError("לא ניתן להעתיק."))
                    }
                  >
                    <Copy /> העתקת מפתח
                  </button>
                </>
              ) : (
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () =>
                      setSetup(
                        await apiFetch("/auth/mfa/setup", {
                          method: "POST",
                          body: "{}",
                        }),
                      ),
                    )
                  }
                >
                  <KeyRound /> יצירת מפתח אימות
                </button>
              )}
            </>
          )}
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
          >
            <label>
              קוד אימות או קוד גיבוי
              <input
                dir="ltr"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={64}
              />
            </label>
            <button
              className="btn btn--primary"
              disabled={busy || (mode === "enroll" && !setup)}
            >
              {busy ? "בודק…" : "אימות"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
