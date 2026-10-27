import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, rangeQuery } from '../lib/api';
import { formatDateTime, formatNumber } from '../lib/format';
import { pageName, VISITOR_HINT } from '../lib/analyticsLabels';
import { DataState, Empty, Hint, Panel } from './AnalyticsParts';
import Modal from './Modal';

const deviceName = value => ({ Mobile: 'נייד', Desktop: 'מחשב' })[value] || 'מכשיר לא ידוע';
const visitsLabel = value => `${formatNumber(value)} ${value === 1 ? 'ביקור' : 'ביקורים'}`;
const viewsLabel = value => `${formatNumber(value)} ${value === 1 ? 'צפייה' : 'צפיות'}`;
const actionName = row => ({ contact_click: `לחיצה ל${({ whatsapp: 'וואטסאפ', phone: 'טלפון', email: 'דוא״ל' })[row.label] || 'יצירת קשר'}`,
  form_start: 'התחלת מילוי טופס', form_submit: 'ניסיון שליחת טופס', form_error: 'שגיאה בטופס',
  form_success_observed: 'הוצגה הודעת הצלחה בטופס', project_open: 'פתיחת פרויקט', outbound_click: 'מעבר לאתר חיצוני',
  tool_opened: 'פתיחת כלי', tool_completed: 'השלמת פעולה בכלי', file_opened: 'פתיחת קובץ', file_downloaded: 'הורדת קובץ',
  editor_saved: 'שמירה בעורך', operation_failed: 'פעולה נכשלה', session_restored: 'שחזור עבודה' })[row.event_type] || 'פעולה שנמדדה';

function BrowserHistory({ appId, appName, range, visitor, onClose }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    apiFetch(`/visitor-analytics/apps/${appId}/browser?${rangeQuery(range)}&visitor=${encodeURIComponent(visitor)}&page=${page}`, { signal: controller.signal })
      .then(value => { if (active) { setResult(value); setError(''); } })
      .catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [appId, range, visitor, page, retry]);
  const changePage = value => { setLoading(true); setPage(value); };
  const summary = result?.summary;
  return <Modal label="היסטוריית מבקר משוער" onClose={onClose} className="visitor-history">
    <header className="visitor-history__head"><h2>היסטוריית מבקר <bdi>{visitor.slice(0, 8)}</bdi></h2><button className="icon-btn" onClick={onClose} aria-label="סגירת היסטוריית המבקר"><X aria-hidden="true" /></button></header>
    <DataState loading={loading} error={error} onRetry={() => { setLoading(true); setRetry(retry + 1); }}>
      {summary?.visits > 0 ? <>
        <div className="visitor-history__summary">
          <strong>{summary.visits > 1 ? 'מבקר חוזר' : 'ביקור ראשון שנשמר'}<Hint text="חוזר פירושו שנמדד יותר מביקור אחד באותו דפדפן אנונימי באתר הזה. ביקור חדש מתחיל אחרי 30 דקות ללא פתיחת עמוד שנמדדה. מחיקת אחסון או החלפת דפדפן יוצרת מזהה אחר." /></strong>
          <span><b>{visitsLabel(summary.visits)}</b> · <b>{viewsLabel(summary.page_views)}</b> בהיסטוריה</span>
          <span>נראה לראשונה: <bdi>{formatDateTime(summary.first_seen)}</bdi></span>
          <span>נראה לאחרונה: <bdi>{formatDateTime(summary.last_seen)}</bdi></span>
        </div>
        <p className="status-line">היסטוריה שנשמרה עד 90 יום, עד סוף הטווח שנבחר.</p>
        <ol className="visitor-visit-list">
          {result.visits.map((visit, index) => <li key={`${visit.first_seen}:${index}`}>
            <div className="visitor-visit-list__head"><strong><bdi>{formatDateTime(visit.first_seen)}</bdi></strong><span>{viewsLabel(visit.page_views)} · {visit.in_period ? 'בטווח שנבחר' : 'ביקור קודם'}</span></div>
            <ol className="visitor-steps">
              {[...visit.pages.map(row => ({ ...row, type: 'page' })), ...visit.actions.map(row => ({ ...row, type: 'action' }))]
                .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).map((row, i) => <li key={`${row.occurred_at}:${i}`}>
                  <time><bdi>{formatDateTime(row.occurred_at)}</bdi></time>
                  <span><bdi>{row.type === 'page' ? pageName(row.path, appName) : actionName(row)}</bdi>{row.type === 'action' && <small><bdi>{row.path}</bdi></small>}</span>
                </li>)}
            </ol>
            {visit.page_views > visit.pages.length && <p className="status-line">מוצגות {formatNumber(visit.pages.length)} הצפיות הראשונות בביקור הזה.</p>}
            {visit.actions.length === 80 && <p className="status-line">מוצגות עד 80 פעולות בביקור.</p>}
          </li>)}
        </ol>
        {(result.has_more || page > 1) && <div className="pagination"><button disabled={page <= 1} onClick={() => changePage(page - 1)} aria-label="ביקורים חדשים יותר"><ChevronRight /></button><span>עמוד {page}</span><button disabled={!result.has_more} onClick={() => changePage(page + 1)} aria-label="ביקורים קודמים"><ChevronLeft /></button></div>}
        <details className="measurement-details"><summary>על הזיהוי והפעולות</summary><p>{VISITOR_HINT} ההיסטוריה מוגבלת למה שנשמר; ״ראשון״ אינו מוכיח שזה הביקור הראשון אי פעם. פעולות קשר משויכות רק בעזרת מזהה ביקור משותף, מהתקנת הקישור ואילך. היעדר פעולה אינו מוכיח שלא הייתה פנייה; לחיצה אינה פנייה שהתקבלה.</p></details>
      </> : <Empty text="אין היסטוריה שנמדדה למזהה הזה עד סוף הטווח שנבחר" />}
    </DataState>
  </Modal>;
}

export default function BrowserVisitors({ appId, appName, range }) {
  const [query, setQuery] = useSearchParams();
  const selected = query.get('visitor');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch(`/visitor-analytics/apps/${appId}/browsers?${rangeQuery(range)}&page=${page}&search=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then(value => { if (active) { setResult(value); setError(''); } })
        .catch(error => { if (active) setError(error.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [appId, range, page, search, retry]);
  const select = visitor => {
    const next = new URLSearchParams(query);
    if (visitor) { next.set('visitor', visitor); next.set('from', range.from); next.set('to', range.to); }
    else next.delete('visitor');
    setQuery(next);
  };
  const changePage = value => { setLoading(true); setPage(value); };
  return <>
    <Panel title="מבקרים והיסטוריה" hint={VISITOR_HINT} bleed action={<div className="search"><Search aria-hidden="true" /><input dir="auto" aria-label="חיפוש מזהה מבקר או עמוד" placeholder="מזהה מבקר או עמוד" value={search} onChange={event => { setLoading(true); setSearch(event.target.value); setPage(1); }} />{search && <button aria-label="ניקוי חיפוש מבקרים" onClick={() => { setLoading(true); setSearch(''); setPage(1); }}><X aria-hidden="true" /></button>}</div>}>
      <DataState loading={loading} error={error} onRetry={() => { setLoading(true); setRetry(retry + 1); }}>
        <ul className="browser-ledger">
          {result?.visitors.map(visitor => <li key={visitor.visitor_id}><button onClick={() => select(visitor.visitor_id)} aria-label={`פרטים והיסטוריה של מבקר ${visitor.visitor_id.slice(0, 8)}`}>
            <span className="browser-ledger__identity"><strong>מבקר <bdi>{visitor.visitor_id.slice(0, 8)}</bdi></strong><small>{deviceName(visitor.device)} · {visitor.returning ? 'חוזר' : 'ביקור יחיד שנשמר'}{visitor.seen_before_period ? ' · נמדד גם לפני הטווח' : ''}</small></span>
            <span className="browser-ledger__activity"><b>{visitsLabel(visitor.visits)} · {viewsLabel(visitor.page_views)}</b><small><bdi>{formatDateTime(visitor.last_seen)}</bdi></small><span className="is-path"><bdi>{pageName(visitor.latest_path, appName)}</bdi></span></span>
            <ChevronLeft aria-hidden="true" />
          </button></li>)}
        </ul>
        {!result?.visitors.length && <Empty text={search ? 'אין מבקרים שמתאימים לחיפוש' : 'לא נמדדו דפדפנים בטווח הזה. חיבורי שרת עשויים להופיע באבחון המדידה.'} />}
        {result?.total > 25 && <div className="pagination"><button disabled={page <= 1} onClick={() => changePage(page - 1)} aria-label="עמוד מבקרים קודם"><ChevronRight /></button><span>{page} / {Math.ceil(result.total / 25)} · {formatNumber(result.total)} מבקרים משוערים</span><button disabled={page * 25 >= result.total} onClick={() => changePage(page + 1)} aria-label="עמוד מבקרים הבא"><ChevronLeft /></button></div>}
      </DataState>
    </Panel>
    {selected && <BrowserHistory key={selected} appId={appId} appName={appName} range={range} visitor={selected} onClose={() => select(null)} />}
  </>;
}

export function ConnectionHistory({ appId, ip, range, onClose }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    apiFetch(`/visitor-analytics/apps/${appId}/timeline?${rangeQuery(range)}&ip=${encodeURIComponent(ip)}&history=all&pages=${raw ? '0' : '1'}`, { signal: controller.signal })
      .then(value => { if (active) { setResult(value); setError(''); } })
      .catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [appId, ip, range, raw, retry]);
  return <Modal label="היסטוריית חיבור" className="visitor-history" onClose={onClose}>
    <header className="visitor-history__head"><h2>היסטוריית חיבור <bdi>{ip}</bdi></h2><button className="icon-btn" onClick={onClose} aria-label="סגירת היסטוריית החיבור"><X /></button></header>
    <DataState loading={loading} error={error} onRetry={() => { setLoading(true); setRetry(retry + 1); }}>
      <div className="visitor-history__summary"><strong>{result?.seen_before_period ? 'הכתובת נמדדה גם לפני הטווח' : 'אין רישום קודם לטווח בהיסטוריה שנשמרה'}</strong>
        <span>נראה לראשונה: <bdi>{formatDateTime(result?.history.first_seen)}</bdi></span>
        <span>{formatNumber(result?.history.page_views)} פתיחות עמודים בהיסטוריה שנשמרה</span></div>
      <p className="status-line">כתובת רשת יכולה להיות משותפת לכמה אנשים ולהשתנות. זיהוי דפדפן חוזר מופיע בלשונית ״מבקרים״.</p>
      <button className="btn" aria-pressed={raw} onClick={() => { setLoading(true); setRaw(!raw); }}>{raw ? 'הצגת פתיחות עמודים בלבד' : 'כולל בקשות טכניות ואוטומטיות'}</button>
      <ol className="visitor-steps">{result?.events.map((event, i) => <li key={`${event.occurred_at}:${i}`}><time><bdi>{formatDateTime(event.occurred_at)}</bdi></time><span><bdi>{event.path}</bdi><small><bdi>{event.method} · HTTP {event.status}</bdi>{event.is_bot ? ' · אוטומציה שסוננה' : event.is_page_view ? ' · פתיחת עמוד' : ' · בקשה טכנית'}</small></span></li>)}</ol>
      {!result?.events.length && <Empty text="אין פעילות שמורה בתצוגה הזאת" />}
      <p className="status-line">עד 250 רשומות אחרונות, מתוך ההיסטוריה שנשמרה עד 90 יום ועד סוף הטווח שנבחר.</p>
    </DataState>
  </Modal>;
}
