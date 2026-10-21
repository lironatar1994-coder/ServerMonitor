import { formatDateTime } from '../lib/format';
import { CircleCheck } from 'lucide-react';

const SITE_CHECK = /^site-browser-signal-(.+?):\s*([\s\S]*)$/;

// Browser-check failures are recorded fleet-wide; a site page shows only its own.
function parseFailure(text) {
  const match = SITE_CHECK.exec(text);
  return match ? { site: match[1], detail: match[2].trim() } : { site: null, detail: text };
}

export default function TrackingStatus({ health, site }) {
  if (!health) return null;
  if (health.status === 'ok') return <p className="status-line is-healthy"><CircleCheck aria-hidden="true" /> בדיקת המדידה עברה <time title="בדיקת אתר ומדידה אחרונה">{formatDateTime(health.checked)}</time></p>;
  const failures = (health.failures || []).map(parseFailure)
    .filter(item => !site || item.site === site || (!item.site && site === 'LA webs'));
  if (site && health.status === 'failed' && !failures.length) return null;
  return <div className={`banner banner--${health.status === 'failed' ? 'error' : 'attention'}`} role="alert">
    <b>{health.status === 'failed' ? `בדיקת המדידה נכשלה${failures.length > 1 ? ` (${failures.length})` : ''}` : 'אין תוצאת בדיקה אוטומטית עדכנית'}</b>
    <details><summary>פרטים</summary>
      {failures.length ? failures.map((item, i) => <p key={i}>{item.site && !site ? <b>{item.site}: </b> : null}<span dir="ltr">{item.detail}</span></p>)
        : <p>בדקו את שירות הבריאות בשרת. אפס ביקורים אינו מסווג כתקלה.</p>}
    </details>
  </div>;
}
