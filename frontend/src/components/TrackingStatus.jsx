import { formatDateTime } from '../lib/format';
import { CircleCheck } from 'lucide-react';

const AREA_LABEL = { monitor: 'מסך במוניטור', checker: 'הבודק' };
const detailOf = text => String(text || '').replace(/^[^:]+:\s*/, '');

// Browser-check failures are recorded fleet-wide; a site page shows only its own site's failures.
export default function TrackingStatus({ health, site }) {
  if (!health) return null;
  if (health.status === 'ok') return <p className="status-line is-healthy"><CircleCheck aria-hidden="true" /> בדיקת המדידה עברה <time title="בדיקת אתר ומדידה אחרונה">{formatDateTime(health.checked)}</time></p>;
  const failures = (health.items || []).map((item, i) => ({ ...item, detail: detailOf(health.failures?.[i]) }))
    .filter(item => !site || (item.area === 'site' && item.site === site));
  if (site && ['failed', 'incomplete'].includes(health.status) && !failures.length) return null;
  const failed = health.status === 'failed';
  const title = failed ? `בדיקת המדידה נכשלה${failures.length > 1 ? ` (${failures.length})` : ''}`
    : health.status === 'incomplete' ? 'בדיקת הדפדפן לא הושלמה' : 'אין תוצאת בדיקה אוטומטית עדכנית';
  return <div className={`banner banner--${failed ? 'error' : 'attention'}`} role="alert">
    <b>{title}</b>
    <details><summary>פרטים</summary>
      {health.status === 'incomplete' && <p>האתרים לא נבדקו בריצה הזו. זו תקלה בבודק עצמו, לא באתרים; הבדיקה תרוץ שוב בתוך שש שעות.</p>}
      {failures.length ? failures.map((item, i) => <p key={i}>{!site ? <b>{item.area === 'site' ? item.site : AREA_LABEL[item.area]}: </b> : null}<span dir="ltr">{item.detail}</span></p>)
        : health.status !== 'incomplete' && <p>בדקו את שירות הבריאות בשרת. אפס ביקורים אינו מסווג כתקלה.</p>}
    </details>
  </div>;
}
