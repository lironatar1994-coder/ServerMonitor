import { useCallback, useEffect, useRef, useState } from 'react';
import { ChartNoAxesCombined, ChevronLeft, ChevronRight, ExternalLink, Eye, Footprints, Globe, MapPin, MonitorSmartphone, PanelsTopLeft, Search, Users, X } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch, rangeQuery } from '../lib/api';
import { useRange } from '../lib/useRange';
import { DataState, Empty, Panel, PageHead, RangePicker, RankedList, Stat, StatRow, Tabs } from '../components/AnalyticsParts';
import JewelryInterest from '../components/JewelryInterest';
import ProductAnalytics from '../components/ProductAnalytics';
import TrackingStatus from '../components/TrackingStatus';
import PageInsights from '../components/PageInsights';
import TrafficChart from '../components/TrafficChart';
import SiteSwitcher from '../components/SiteSwitcher';
import { previousRange, rangeSearch } from '../lib/dailyCheck';
import { pageName } from '../lib/analyticsLabels';
import { formatDateTime, formatNumber } from '../lib/format';

import { VISITOR_HINT as BROWSER_SIGNAL_HINT, CONNECTION_HINT as CANDIDATE_HINT, PAGE_HINT as PAGE_VIEW_HINT } from '../lib/analyticsLabels';

const BREAKDOWN_TABS = [
  { id: 'locations', label: 'מיקומים' },
  { id: 'referrers', label: 'מקורות' },
  { id: 'devices', label: 'מכשירים' }
];

const BREAKDOWN_META = {
  pages: { color: 'forest', empty: 'אין צפיות בעמודים' },
  locations: { color: 'ochre', empty: 'אין נתוני מיקום' },
  referrers: { color: 'forest', empty: 'רוב הכניסות ישירות' },
  devices: { color: 'forest', empty: 'אין נתוני מכשיר' },
  statuses: { color: 'ochre', empty: 'אין נתוני תגובה' }
};

const VisitorDetail = () => {
  const { id } = useParams();
  const { days, custom, setDays, setCustom, resolveRange } = useRange(1);
  const [data, setData] = useState(null);
  const [visitors, setVisitors] = useState({ visitors: [], total: 0, page: 1, limit: 25 });
  const [engagement, setEngagement] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState('');
  const [tableError, setTableError] = useState('');
  const [engagementError, setEngagementError] = useState('');
  const [breakdown, setBreakdown] = useState('locations');
  const [selectedIp, setSelectedIp] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [query, setQuery] = useSearchParams();
  const selectedPath = query.get('page');
  const view = selectedPath ? 'pages' : query.get('view') || 'overview';
  const origin = useRef(null);
  const originPath = useRef(selectedPath);
  const wasOpen = useRef(false);
  const [previous, setPrevious] = useState(null);
  const [comparisonError, setComparisonError] = useState('');
  const sequence = useRef(0);
  const setSelectedPath = (path, trigger) => {
    if (trigger) { origin.current = trigger; originPath.current = path; }
    const next = new URLSearchParams(query);
    if (path) {
      const range = data?.range || resolveRange();
      next.set('from', range.from); next.set('to', range.to);
      next.set('page', path); next.set('view', 'pages');
    }
    else { next.delete('page'); next.set('view', 'pages'); }
    setQuery(next, { replace: !trigger });
  };
  useEffect(() => {
    if (!selectedPath && wasOpen.current) {
      const row = origin.current?.isConnected ? origin.current : document.querySelector(`[data-page-path="${CSS.escape(originPath.current || wasOpen.current)}"]`);
      (row || document.querySelector('.workspace-tabs button'))?.focus({ preventScroll: true });
    }
    wasOpen.current = selectedPath;
  }, [selectedPath]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    const seq = ++sequence.current;
    try {
      const range = resolveRange();
      const query = rangeQuery(range);
      const [analytics, productEngagement, prior] = await Promise.all([
        apiFetch(`/visitor-analytics/apps/${id}?${query}`),
        apiFetch(`/visitor-analytics/apps/${id}/engagement?${query}`).catch(error => ({ error: error.message })),
        apiFetch(`/visitor-analytics/apps/${id}?${rangeQuery(previousRange(range))}`).catch(error => ({ error: error.message }))
      ]);
      if (seq !== sequence.current) return;
      setPrevious(prior.error ? null : prior);
      setComparisonError(prior.error || '');
      setData(analytics);
      setEngagement(productEngagement.error ? null : productEngagement);
      setEngagementError(productEngagement.error || '');
      setError('');
    } catch (fetchError) {
      if (seq === sequence.current) setError(fetchError.message);
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [id, resolveRange]);

  const fetchVisitors = useCallback(async () => {
    setTableLoading(true);
    try {
      const query = `${rangeQuery(resolveRange())}&page=${page}&limit=25&search=${encodeURIComponent(search)}`;
      setVisitors(await apiFetch(`/visitor-analytics/apps/${id}/visitors?${query}`));
      setTableError('');
    } catch (error) { setTableError(error.message); }
    finally { setTableLoading(false); }
  }, [id, page, search, resolveRange]);

  useEffect(() => {
    const timeout = window.setTimeout(fetchAnalytics, 0);
    return () => { window.clearTimeout(timeout); /* Invalidate requests from the previous route/range. */
      // eslint-disable-next-line react-hooks/exhaustive-deps
      sequence.current++; };
  }, [fetchAnalytics]);

  useEffect(() => {
    const timeout = window.setTimeout(fetchVisitors, 250);
    return () => window.clearTimeout(timeout);
  }, [fetchVisitors]);

  const handleOpenVisitor = async (ip) => {
    setSelectedIp(ip);
    setTimeline([]);
    try {
      const result = await apiFetch(`/visitor-analytics/apps/${id}/timeline?${rangeQuery(resolveRange())}&ip=${encodeURIComponent(ip)}`);
      setTimeline(result.events || []);
    } catch (fetchError) {
      setTimeline([{ error: fetchError.message }]);
    }
  };

  useEffect(() => {
    if (!selectedIp) return undefined;
    const handleEscape = (event) => event.key === 'Escape' && setSelectedIp(null);
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedIp]);

  const summary = data?.summary || {};
  const pageCount = Math.max(1, Math.ceil((visitors.total || 0) / (visitors.limit || 25)));
  const breakdownMeta = BREAKDOWN_META[breakdown];

  return (
    <div className="page page--visitor-detail">
      <PageHead
        title={data?.app?.name || 'אתר'}
        meta={
          <>
            <Link className="crumb" to={`/visitors${rangeSearch(data?.range || resolveRange())}`}><ChevronRight aria-hidden="true" /> כל האתרים</Link>
            {data?.app && (
              <span className={`chip ${data.app.status === 'online' ? 'is-online' : 'is-offline'}`}>
                {data.app.status === 'online' ? 'פעיל' : 'דורש בדיקה'}
              </span>
            )}
            {data?.app?.url && (
              <a className="icon-btn" href={data.app.url} target="_blank" rel="noreferrer" aria-label="פתיחת האתר" title="פתיחת האתר"><ExternalLink aria-hidden="true" /></a>
            )}
          </>
        }
      >
        <SiteSwitcher currentId={id} range={data?.range || resolveRange()} />
        <RangePicker
          updatedAt={data?.generated_at}
          range={custom}
          days={days}
          customActive={Boolean(custom)}
          onChange={(value) => { setDays(value); setPage(1); }}
          onCustom={(value) => { setCustom(value); setPage(1); }}
          loading={loading}
          onRefresh={fetchAnalytics}
        />
      </PageHead>

      <DataState loading={loading && !data} error={error} onRetry={fetchAnalytics}>
        <TrackingStatus health={data?.tracking_health} />
        {data?.app?.status && data.app.status !== 'online' && <div className="attention-list"><Link to={`/services/${id}`}>האתר דורש בדיקת זמינות <ChevronLeft /></Link></div>}
        <StatRow>
          <Stat icon={Users} label="מבקרים משוערים" value={summary.browser_signal_visitors} previous={data?.comparison?.previous?.browser_signal_visitors} tone="forest" />
          <Stat icon={Footprints} label="ביקורים" value={summary.browser_signal_sessions} previous={data?.comparison?.previous?.browser_signal_sessions} />
          <Stat icon={Eye} label="צפיות" value={summary.browser_signal_page_views} previous={data?.comparison?.previous?.browser_signal_page_views} />
        </StatRow>
        <div className="workspace-tabs"><Tabs label="תצוגת אתר" tabs={[{ id: 'overview', label: 'סקירה', icon: ChartNoAxesCombined }, { id: 'pages', label: 'עמודים', icon: PanelsTopLeft }, { id: 'audience', label: 'קהל', icon: Globe }]} value={view} onChange={value => { const next = new URLSearchParams(query); next.set('view', value); next.delete('page'); setQuery(next); }} /></div>
        {view === 'overview' && <>
          {!summary.browser_signal_page_views && <p className="status-line is-attention">לא נמדדה פעילות בטווח הזה.</p>}
          <TrafficChart data={data} previous={previous} comparisonError={comparisonError} />
          <Panel title="עמודים מובילים" hint={`${PAGE_VIEW_HINT} ${BROWSER_SIGNAL_HINT} ביקורים וצפיות כוללים חזרות.`}><RankedList items={data?.pages} max={5} onSelect={setSelectedPath} labelFor={value => pageName(value, data?.app?.name)} /></Panel>
        </>}
        {view === 'audience' && <Panel title="מקורות וקהל" hint="פילוח לפי פתיחות עמודים שנרשמו בשרת; מיקום משוער לפי כתובת רשת." action={<Tabs tabs={BREAKDOWN_TABS} value={breakdown} onChange={setBreakdown} />}><RankedList items={data?.[breakdown]} color={breakdownMeta.color} empty={breakdownMeta.empty} /></Panel>}
        {view === 'pages' && <>
        <div className={`page-explorer ${selectedPath ? 'has-selection' : ''}`}>
          <Panel title="עמודים שנצפו" hint={PAGE_VIEW_HINT}>
            <RankedList items={data?.pages} onSelect={setSelectedPath} selected={selectedPath} labelFor={value => pageName(value, data?.app?.name)} />
          </Panel>
          {selectedPath && data?.app && <PageInsights key={`${id}:${selectedPath}:${days}:${custom?.from}`} app={data.app} path={selectedPath} resolveRange={resolveRange} onClose={() => setSelectedPath(null)} onSelect={setSelectedPath} />}
        </div>
        <JewelryInterest interest={data?.jewelry_interest} siteUrl={data?.app?.url} />
        <details className="measurement-details"><summary>מעורבות</summary>
        {engagementError && <div className="banner banner--error" role="alert">מדידת השימוש לא נטענה. {engagementError}<button className="btn" onClick={fetchAnalytics}>ניסיון נוסף</button></div>}
        {(data?.app?.name === 'PDF Studio' || data?.app?.name === 'LA webs' || data?.app?.name === 'Miryam Zelig' || data?.app?.name === 'Seder' || Boolean(engagement?.engagement_samples) || Boolean(engagement?.product?.summary?.sessions)) && (
          <ProductAnalytics engagement={engagement || {}} mode={data?.app?.name === 'PDF Studio' ? 'product' : 'site'} />
        )}
        </details>

        </>}
        <details className="measurement-details"><summary>אבחון</summary>
        <StatRow>
          <Stat label="כתובות רשת שונות" value={summary.unique_candidates} previous={data?.comparison?.previous?.unique_candidates} hint={CANDIDATE_HINT} />
          <Stat label="פתיחות עמודים לפי השרת" value={summary.page_views} previous={data?.comparison?.previous?.page_views} hint={PAGE_VIEW_HINT} />
          <Stat label="בקשות אוטומטיות שסוננו" value={summary.bot_requests} />
        </StatRow>
        <Panel title="תגובות שרת"><RankedList items={data?.statuses} /></Panel>
        <Panel
          title="פעילות לפי חיבור"
          hint="לחיצה על שורה פותחת את ציר הפעילות המלא"
          action={
            <div className="search">
              <Search aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="IP, עמוד או עיר"
                aria-label="חיפוש מבקר"
              />
              {search && <button type="button" onClick={() => { setSearch(''); setPage(1); }} aria-label="ניקוי חיפוש"><X aria-hidden="true" /></button>}
            </div>
          }
          bleed
        >
          <div className={`table-wrap ${tableLoading ? 'is-busy' : ''}`}>
            {tableError && <div className="banner banner--error" role="alert">{tableError}<button className="btn" onClick={fetchVisitors}>ניסיון נוסף</button></div>}
            <table className="data-table">
              <thead>
                <tr><th>מבקר</th><th>מיקום ומכשיר</th><th>צפיות</th><th>לאחרונה</th><th>עמוד אחרון</th></tr>
              </thead>
              <tbody>
                {visitors.visitors.map((visitor) => (
                  <tr key={visitor.ip} onClick={() => handleOpenVisitor(visitor.ip)} tabIndex="0" onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && handleOpenVisitor(visitor.ip)}>
                    <td><b dir="ltr">{visitor.ip}</b></td>
                    <td>
                      <span><MapPin aria-hidden="true" /> {visitor.city || visitor.region || 'לא ידוע'}</span>
                      <small><MonitorSmartphone aria-hidden="true" /> {visitor.device_type || 'לא ידוע'}</small>
                    </td>
                    <td><strong>{formatNumber(visitor.requests)}</strong></td>
                    <td>{formatDateTime(visitor.last_seen)}</td>
                    <td dir="ltr" className="is-path">{visitor.latest_path || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="record-list">
              {visitors.visitors.map((visitor) => (
                <li key={visitor.ip}>
                  <button type="button" onClick={() => handleOpenVisitor(visitor.ip)}>
                    <span className="record-list__top"><b dir="ltr">{visitor.ip}</b><strong>{formatNumber(visitor.requests)}</strong></span>
                    <small>{[visitor.city || visitor.region, visitor.device_type].filter(Boolean).join(' · ') || 'לא ידוע'} · {formatDateTime(visitor.last_seen)}</small>
                    <em dir="ltr">{visitor.latest_path || '—'}</em>
                  </button>
                </li>
              ))}
            </ul>

            {!tableError && !visitors.visitors.length && <Empty text={search ? 'אין תוצאות לחיפוש הזה' : 'אין חיבורים שנמדדו בטווח הזה'} />}
          </div>

          {pageCount > 1 && (
            <div className="pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="עמוד קודם"><ChevronRight aria-hidden="true" /></button>
              <span>{page} / {pageCount} · {formatNumber(visitors.total)} כתובות רשת שונות</span>
              <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label="עמוד הבא"><ChevronLeft aria-hidden="true" /></button>
            </div>
          )}
        </Panel>
        </details>
      </DataState>

      {selectedIp && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedIp(null)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="visitor-drawer-title">
            <header>
              <h2 id="visitor-drawer-title" dir="ltr">{selectedIp}</h2>
              <button type="button" onClick={() => setSelectedIp(null)} aria-label="סגירה"><X aria-hidden="true" /></button>
            </header>
            <div className="timeline">
              {!timeline.length && <div className="skeleton-stack"><span /><span /></div>}
              {timeline.map((event, index) => event.error ? <div className="error-state" key="error">{event.error}</div> : (
                <article key={`${event.occurred_at}-${index}`}>
                  <i className={event.is_bot ? 'is-bot' : ''} aria-hidden="true" />
                  <time>{formatDateTime(event.occurred_at)}</time>
                  <b dir="ltr">{event.method} {event.path}</b>
                  <small>HTTP {event.status} · {event.city || event.region || 'מיקום לא ידוע'}</small>
                </article>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default VisitorDetail;
