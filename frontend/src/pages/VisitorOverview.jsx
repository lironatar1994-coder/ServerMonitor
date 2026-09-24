import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ChevronLeft, CircleCheck, CircleHelp, Eye, Activity, Search, TriangleAlert, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch, rangeQuery } from '../lib/api';
import { useRange } from '../lib/useRange';
import { Change, DataState, Empty, Panel, PageHead, RangePicker, RankedList, Stat, StatRow, Tabs } from '../components/AnalyticsParts';
import { formatNumber } from '../lib/format';
import TrackingStatus from '../components/TrackingStatus';
import TrafficChart from '../components/TrafficChart';
import { previousRange, rangeSearch } from '../lib/dailyCheck';
import { VISITOR_HINT, CONNECTION_HINT } from '../lib/analyticsLabels';

const SORT_KEY = 'vee-monitor.site-sort';
const VisitorOverview = () => {
  const { days, custom, setDays, setCustom, resolveRange } = useRange(1);
  const [data, setData] = useState(null), [previous, setPrevious] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [comparisonError, setComparisonError] = useState(''), [healthError, setHealthError] = useState('');
  const [apps, setApps] = useState([]), [search, setSearch] = useState('');
  const [sort, setSort] = useState(() => { try { return localStorage.getItem(SORT_KEY) || 'activity'; } catch { return 'activity'; } });
  const [breakdown, setBreakdown] = useState('pages');
  const request = useRef(0);
  const fetchAnalytics = useCallback(async (quiet = false) => {
    const seq = ++request.current;
    if (!quiet) setLoading(true);
    const range = resolveRange();
    const results = await Promise.allSettled([
      apiFetch(`/visitor-analytics/overview?${rangeQuery(range)}`),
      apiFetch(`/visitor-analytics/overview?${rangeQuery(previousRange(range))}`),
      apiFetch('/apps')
    ]);
    if (seq !== request.current) return;
    if (results[0].status === 'fulfilled') { setData(results[0].value); setError(''); }
    else setError(results[0].reason.message);
    setPrevious(results[1].status === 'fulfilled' ? results[1].value : null);
    setComparisonError(results[1].status === 'rejected' ? results[1].reason.message : '');
    setApps(results[2].status === 'fulfilled' ? results[2].value : []);
    setHealthError(results[2].status === 'rejected' ? 'בדיקות זמינות האתרים לא נטענו' : '');
    setLoading(false);
  }, [resolveRange]);
  useEffect(() => {
    const initial = setTimeout(fetchAnalytics, 0), interval = setInterval(() => fetchAnalytics(true), 30000);
    return () => { clearTimeout(initial); clearInterval(interval); /* Invalidate requests from the previous route/range. */
      // eslint-disable-next-line react-hooks/exhaustive-deps
      request.current++; };
  }, [fetchAnalytics]);
  const sites = useMemo(() => {
    const before = new Map((previous?.sites || []).map(s => [s.app_id, s]));
    return (data?.sites || []).filter(s => `${s.name} ${s.url}`.toLowerCase().includes(search.toLowerCase().trim()))
      .map(s => ({ ...s, previous: before.get(s.app_id)?.browser_signal_sessions, health: apps.find(a => a.id === s.app_id) }))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'he') : sort === 'change'
        ? Number(a.previous == null) - Number(b.previous == null) || (a.previous != null && b.previous != null ? Math.abs(b.browser_signal_sessions - b.previous) - Math.abs(a.browser_signal_sessions - a.previous) : 0)
        : b.browser_signal_sessions - a.browser_signal_sessions || b.browser_signal_page_views - a.browser_signal_page_views);
  }, [data, previous, apps, search, sort]);
  const failures = apps.filter(app => app.analytics_enabled && app.status !== 'online');
  const summary = data?.summary || {}, before = data?.comparison?.previous || {};
  const destination = id => `/visitors/${id}${rangeSearch(data?.range || resolveRange())}`;
  return <div className="page page--visitors">
    <PageHead title="אתרים"><RangePicker days={days} customActive={Boolean(custom)} range={custom} onChange={setDays} onCustom={setCustom} loading={loading} onRefresh={() => fetchAnalytics()} updatedAt={data?.generated_at} /></PageHead>
    <DataState loading={loading && !data} error={error} onRetry={() => fetchAnalytics()}>
      {failures.length > 0 && <div className="attention-list" role="alert"><b>דורש בדיקה</b>{failures.map(app => <Link key={app.id} to={`/services/${app.id}`}>{app.name} · {app.status === 'offline' ? 'לא זמין' : 'מצב לא ידוע'}<ChevronLeft /></Link>)}</div>}
      {healthError && <p className="status-line is-attention" role="status">{healthError}</p>}
      <TrackingStatus health={data?.tracking_health} />
      <StatRow>
        <Stat icon={Users} label="מבקרים משוערים" value={summary.browser_signal_visitors} previous={before.browser_signal_visitors} />
        <Stat icon={Activity} label="ביקורים" value={summary.browser_signal_sessions} previous={before.browser_signal_sessions} />
        <Stat icon={Eye} label="צפיות" value={summary.browser_signal_page_views} previous={before.browser_signal_page_views} />
      </StatRow>
      <Panel title="השוואת אתרים" hint={`${VISITOR_HINT} ביקורים כוללים חזרה לאתר; צפיות הן פתיחות עמודים שנמדדו. סימן אזהרה ליד השינוי מציין מדגם קטן או חוסר מדידה. אין קודמים פירושו שלא נמדדה פעילות בתקופה הקודמת.`} className="comparison-panel" action={<>
        <label className="search"><Search aria-hidden="true" /><input aria-label="חיפוש אתר" placeholder="חיפוש אתר" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label className="sort-control"><ArrowDownUp aria-hidden="true" /><select aria-label="מיון אתרים" value={sort} onChange={e => { setSort(e.target.value); try { localStorage.setItem(SORT_KEY, e.target.value); } catch { /* storage optional */ } }}><option value="activity">פעילות</option><option value="change">שינוי</option><option value="name">שם</option></select></label>
      </>} bleed>
        {comparisonError && <p className="status-line is-attention">ההשוואה לתקופה הקודמת לא נטענה</p>}
        <div className="comparison-labels" aria-hidden="true"><span>אתר</span><span><Users />אומדן</span><span><Activity />ביקורים</span><span><Eye />צפיות</span><span>שינוי בביקורים</span></div>
        <ol className="comparison-list">{sites.map(site => <li key={site.app_id}><Link to={destination(site.app_id)}>
          <span className="comparison-identity"><span className={`site-health ${site.health?.status === 'online' ? 'is-healthy' : 'is-attention'}`} role="img" aria-label={site.health?.status === 'online' ? 'זמין בבדיקה האחרונה' : site.health ? 'דורש בדיקה' : 'מצב זמינות לא ידוע'} title={site.health?.status === 'online' ? 'זמין בבדיקה האחרונה' : site.health ? 'דורש בדיקה' : 'מצב זמינות לא ידוע'}>{site.health?.status === 'online' ? <CircleCheck /> : site.health ? <TriangleAlert /> : <CircleHelp />}</span><b dir="auto">{site.name}</b></span>
          <span className="comparison-value" aria-label={`מבקרים משוערים: ${formatNumber(site.browser_signal_visitors)}`}><Users aria-hidden="true" /><strong>{formatNumber(site.browser_signal_visitors)}</strong></span>
          <span className="comparison-value" aria-label={`ביקורים שנמדדו: ${formatNumber(site.browser_signal_sessions)}`}><Activity aria-hidden="true" /><strong>{formatNumber(site.browser_signal_sessions)}</strong></span>
          <span className="comparison-value" aria-label={`עמודים שנפתחו: ${formatNumber(site.browser_signal_page_views)}`}><Eye aria-hidden="true" /><strong>{formatNumber(site.browser_signal_page_views)}</strong></span>
          <span className="comparison-change"><Change current={site.browser_signal_sessions} previous={site.previous} />{!site.browser_signal_page_views ? <small>לא נמדד</small> : site.browser_signal_sessions < 30 && <TriangleAlert className="sample-warning" role="img" aria-label="מדגם קטן" title="מדגם קטן: פחות מ־30 ביקורים" />}</span><ChevronLeft className="comparison-open" aria-hidden="true" />
        </Link></li>)}</ol>
        {!sites.length && <Empty text={search ? 'אין אתרים שתואמים לחיפוש' : 'אין אתרים מוגדרים למדידה'} />}
      </Panel>
      <TrafficChart data={data} previous={previous} comparisonError={comparisonError} />
      <details className="measurement-details"><summary>נתוני שרת ואבחון מדידה</summary>
        <StatRow><Stat label="כתובות רשת שונות" value={summary.unique_candidates} hint={CONNECTION_HINT} /><Stat label="פתיחות עמודים לפי השרת" value={summary.page_views} /><Stat label="בקשות אוטומטיות שסוננו" value={summary.bot_requests} /></StatRow>
        <Panel title="פילוח לפי נתוני השרת" action={<Tabs tabs={[{ id: 'pages', label: 'עמודים' }, { id: 'locations', label: 'מיקומים' }, { id: 'devices', label: 'מכשירים' }, { id: 'referrers', label: 'מקורות' }]} value={breakdown} onChange={setBreakdown} />}><RankedList items={data?.[breakdown]} empty="אין מדידות לפילוח בטווח הזה" /></Panel>
      </details>
    </DataState>
  </div>;
};
export default VisitorOverview;
