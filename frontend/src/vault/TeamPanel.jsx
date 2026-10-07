import { useEffect, useState } from "react";
import { Copy, UserPlus, X } from "lucide-react";
import { apiFetch } from "../lib/api";
const roles = { owner: "בעלים", editor: "עורך", reader: "קורא" };
const auditLabels = {
  "invite.accepted": "הצטרפות לצוות",
  "invite.created": "יצירת הזמנה",
  "keys.created": "יצירת מפתח",
  "keys.rewrapped": "עדכון סיסמת כספת",
  "keys.reset": "איפוס מפתח",
  "vault.created": "יצירת כספת",
  "vault.rotated": "החלפת מפתח הכספת",
  "member.granted": "אישור גישה",
  "member.revoked": "הסרת גישה",
  "member.role": "שינוי הרשאה",
  "secret.fetched": "בקשת פרטי סיסמה",
  "entry.created": "יצירת פריט",
  "entry.updated": "עדכון פריט",
  "entry.restored": "שחזור פריט",
  "entry.trashed": "העברה לסל המחזור",
  "entry.deleted": "מחיקה לצמיתות",
};
export default function TeamPanel({
  cryptoClient,
  epoch,
  onClose,
  action,
  onRotationRequired,
  userId,
}) {
  const [members, setMembers] = useState([]),
    [invite, setInvite] = useState(""),
    [verified, setVerified] = useState({}),
    [error, setError] = useState(""),
    [audit, setAudit] = useState(null);
  const load = () =>
    apiFetch("/vault/members")
      .then(setMembers)
      .catch((e) => setError(e.message));
  useEffect(() => {
    let alive = true;
    apiFetch("/vault/members")
      .then((data) => alive && setMembers(data))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  const run = (fn) =>
    action(async () => {
      await fn();
      await load();
    });
  return (
    <section className="vault-team">
      <div className="vault-detail-head">
        <h2>חברי הצוות</h2>
        <button
          className="icon-btn"
          aria-label="סגירת ניהול צוות"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="vault-team-tools">
        <button
          className="btn btn--primary"
          onClick={() =>
            run(async () => {
              const result = await apiFetch("/vault/invites", {
                method: "POST",
                body: "{}",
              });
              setInvite(
                `${location.origin}/serve-monitor/login#invite=${encodeURIComponent(result.token)}`,
              );
            })
          }
        >
          <UserPlus /> הזמנה לצוות
        </button>
        <small className="muted">הקישור תקף ל־24 שעות, לשימוש אחד</small>
      </div>
      {invite && (
        <div className="vault-invite">
          <input dir="ltr" readOnly value={invite} aria-label="קישור הזמנה" />
          <button
            className="btn"
            onClick={() =>
              navigator.clipboard
                .writeText(invite)
                .catch(() => setError("לא ניתן להעתיק."))
            }
          >
            <Copy /> העתקה
          </button>
        </div>
      )}
      <p className="muted">
        כל חברי הכספת רואים את אותם הפריטים. הרשאות הניטור הן לקריאה; פעולות שרת
        לבעלים בלבד.
      </p>
      <ul className="vault-members">
        {members.map((m) => (
          <li key={m.id}>
            <div>
              <strong>{m.username}</strong>
              <small>
                {m.disabled
                  ? "הגישה הוסרה"
                  : m.epoch
                    ? "גישה לכספת"
                    : m.public_key
                      ? "ממתין לאישור מפתח"
                      : "טרם הוגדר מפתח"}
              </small>
            </div>
            <label>
              <span className="sr-only">הרשאה של {m.username}</span>
              <select
                disabled={m.disabled === 1 || m.id === userId}
                value={m.role}
                onChange={(e) =>
                  run(async () => {
                    await apiFetch(`/vault/members/${m.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        role: e.target.value,
                        disabled: false,
                      }),
                    });
                  })
                }
              >
                {Object.entries(roles).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {m.public_key && !m.epoch && !m.disabled && (
              <div className="member-grant">
                <code dir="ltr">
                  {m.fingerprint.match(/.{1,8}/g).join(" ")}
                </code>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={!!verified[m.id]}
                    onChange={(e) =>
                      setVerified((v) => ({ ...v, [m.id]: e.target.checked }))
                    }
                  />{" "}
                  אימתתי את טביעת המפתח מול המשתמש בערוץ נפרד
                </label>
                <button
                  className="btn"
                  disabled={!verified[m.id]}
                  onClick={() =>
                    run(async () => {
                      const wrappedKey = await cryptoClient.call("grant", {
                        publicKey: m.public_key,
                      });
                      await apiFetch(`/vault/members/${m.id}/grant`, {
                        method: "POST",
                        body: JSON.stringify({
                          wrappedKey,
                          epoch,
                          fingerprint: m.fingerprint,
                        }),
                      });
                    })
                  }
                >
                  אישור גישה לכספת
                </button>
              </div>
            )}
            {!m.disabled && m.id !== userId && (
              <button
                className="btn btn--danger"
                onClick={() => {
                  if (
                    window.confirm(
                      `להסיר את הגישה של ${m.username}? יש להחליף גם סיסמאות שהועתקו בעבר.`,
                    )
                  )
                    run(async () => {
                      await apiFetch(`/vault/members/${m.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ role: m.role, disabled: true }),
                      });
                      onRotationRequired();
                    });
                }}
              >
                הסרת גישה
              </button>
            )}
          </li>
        ))}
      </ul>
      <details
        onToggle={(e) => {
          if (e.currentTarget.open && !audit)
            apiFetch("/vault/audit")
              .then(setAudit)
              .catch((e) => setError(e.message));
        }}
      >
        <summary>יומן פעולות</summary>
        <ul className="vault-audit">
          {audit?.map((a) => (
            <li key={a.id}>
              <span>{a.username}</span>
              <span>{auditLabels[a.action] || a.action}</span>
              <time>{new Date(a.created_at).toLocaleString("he-IL")}</time>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
