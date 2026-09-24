import { formatDateTime } from '../lib/format';
export default function TrackingStatus({ health }) {
  if (!health) return null;
  if (health.status === 'ok') return <p className="status-line is-healthy">בדיקות אתר ומדידה תקינות · {formatDateTime(health.checked)}</p>;
  return <div className={`banner banner--${health.status === 'failed' ? 'error' : 'attention'}`} role="alert">
    <b>{health.status === 'failed' ? 'בדיקת האתר או איסוף הנתונים נכשלה' : 'אין תוצאת בדיקה אוטומטית עדכנית'}</b>
    <details><summary>פרטי הבדיקה</summary>{health.failures?.length ? health.failures.map((failure, i) => <p dir="ltr" key={i}>{failure}</p>) : <p>בדקו את שירות הבריאות בשרת. אפס ביקורים אינו מסווג כתקלה.</p>}</details>
  </div>;
}
