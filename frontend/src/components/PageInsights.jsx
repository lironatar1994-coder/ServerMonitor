import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ExternalLink } from 'lucide-react';
import { apiFetch, rangeQuery } from '../lib/api';
import { pageName, PAGE_HINT } from '../lib/analyticsLabels';
import { formatNumber, formatDateTime } from '../lib/format';
import { DataState, Empty, Panel, Stat, StatRow } from './AnalyticsParts';

export default function PageInsights({ app, path, resolveRange, onClose, onSelect }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [retry, setRetry] = useState(0);
  const section = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`/visitor-analytics/apps/${app.id}/page?${rangeQuery(resolveRange())}&path=${encodeURIComponent(path)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ loading: false, data, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setState({ loading: false, data: null, error: error.message }); });
    section.current?.focus({ preventScroll: true });
    section.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    return () => controller.abort();
  }, [app.id, path, resolveRange, retry]);
  const data = state.data;
  const destination = new URL(path, app.url);
  return <section ref={section} tabIndex={-1} aria-label="מה קרה אחרי הצפייה בעמוד" className="page-insights">
    <Panel title={pageName(path, app.name)} action={<button className="icon-btn" type="button" onClick={onClose} aria-label="סגירת פירוט העמוד"><X /></button>}>
      <DataState loading={state.loading} error={state.error} onRetry={() => { setState(s => ({ ...s, loading: true, error: '' })); setRetry(n => n + 1); }}>
        {data && <>
          <StatRow><Stat label="צפיות לפי השרת" value={data.log.views} hint={PAGE_HINT} /><Stat label="ביקורים שנמדדו בעמוד" value={data.visits} hint="ביקורים אנונימיים שבהם פעלה מדידת הפעולות. אלה אינם אנשים מזוהים." /><Stat label="ביקורים עם לחיצת קשר בהמשך" value={data.contact_visits} hint="לחיצה בעמוד הזה או אחריו, באותו ביקור שנמדד. לא אישור שנשלחה פנייה ולא הוכחה לסיבה ללחיצה." /></StatRow>
          <h3>מה עשו אחר כך?</h3>
          {data.actions.length ? <ul className="insight-list">{data.actions.map((row, i) => <li key={i}><span>{row.event_type === 'outbound_click' ? 'עברו לאתר שמוצג בפרויקט' : row.label === 'whatsapp' ? 'לחצו על WhatsApp' : row.label === 'phone' ? 'לחצו להתקשר' : 'לחצו ליצירת קשר'} · {pageName(row.path, app.name)}</span><b>{formatNumber(row.visits)} ביקורים</b></li>)}</ul> : <Empty text="לא נמדדו לחיצות קשר או מעבר לאתר פעיל אחרי הצפייה בעמוד." />}
          <h3>העמוד הבא שנצפה</h3>
          {data.next.length ? <ul className="insight-list">{data.next.map(row => <li key={row.path}><button className="text-action" type="button" onClick={() => onSelect(row.path)}>{pageName(row.path, app.name)}</button><b>{formatNumber(row.visits)} ביקורים</b></li>)}</ul> : <Empty text="לא נמדד מעבר לעמוד נוסף. זה לא בהכרח אומר שהגלישה הסתיימה." />}
          {data.engagement?.visits > 0 && <p>זמן פעיל ממוצע בעמוד: {formatNumber(Math.round(data.engagement.active_ms / 1000))} שניות · עומק גלילה ממוצע: {formatNumber(Math.round(data.engagement.scroll))}%</p>}
          <p className="insight-note">{data.low_sample ? 'עדיין מעט מדי ביקורים כדי להסיק מה כדאי לשנות. אפשר לראות את הפעולות שנמדדו, בלי להסיק שהעמוד מצליח או נכשל.' : data.contact_visits === 0 ? 'יש צפיות בעמוד, אבל לא נמדדה לחיצת קשר בהמשך. כדאי לבדוק אם הצעד הבא ברור. זו הצעה לבדיקה, לא הסבר מוכח.' : 'נמדדו לחיצות קשר אחרי הצפייה בעמוד. בדקו במעקב הפניות אם התקבלו פניות בפועל; אין שיוך אוטומטי ביניהן.'}</p>
          <div className="insight-actions"><a className="btn" href={destination.href} target="_blank" rel="noopener noreferrer">פתיחת העמוד <ExternalLink /></a><Link className="btn" to={`/clients/${app.id}`}>מעקב פניות ותוצאות</Link></div>
          <small className="muted">מדידת הפעולות באתר החלה ב־{formatDateTime(data.coverage_since)}. תוצאות חסרות עשויות לנבוע מחסימת מדידה.</small>
        </>}
      </DataState>
    </Panel>
  </section>;
}
