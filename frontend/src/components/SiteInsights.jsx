import { useCallback, useEffect, useState } from 'react';
import { Gauge, Plus, Rocket, StickyNote, Trash2 } from 'lucide-react';
import { Empty, IconAction, Panel } from './AnalyticsParts';
import { apiFetch, rangeQuery } from '../lib/api';
import { formatDateTime, formatNumber } from '../lib/format';
import { getSessionSnapshot } from '../lib/session';

// Google's Core Web Vitals thresholds (good / needs improvement), evaluated at p75.
const VITALS = [
  { id: 'lcp_ms', label: 'טעינת התוכן הראשי', short: 'LCP', good: 2500, poor: 4000, format: (v) => `${(v / 1000).toFixed(1)} s` },
  { id: 'inp_ms', label: 'תגובה ללחיצה', short: 'INP', good: 200, poor: 500, format: (v) => `${formatNumber(v)} ms` },
  { id: 'cls', label: 'יציבות העמוד', short: 'CLS', good: 0.1, poor: 0.25, format: (v) => v.toFixed(2) },
  { id: 'ttfb_ms', label: 'תשובת השרת', short: 'TTFB', good: 800, poor: 1800, format: (v) => `${formatNumber(v)} ms` }
];
const rating = (metric, value) => value == null ? null : value <= metric.good ? ['טוב', 'is-healthy'] : value <= metric.poor ? ['בינוני', 'is-attention'] : ['איטי', 'is-danger'];

export function SpeedPanel({ appId, range }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    apiFetch(`/visitor-analytics/apps/${appId}/vitals?${rangeQuery(range)}`)
      .then((value) => { if (alive) { setData(value); setError(''); } })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [appId, range]);
  const overall = data?.overall;
  return (
    <Panel title="מהירות אצל גולשים" hint="נמדד בדפדפנים של גולשים אמיתיים (Core Web Vitals), ערך שמתאים ל־75% מהביקורים. בדיקות אוטומטיות ודפדפנים פנימיים אינם נכללים." action={<Gauge aria-hidden="true" />}>
      {error && <p className="status-line is-attention">{error}</p>}
      {data && !overall?.samples && <Empty text="עדיין אין מדידות מהירות בטווח הזה" />}
      {overall?.samples > 0 && (
        <>
          <dl className="vitals-grid">
            {VITALS.map((metric) => {
              const value = overall[metric.id];
              const [label, tone] = rating(metric, value) || ['—', ''];
              return (
                <div key={metric.id}>
                  <dt>{metric.label} <bdi dir="ltr">{metric.short}</bdi></dt>
                  <dd><bdi dir="ltr">{value == null ? '—' : metric.format(value)}</bdi> <small className={tone}>{label}</small></dd>
                </div>
              );
            })}
          </dl>
          <p className="status-line">
            {formatNumber(overall.samples)} מדידות{overall.samples < 20 ? ' · מדגם קטן' : ''}
            {data.mobile.samples > 0 && data.mobile.lcp_ms != null ? ` · בנייד: ${VITALS[0].format(data.mobile.lcp_ms)}` : ''}
            {data.desktop.samples > 0 && data.desktop.lcp_ms != null ? ` · במחשב: ${VITALS[0].format(data.desktop.lcp_ms)}` : ''}
          </p>
        </>
      )}
    </Panel>
  );
}

export function NotFoundPanel({ appId, range }) {
  const [pages, setPages] = useState(null);
  useEffect(() => {
    let alive = true;
    apiFetch(`/visitor-analytics/apps/${appId}/not-found?${rangeQuery(range)}`)
      .then((value) => alive && setPages(value.pages))
      .catch(() => alive && setPages([]));
    return () => { alive = false; };
  }, [appId, range]);
  return (
    <Panel title="עמודים שלא נמצאו (404)" hint="כתובות שגולשים, לא בוטים, ניסו לפתוח וקיבלו 'לא נמצא'. מקור אחרון מראה מאיפה הגיעו, למשל קישור ישן בגוגל." bleed>
      {pages?.length ? (
        <ul className="backup-list">
          {pages.map((row) => (
            <li key={row.path}><div className="backup-row">
              <span><b dir="ltr">{row.path}</b><small dir="ltr">{row.referrer || 'ללא מקור'}</small></span>
              <span>{formatNumber(row.visitors)} גולשים</span>
              <span className="muted">{formatDateTime(row.last_seen)}</span>
            </div></li>
          ))}
        </ul>
      ) : <Empty text={pages ? 'אין עמודים חסרים בטווח הזה' : 'טוען…'} />}
    </Panel>
  );
}

/** Uncaught script errors reported by visitors' browsers, most frequent first. */
export function ScriptErrorsPanel({ appId, range }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    apiFetch(`/visitor-analytics/apps/${appId}/js-errors?${rangeQuery(range)}`)
      .then((value) => alive && setData(value))
      .catch(() => alive && setData({ total: 0, errors: [], failed: true }));
    return () => { alive = false; };
  }, [appId, range]);
  return (
    <Panel title="שגיאות בדפדפן" hint="שגיאות JavaScript שקרו אצל גולשים בסקריפטים של האתר עצמו: סוג, הודעה ועמוד בלבד, בלי פרטים אישיים. נאסף באתרים עם תג המדידה של המוניטור; Seder ו־PDF Studio מודדים בעצמם ואינם נכללים." bleed
      action={data?.total ? <span className="muted">{formatNumber(data.total)} מקרים</span> : null}>
      {data?.errors?.length ? (
        <ul className="backup-list">
          {data.errors.map((row) => (
            <li key={row.signature}><div className="backup-row">
              <span><b dir="ltr">{row.name}: {row.message}</b>
                <small dir="ltr">{row.top_path}{row.pages > 1 ? ` +${row.pages - 1}` : ''}{row.source ? ` · ${row.source}${row.line ? `:${row.line}` : ''}` : ''}</small></span>
              <span>{formatNumber(row.count)}</span>
              <span className="muted">{formatDateTime(row.last_seen)}</span>
            </div></li>
          ))}
        </ul>
      ) : <Empty text={!data ? 'טוען…' : data.failed ? 'לא ניתן לטעון שגיאות' : 'לא נרשמו שגיאות בטווח הזה'} />}
    </Panel>
  );
}

/** Notes and runtime starts on the chart's period; editors add notes, authors and owners remove them. */
export function ChartNotes({ appId = null, range, onMarks }) {
  const [data, setData] = useState({ notes: [], deploys: [] });
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const user = getSessionSnapshot();
  const canWrite = ['owner', 'editor'].includes(user?.role) && !user?.service;
  const load = useCallback(async () => {
    try {
      const value = await apiFetch(`/visitor-analytics/annotations?${rangeQuery(range)}${appId ? `&app_id=${appId}` : ''}`);
      setData(value);
      onMarks?.([...value.notes.map((n) => ({ at: n.at, kind: 'note', label: n.text })),
        ...value.deploys.map((d) => ({ at: d.at, kind: 'deploy', label: `הופעל מחדש: ${d.name}` }))]);
    } catch { /* the chart stays usable without marks */ }
  }, [appId, range, onMarks]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  const save = async (event) => {
    event.preventDefault();
    try {
      await apiFetch('/visitor-analytics/annotations', { method: 'POST', body: JSON.stringify({ text, app_id: appId }) });
      setText(''); setAdding(false); setError(''); load();
    } catch (e) { setError(e.message); }
  };
  const remove = async (id) => {
    try { await apiFetch(`/visitor-analytics/annotations/${id}`, { method: 'DELETE' }); load(); }
    catch (e) { setError(e.message); }
  };
  const items = [...data.notes.map((n) => ({ ...n, kind: 'note' })), ...data.deploys.map((d) => ({ ...d, kind: 'deploy', text: d.name }))]
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="chart-notes">
      {items.length > 0 && (
        <ul>
          {items.slice(0, expanded ? items.length : 2).map((item) => (
            <li key={`${item.kind}-${item.id || item.app_id}-${item.at}`}>
              {item.kind === 'note' ? <StickyNote aria-label="הערה" /> : <Rocket aria-label="הפעלה מחדש או פריסה" />}
              <time>{formatDateTime(item.at)}</time>
              <span>{item.kind === 'deploy' ? `הופעל מחדש: ${item.text}` : item.text}</span>
              {item.kind === 'note' && <small>{item.author}{item.app_id == null && appId ? ' · כל האתרים' : ''}</small>}
              {item.kind === 'note' && (user?.role === 'owner' || item.author === user?.username) && !user?.service && (
                <IconAction icon={Trash2} label={`מחיקת ההערה "${item.text}"`} onClick={() => remove(item.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {items.length > 2 && <button type="button" className="chart-notes__toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'הצגת האחרונים' : `עוד ${formatNumber(items.length - 2)} אירועים`}
      </button>}
      {canWrite && (adding ? (
        <form onSubmit={save} className="chart-notes__form">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} required autoFocus placeholder="מה השתנה? למשל: קמפיין חדש עלה" aria-label="טקסט ההערה" />
          <button className="btn btn--primary" disabled={!text.trim()}>שמירה</button>
          <button type="button" className="btn" onClick={() => { setAdding(false); setText(''); }}>ביטול</button>
        </form>
      ) : (
        <button type="button" className="btn chart-notes__add" onClick={() => setAdding(true)}><Plus aria-hidden="true" /> הערה על הגרף</button>
      ))}
      {error && <p className="status-line is-attention" role="alert">{error}</p>}
    </div>
  );
}
