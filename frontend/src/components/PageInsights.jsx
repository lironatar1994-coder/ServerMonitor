import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ExternalLink, Eye, Activity, MessageCircle, MousePointer2, Timer, ArrowDownToLine, TriangleAlert } from 'lucide-react';
import { apiFetch, rangeQuery } from '../lib/api';
import { pageName, PAGE_HINT } from '../lib/analyticsLabels';
import { formatNumber, formatDateTime } from '../lib/format';
import { DataState, Empty, Hint, Panel, Stat, StatRow, Tabs } from './AnalyticsParts';
import SiteLink from './SiteLink';

const viewDate = value => new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
}).format(new Date(value));
const deviceName = value => ({ Mobile: 'נייד', Tablet: 'טאבלט', Desktop: 'מחשב' })[value] || 'מכשיר לא ידוע';

export default function PageInsights({ app, path, resolveRange, onClose, onSelect }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [retry, setRetry] = useState(0);
  const [historySource, setHistorySource] = useState('auto');
  const [historyPage, setHistoryPage] = useState(1);
  const section = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useLayoutEffect(() => {
    const mobile = window.matchMedia('(max-width: 760px)');
    const oldOverflow = document.body.style.overflow;
    const siblings = [];
    let ancestor = section.current;
    while (ancestor && ancestor !== document.body) {
      for (const sibling of ancestor.parentElement?.children || []) if (sibling !== ancestor && sibling instanceof HTMLElement) siblings.push([sibling, sibling.inert]);
      ancestor = ancestor.parentElement;
    }
    const sync = () => {
      document.body.style.overflow = mobile.matches ? 'hidden' : oldOverflow;
      section.current?.setAttribute('aria-modal', String(mobile.matches));
      siblings.forEach(([node, inert]) => { node.inert = mobile.matches || inert; });
    };
    sync(); mobile.addEventListener('change', sync);
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab' || !mobile.matches) return;
      const controls = [...section.current.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === section.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = oldOverflow; siblings.forEach(([node, inert]) => { node.inert = inert; }); mobile.removeEventListener('change', sync); document.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`/visitor-analytics/apps/${app.id}/page?${rangeQuery(resolveRange())}&path=${encodeURIComponent(path)}&historySource=${historySource}&historyPage=${historyPage}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ loading: false, data, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setState({ loading: false, data: null, error: error.message }); });
    return () => controller.abort();
  }, [app.id, path, resolveRange, retry, historySource, historyPage]);
  useEffect(() => {
    section.current?.focus({ preventScroll: true });
    if (!window.matchMedia('(max-width: 760px)').matches) section.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, []);
  const data = state.data;
  const history = data?.history;
  const changeHistory = (source, page) => {
    if (source === historySource && page === historyPage) return;
    setState(s => ({ ...s, loading: true, error: '' }));
    setHistorySource(source); setHistoryPage(page);
  };
  const destination = new URL(app.url);
  destination.pathname = path.startsWith('/') ? path : '/';
  destination.search = ''; destination.hash = '';
  return <section ref={section} tabIndex={-1} role="dialog" aria-label="מה קרה אחרי הצפייה בעמוד" className="page-insights">
    <Panel title={pageName(path, app.name)} hint={`${PAGE_HINT} הביקורים ולחיצות הקשר נמדדו בדפדפן. לחיצה אינה פנייה שנשלחה; אין הוכחה שהעמוד גרם לה.`} action={<button className="icon-btn" type="button" onClick={onClose} aria-label="סגירת פירוט העמוד"><X /></button>}>
      <DataState loading={state.loading && !data} error={state.error} onRetry={() => { setState(s => ({ ...s, loading: true, error: '' })); setRetry(n => n + 1); }}>
        {data && <>
          <StatRow><Stat icon={Eye} label="צפיות שרת" value={data.log.views} /><Stat icon={Activity} label="ביקורים" value={data.visits} /><Stat icon={MousePointer2} label="עם לחיצת קשר" value={data.contact_visits} /></StatRow>
          {history && <div className="page-view-history" aria-busy={state.loading}>
            <h3>הצפיות בעמוד<Hint text="התאריכים והשעות לפי שעון ישראל ובטווח שנבחר. ראשון שנשמר או חוזר נקבעים לפי ביקורים קודמים של אותו דפדפן אנונימי באתר, עד הצפייה הזאת. צפיות שרת אינן מזהות דפדפן ולא מוכיחות ביקור של אדם. שתי הרשימות הן מקורות נפרדים ואינן מצטרפות לסכום אחד." /></h3>
            <Tabs label="מקור רשימת הצפיות" value={history.source} onChange={source => changeHistory(source, 1)} tabs={[
              { id: 'browser', label: `דפדפן (${formatNumber(history.browser_views)})` },
              { id: 'server', label: `שרת (${formatNumber(data.log.views)})` }
            ]} />
            {history.source === 'server' && <p className="status-line">צפיות שרת בלבד — חדש או חוזר לא ידוע.</p>}
            <p className="page-view-caption" role="status">{state.loading ? 'טוענים צפיות…' : history.total ? `${formatNumber((history.page - 1) * history.limit + 1)}–${formatNumber(Math.min(history.page * history.limit, history.total))} מתוך ${formatNumber(history.total)} · שעון ישראל` : 'אין צפיות במקור הזה בטווח שנבחר'}</p>
            <ol className="page-view-list" aria-label="תאריכי הצפיות וסוג הביקור">
              {history.rows.map(row => <li key={`${history.source}:${row.id}`}>
                <time dateTime={row.occurred_at}><bdi>{viewDate(row.occurred_at)}</bdi><small>{deviceName(row.device)}</small></time>
                <span className="page-view-identity">{row.returning === null ? 'לא ידוע' : row.returning ? 'ביקור חוזר' : 'ראשון שנשמר'}</span>
              </li>)}
            </ol>
            {(history.page > 1 || history.has_more) && <div className="page-view-pagination">
              <button className="btn" type="button" disabled={state.loading || history.page <= 1} onClick={() => changeHistory(history.source, history.page - 1)}>צפיות חדשות יותר</button>
              <button className="btn" type="button" disabled={state.loading || !history.has_more} onClick={() => changeHistory(history.source, history.page + 1)}>צפיות קודמות</button>
            </div>}
          </div>}
          <h3>פעולות המשך</h3>
          {data.actions.length ? <ul className="insight-list">{data.actions.map((row, i) => <li key={i}><span>{row.event_type === 'outbound_click' ? 'מעבר לאתר' : row.label === 'whatsapp' ? 'לחיצת WhatsApp' : row.label === 'phone' ? 'לחיצת טלפון' : 'לחיצת קשר'} · {pageName(row.path, app.name)}</span><b>{formatNumber(row.visits)} ביקורים</b></li>)}</ul> : <Empty text="לא נמדדו לחיצות בהמשך" />}
          <h3>המשך ביקור</h3>
          {data.next.length ? <ul className="insight-list">{data.next.map(row => <li key={row.path}><button className="text-action" type="button" onClick={() => onSelect(row.path)}>{pageName(row.path, app.name)}</button><b>{formatNumber(row.visits)} ביקורים</b></li>)}</ul> : <Empty text="לא נמדד מעבר נוסף" />}
          {data.engagement?.visits > 0 && <div className="engagement-strip"><span><Timer aria-hidden="true" />{formatNumber(Math.round(data.engagement.active_ms / 1000))} שנ׳ בממוצע</span><span><ArrowDownToLine aria-hidden="true" />{formatNumber(Math.round(data.engagement.scroll))}% גלילה</span></div>}
          {data.low_sample && <p className="status-line is-attention"><TriangleAlert aria-hidden="true" /> מדגם קטן</p>}
          <div className="insight-actions"><SiteLink className="btn" href={destination.href}><ExternalLink aria-hidden="true" />לעמוד</SiteLink><Link className="btn" to={`/clients/${app.id}`}><MessageCircle aria-hidden="true" />פניות</Link></div>
          <details className="measurement-details"><summary>מגבלות המדידה</summary><p>המדידה החלה ב־{formatDateTime(data.coverage_since)}. חוסר מדידה אינו מעיד בהכרח על סיום הביקור; ייתכנו חסימות מדידה. מדגם קטן אינו מספיק למסקנות. לחיצות קשר אינן פניות מאומתות ואין שיוך אוטומטי ביניהן.</p></details>
        </>}
      </DataState>
    </Panel>
  </section>;
}
