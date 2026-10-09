import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { safeReturnPath } from "../lib/reportNavigation";
import { bootstrapSession, setSession } from "../lib/session";
import { apiFetch } from "../lib/api";
import SecurityStep from "../components/SecurityStep";

export default function Login() {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState("login");
  const navigate = useNavigate(),
    location = useLocation();
  const [invitation] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get("invite"),
  );
  useEffect(() => {
    if (invitation)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    bootstrapSession()
      .then((data) => {
        if (data?.user?.username) setUsername(data.user.username);
        if (data && data.next !== "ready") setStep(data.next);
      })
      .catch(() => {});
  }, [invitation]);
  const complete = () =>
    navigate(
      safeReturnPath(new URLSearchParams(location.search).get("returnTo")),
      { replace: true },
    );
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        "/serve-monitor/api/" +
          (invitation ? "vault/accept-invite" : "auth/login"),
        {
          method: "POST",
          credentials: "same-origin",
          signal: AbortSignal.timeout(20000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            password,
            ...(invitation ? { token: invitation } : {}),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "הכניסה נכשלה.");
      setPassword("");
      setShow(false);
      setSession(data);
      setStep(data.next);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login">
      <div className="login__card">
        <span className="login__brand">
          <ShieldCheck aria-hidden="true" />
          <b>Server Monitor</b>
        </span>
        {step === "login" ? (
          <>
            <h1>{invitation ? "הצטרפות לצוות" : "כניסה"}</h1>
            <p className="muted">האתרים, הצוות ופרטי הגישה במקום אחד.</p>
            {error && (
              <p className="banner banner--error" role="alert">
                {error}
              </p>
            )}
            <form className="form" onSubmit={submit}>
              <label>
                שם משתמש
                <input
                  dir="auto"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  maxLength={80}
                />
              </label>
              <label>
                סיסמה
                <span className="password-field">
                  <input
                    dir="ltr"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={
                      invitation ? "new-password" : "current-password"
                    }
                    minLength={invitation ? 15 : undefined}
                    maxLength={256}
                    required
                  />
                  <button
                    type="button"
                    aria-label={show ? "הסתרת סיסמה" : "הצגת סיסמה"}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff /> : <Eye />}
                  </button>
                </span>
              </label>
              {invitation && (
                <small>לפחות 15 תווים. בהמשך תוגדר סיסמה נפרדת לכספת.</small>
              )}
              <button className="btn btn--primary btn--wide" disabled={busy}>
                {busy ? (
                  "מתחבר…"
                ) : (
                  <>
                    כניסה <ArrowLeft />
                  </>
                )}
              </button>
            </form>
          </>
        ) : step === "password" ? (
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                const data = await apiFetch("/auth/upgrade-password", {
                  method: "POST",
                  body: JSON.stringify({ password }),
                });
                setSession(data);
                setPassword("");
                setStep(data.next);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h1>עדכון סיסמת כניסה</h1>
            <p className="muted">להמשך הכניסה נדרשת סיסמה של 15 תווים לפחות.</p>
            {error && (
              <p role="alert" className="banner banner--error">
                {error}
              </p>
            )}
            <label>
              סיסמה חדשה
              <span className="password-field">
                <input
                  dir="ltr"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={15}
                  maxLength={256}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  aria-label={show ? "הסתרת סיסמה" : "הצגת סיסמה"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </span>
            </label>
            <button className="btn btn--primary" disabled={busy}>
              {busy ? "שומר…" : "עדכון והמשך לאימות"}
            </button>
          </form>
        ) : (
          <SecurityStep mode={step} username={username} purpose="login" onComplete={complete} />
        )}
      </div>
    </main>
  );
}
