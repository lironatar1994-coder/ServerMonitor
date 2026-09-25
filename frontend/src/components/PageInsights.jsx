import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ExternalLink, Eye, Activity, MessageCircle, MousePointer2, Timer, ArrowDownToLine, TriangleAlert } from 'lucide-react';
import { apiFetch, rangeQuery } from '../lib/api';
import { pageName, PAGE_HINT } from '../lib/analyticsLabels';
import { formatNumber, formatDateTime } from '../lib/format';
import { DataState, Empty, Panel, Stat, StatRow } from './AnalyticsParts';

export default function PageInsights({ app, path, resolveRange, onClose, onSelect }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [retry, setRetry] = useState(0);
  const section = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
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
    apiFetch(`/visitor-analytics/apps/${app.id}/page?${rangeQuery(resolveRange())}&path=${encodeURIComponent(path)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ loading: false, data, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setState({ loading: false, data: null, error: error.message }); });
    section.current?.focus({ preventScroll: true });
    if (!window.matchMedia('(max-width: 760px)').matches) section.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    return () => controller.abort();
  }, [app.id, path, resolveRange, retry]);
  const data = state.data;
  const destination = new URL(app.url);
  destination.pathname = path.startsWith('/') ? path : '/';
  destination.search = ''; destination.hash = '';
  return <section ref={section} tabIndex={-1} role="dialog" aria-label="מה קרה אחרי הצפייה בעמוד" className="page-insights">
    <Panel title={pageName(path, app.name)} hint={`${PAGE_HINT} הביקורים ולחיצות הקשר נמדדו בדפדפן. לחיצה אינה פנייה שנשלחה; אין הוכחה שהעמוד גרם לה.`} action={<button className="icon-btn" type="button" onClick={onClose} aria-label="סגירת פירוט העמוד"><X /></button>}>
      <DataState loading={state.loading} error={state.error} onRetry={() => { setState(s => ({ ...s, loading: true, error: '' })); setRetry(n => n + 1); }}>
        {data && <>
          <StatRow><Stat icon={Eye} label="צפיות שרת" value={data.log.views} /><Stat icon={Activity} label="ביקורים" value={data.visits} /><Stat icon={MousePointer2} label="עם לחיצת קשר" value={data.contact_visits} /></StatRow>
          <h3>פעולות המשך</h3>
          {data.actions.length ? <ul className="insight-list">{data.actions.map((row, i) => <li key={i}><span>{row.event_type === 'outbound_click' ? 'מעבר לאתר' : row.label === 'whatsapp' ? 'לחיצת WhatsApp' : row.label === 'phone' ? 'לחיצת טלפון' : 'לחיצת קשר'} · {pageName(row.path, app.name)}</span><b>{formatNumber(row.visits)} ביקורים</b></li>)}</ul> : <Empty text="לא נמדדו לחיצות בהמשך" />}
          <h3>המשך ביקור</h3>
          {data.next.length ? <ul className="insight-list">{data.next.map(row => <li key={row.path}><button className="text-action" type="button" onClick={() => onSelect(row.path)}>{pageName(row.path, app.name)}</button><b>{formatNumber(row.visits)} ביקורים</b></li>)}</ul> : <Empty text="לא נמדד מעבר נוסף" />}
          {data.engagement?.visits > 0 && <div className="engagement-strip"><span><Timer aria-hidden="true" />{formatNumber(Math.round(data.engagement.active_ms / 1000))} שנ׳ בממוצע</span><span><ArrowDownToLine aria-hidden="true" />{formatNumber(Math.round(data.engagement.scroll))}% גלילה</span></div>}
          {data.low_sample && <p className="status-line is-attention"><TriangleAlert aria-hidden="true" /> מדגם קטן</p>}
          <div className="insight-actions"><a className="btn" href={destination.href} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />לעמוד</a><Link className="btn" to={`/clients/${app.id}`}><MessageCircle aria-hidden="true" />פניות</Link></div>
          <details className="measurement-details"><summary>מגבלות המדידה</summary><p>המדידה החלה ב־{formatDateTime(data.coverage_since)}. חוסר מדידה אינו מעיד בהכרח על סיום הביקור; ייתכנו חסימות מדידה. מדגם קטן אינו מספיק למסקנות. לחיצות קשר אינן פניות מאומתות ואין שיוך אוטומטי ביניהן.</p></details>
        </>}
      </DataState>
    </Panel>
  </section>;
}
