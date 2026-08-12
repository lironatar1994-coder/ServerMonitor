import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, MonitorSmartphone, Search, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link, useParams } from 'react-router-dom';
import { apiFetch, rangeQuery } from '../lib/api';
import { useRange } from '../lib/useRange';
import { DataState, Empty, Panel, PageHead, RangePicker, RankedList, Stat, StatRow, Tabs } from '../components/AnalyticsParts';
import JewelryInterest from '../components/JewelryInterest';
import ProductAnalytics from '../components/ProductAnalytics';
import { formatDateTime, formatNumber } from '../lib/format';

const CANDIDATE_HINT = 'מועמד = כתובת IP שלא זוהתה כבוט. הערכה מהלוגים, לא אימות של אדם.';
const PAGE_VIEW_HINT = 'ניווטים מוצלחים בלבד — ללא תמונות, קוד, גופנים, API או בקשות שנכשלו.';
const BROWSER_SIGNAL_HINT = 'אות דפדפן = העמוד הפעיל קוד בדפדפן ושלח מזהה אקראי ואנונימי. זה חזק יותר מלוג IP, אך עדיין לא הוכחה לאדם או ללקוח.';

const BREAKDOWN_TABS = [
  { id: 'pages', label: 'עמודים' },
  { id: 'locations', label: 'מיקומים' },
  { id: 'referrers', label: 'מקורות' },
  { id: 'devices', label: 'מכשירים' },
  { id: 'statuses', label: 'תגובות שרת' }
];

const BREAKDOWN_META = {
  pages: { color: 'forest', empty: 'אין צפיות בעמודים' },
  locations: { color: 'ochre', empty: 'אין נתוני מיקום' },
  referrers: { color: 'vermilion', empty: 'רוב הכניסות ישירות' },
  devices: { color: 'forest', empty: 'אין נתוני מכשיר' },
  statuses: { color: 'ochre', empty: 'אין נתוני תגובה' }
};

const VisitorDetail = () => {
  const { id } = useParams();
  const { days, custom, setDays, setCustom, resolveRange } = useRange(7);
  const [data, setData] = useState(null);
  const [visitors, setVisitors] = useState({ visitors: [], total: 0, page: 1, limit: 25 });
  const [engagement, setEngagement] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState('');
  const [breakdown, setBreakdown] = useState('pages');
  const [selectedIp, setSelectedIp] = useState(null);
  const [timeline, setTimeline] = useState([]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const query = rangeQuery(resolveRange());
      const [analytics, productEngagement] = await Promise.all([
        apiFetch(`/visitor-analytics/apps/${id}?${query}`),
        apiFetch(`/visitor-analytics/apps/${id}/engagement?${query}`).catch(() => null)
      ]);
      setData(analytics);
      setEngagement(productEngagement);
      setError('');
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }, [id, resolveRange]);

  const fetchVisitors = useCallback(async () => {
    setTableLoading(true);
    try {
      const query = `${rangeQuery(resolveRange())}&page=${page}&limit=25&search=${encodeURIComponent(search)}`;
      setVisitors(await apiFetch(`/visitor-analytics/apps/${id}/visitors?${query}`));
    } catch { /* table errors surface through the empty state */ }
    finally { setTableLoading(false); }
  }, [id, page, search, resolveRange]);

  useEffect(() => {
    const timeout = window.setTimeout(fetchAnalytics, 0);
    return () => window.clearTimeout(timeout);
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
  const chartData = (data?.series || []).map((item) => ({
    ...item,
    label: new Intl.DateTimeFormat('he-IL', days === 1
      ? { hour: '2-digit', timeZone: 'Asia/Jerusalem' }
      : { day: '2-digit', month: '2-digit', timeZone: 'Asia/Jerusalem' }).format(new Date(item.bucket))
  }));
  const pageCount = Math.max(1, Math.ceil((visitors.total || 0) / (visitors.limit || 25)));
  const hourly = Array.from({ length: 24 }, (_, hour) => data?.hourly?.find((item) => Number(item.hour) === hour) || { hour, page_views: 0 });
  const peakHour = Math.max(...hourly.map((item) => Number(item.page_views) || 0), 1);
  const breakdownMeta = BREAKDOWN_META[breakdown];

  return (
    <div className="page page--visitor-detail">
      <PageHead
        title={data?.app?.name || 'מבקרים'}
        meta={
          <>
            <Link className="crumb" to="/visitors"><ChevronRight aria-hidden="true" /> כל האתרים</Link>
            {data?.app && (
              <span className={`chip ${data.app.status === 'online' ? 'is-online' : 'is-offline'}`}>
                {data.app.status === 'online' ? 'פעיל' : 'דורש בדיקה'}
              </span>
            )}
            {data?.app?.url && (
              <a className="crumb" href={data.app.url} target="_blank" rel="noreferrer">פתיחת האתר <ExternalLink aria-hidden="true" /></a>
            )}
          </>
        }
      >
        <RangePicker
          days={days}
          customActive={Boolean(custom)}
          onChange={(value) => { setDays(value); setPage(1); }}
          onCustom={(value) => { setCustom(value); setPage(1); }}
          loading={loading}
          onRefresh={fetchAnalytics}
        />
      </PageHead>

      <DataState loading={loading && !data} error={error} onRetry={fetchAnalytics}>
        <StatRow>
          <Stat label="אותות דפדפן" value={summary.browser_signal_visitors} delta={data?.comparison?.browser_signal_visitors_percent} tone="forest" hint={BROWSER_SIGNAL_HINT} />
          <Stat label="סשנים עם אות" value={summary.browser_signal_sessions} foot="מזהים אנונימיים לסשן" />
          <Stat label="ניווטים עם אות" value={summary.browser_signal_page_views} delta={data?.comparison?.browser_signal_page_views_percent} hint={BROWSER_SIGNAL_HINT} />
          <Stat label="מועמדי IP" value={summary.unique_candidates} delta={data?.comparison?.unique_candidates_percent} hint={CANDIDATE_HINT} />
          <Stat label="צפיות לוג משוערות" value={summary.page_views} delta={data?.comparison?.page_views_percent} hint={PAGE_VIEW_HINT} />
          <Stat label="בוטים שסוננו" value={summary.bot_requests} tone="ochre" foot={`${formatNumber(summary.known_bot_requests)} ודאיים · ${formatNumber(summary.likely_bot_requests)} כנראה`} />
        </StatRow>

        <JewelryInterest interest={data?.jewelry_interest} siteUrl={data?.app?.url} />

        {(data?.app?.name === 'PDF Studio' || engagement?.engagement_samples || engagement?.product?.summary?.sessions) && (
          <ProductAnalytics engagement={engagement || {}} />
        )}

        <div className="grid grid--2-1">
          <Panel title="תנועה לאורך זמן">
            <div className="chart">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid stroke="#d7d0c4" vertical={false} strokeDasharray="2 6" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={24} tick={{ fill: '#6f695f', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} width={40} tick={{ fill: '#6f695f', fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#171713', border: 0, borderRadius: 4, color: '#f2ebdd', fontSize: 12 }} />
                    <Area type="monotone" dataKey="page_views" name="צפיות בעמודים" stroke="#1f5a47" strokeWidth={2.5} fill="#1f5a4720" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Empty text="אין תנועה בטווח שנבחר" />}
            </div>
          </Panel>

          <Panel title="שעות היממה" hint="שעון ישראל · צפיות בעמודים">
            <div className="hourly" aria-label="התפלגות צפיות לפי שעה">
              {hourly.map((item) => (
                <div key={item.hour} title={`${String(item.hour).padStart(2, '0')}:00 · ${formatNumber(item.page_views)} צפיות`}>
                  <i style={{ height: `${Math.max(3, (Number(item.page_views) / peakHour) * 100)}%` }} />
                  <span>{item.hour % 6 === 0 ? String(item.hour).padStart(2, '0') : ''}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="פילוח" action={<Tabs tabs={BREAKDOWN_TABS} value={breakdown} onChange={setBreakdown} />}>
          <RankedList items={data?.[breakdown]} color={breakdownMeta.color} empty={breakdownMeta.empty} />
        </Panel>

        <Panel
          title="מבקרים"
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

            {!visitors.visitors.length && <Empty text={search ? 'אין תוצאות לחיפוש הזה' : 'אין מועמדי IP בטווח הזה'} />}
          </div>

          {pageCount > 1 && (
            <div className="pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="עמוד קודם"><ChevronRight aria-hidden="true" /></button>
              <span>{page} / {pageCount} · {formatNumber(visitors.total)} מועמדי IP</span>
              <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label="עמוד הבא"><ChevronLeft aria-hidden="true" /></button>
            </div>
          )}
        </Panel>
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
