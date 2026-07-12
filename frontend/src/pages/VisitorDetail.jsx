import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, MapPin, MonitorSmartphone, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link, useParams } from 'react-router-dom';
import { apiFetch, getRangePreset, rangeQuery } from '../lib/api';
import { DataState, MetricBlock, RangePicker, RankedList, SectionHeader } from '../components/AnalyticsParts';
import { formatDateTime, formatNumber } from '../lib/format';

const VisitorDetail = () => {
  const { id } = useParams();
  const [days, setDays] = useState(7);
  const [customRange, setCustomRange] = useState(null);
  const [data, setData] = useState(null);
  const [visitors, setVisitors] = useState({ visitors: [], total: 0, page: 1, limit: 25 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIp, setSelectedIp] = useState(null);
  const [timeline, setTimeline] = useState([]);

  const range = useMemo(() => customRange || getRangePreset(days), [customRange, days]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [analytics, visitorRows] = await Promise.all([
        apiFetch(`/visitor-analytics/apps/${id}?${rangeQuery(range)}`),
        apiFetch(`/visitor-analytics/apps/${id}/visitors?${rangeQuery(range)}&page=${page}&limit=25&search=${encodeURIComponent(search)}`)
      ]);
      setData(analytics);
      setVisitors(visitorRows);
      setError('');
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }, [id, page, range, search]);

  useEffect(() => {
    const timeout = window.setTimeout(fetchData, 200);
    return () => window.clearTimeout(timeout);
  }, [fetchData]);

  const handleOpenVisitor = async (ip) => {
    setSelectedIp(ip);
    setTimeline([]);
    try {
      const result = await apiFetch(`/visitor-analytics/apps/${id}/timeline?${rangeQuery(range)}&ip=${encodeURIComponent(ip)}`);
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
    label: new Intl.DateTimeFormat('he-IL', days === 1 ? { hour: '2-digit' } : { day: '2-digit', month: '2-digit' }).format(new Date(item.bucket))
  }));
  const pages = Math.max(1, Math.ceil((visitors.total || 0) / visitors.limit));
  const hourly = Array.from({ length: 24 }, (_, hour) => data?.hourly?.find((item) => Number(item.hour) === hour) || { hour, requests: 0 });
  const peakHour = Math.max(...hourly.map((item) => Number(item.requests) || 0), 1);

  return (
    <div className="page page--visitor-detail">
      <Link className="back-link" to="/visitors"><ArrowRight /> כל האתרים</Link>
      <header className="detail-hero">
        <div>
          <span className="edition-label">עומק / אתר אחד</span>
          <h1>{data?.app?.name || 'תנועת מבקרים'}</h1>
          <div className="site-meta">
            <span className={`status-tag ${data?.app?.status === 'online' ? 'is-online' : 'is-offline'}`}>{data?.app?.status === 'online' ? 'האתר פעיל' : 'דורש בדיקה'}</span>
            {data?.app?.url && <a href={data.app.url} target="_blank" rel="noreferrer">פתיחת האתר <ExternalLink /></a>}
          </div>
        </div>
        <RangePicker days={days} customActive={Boolean(customRange)} onCustom={(value) => { setCustomRange(value); setPage(1); }} onChange={(value) => { setDays(value); setCustomRange(null); setPage(1); }} loading={loading} onRefresh={fetchData} />
      </header>

      <DataState loading={loading && !data} error={error}>
        <section className="metrics-ledger metrics-ledger--detail">
          <MetricBlock label="מבקרים ייחודיים" value={summary.unique_humans} delta={data?.comparison?.unique_humans_percent} tone="forest" note="כתובות IP אנושיות" />
          <MetricBlock label="פעילים עכשיו" value={summary.active_humans} tone="vermilion" note="בחמש הדקות האחרונות" />
          <MetricBlock label="בקשות אנושיות" value={summary.human_requests} delta={data?.comparison?.human_requests_percent} note="בטווח הנבחר" />
          <MetricBlock label="בוטים שסוננו" value={summary.bot_requests} tone="ochre" note="לא נספרו כמבקרים" />
        </section>

        <section className="visitor-mix" aria-label="מבקרים חדשים וחוזרים">
          <div><span>חדשים בטווח</span><strong>{formatNumber(summary.new_humans)}</strong><small>נצפו לראשונה בתוך הטווח</small></div>
          <div><span>חוזרים</span><strong>{formatNumber(summary.returning_humans)}</strong><small>נראו גם לפני תחילת הטווח</small></div>
          <p>ההבחנה מבוססת על כתובת IP ונשענת על היסטוריה של עד 90 יום.</p>
        </section>

        <section className="detail-analysis-grid">
          <article className="story-panel detail-chart-panel">
            <SectionHeader eyebrow="ציר זמן" title="קצב ההתעניינות" />
            <div className="detail-chart">
              {chartData.length ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}><AreaChart data={chartData} margin={{ top: 10, right: 0, left: -26, bottom: 0 }}>
                <CartesianGrid stroke="#d7d0c4" vertical={false} strokeDasharray="2 6" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Area dataKey="human_requests" name="בקשות" stroke="#1f5a47" strokeWidth={3} fill="#1f5a4720" />
              </AreaChart></ResponsiveContainer> : <div className="quiet-empty">אין תנועה בטווח הזה</div>}
            </div>
          </article>
          <article className="story-panel"><SectionHeader eyebrow="עמודים" title="מה עניין אותם" /><RankedList items={data?.pages} /></article>
          <article className="story-panel"><SectionHeader eyebrow="גאוגרפיה" title="ערים ואזורים" note="הערכה לפי IP" /><RankedList items={data?.locations} color="ochre" empty="אין נתוני מיקום" /></article>
          <article className="story-panel"><SectionHeader eyebrow="מקור ומכשיר" title="איך הגיעו" /><RankedList items={data?.referrers} color="vermilion" empty="רוב הכניסות ישירות" /></article>
          <article className="story-panel"><SectionHeader eyebrow="מכשירים" title="על מה הם גלשו" /><RankedList items={data?.devices} color="forest" /></article>
          <article className="story-panel"><SectionHeader eyebrow="תגובות שרת" title="מה השרת החזיר" /><RankedList items={data?.statuses} color="ochre" /></article>
        </section>


        <section className="hourly-section">
          <SectionHeader eyebrow="שעות פעילות" title="הקצב לאורך היממה" note="לפי שעון ישראל" />
          <div className="hourly-strip" aria-label="התפלגות בקשות לפי שעה">
            {hourly.map((item) => <div key={item.hour} title={`${item.hour}:00 · ${item.requests} בקשות`}><i style={{ height: `${Math.max(4, (Number(item.requests) / peakHour) * 100)}%` }} /><span>{item.hour % 3 === 0 ? String(item.hour).padStart(2, '0') : ''}</span></div>)}
          </div>
        </section>

        <section className="visitor-directory">
          <SectionHeader eyebrow="ספר מבקרים" title="כל המבקרים בטווח" note="לחיצה על שורה פותחת ציר פעילות מלא" action={
            <label className="directory-search"><span className="sr-only">חיפוש מבקר</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="חיפוש IP, עמוד או עיר" /></label>
          } />
          <div className="visitor-table-wrap">
            <table className="visitor-table">
              <thead><tr><th>מבקר</th><th>מיקום ומכשיר</th><th>פעילות</th><th>נצפה לאחרונה</th><th>עמוד אחרון</th></tr></thead>
              <tbody>{visitors.visitors.map((visitor) => (
                <tr key={visitor.ip} onClick={() => handleOpenVisitor(visitor.ip)} tabIndex="0" onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && handleOpenVisitor(visitor.ip)}>
                  <td><b dir="ltr">{visitor.ip}</b><small>ראשון: {formatDateTime(visitor.first_seen)}</small></td>
                  <td><span><MapPin /> {visitor.city || visitor.region || 'לא ידוע'}</span><small><MonitorSmartphone /> {visitor.device_type || 'לא ידוע'}</small></td>
                  <td><strong>{formatNumber(visitor.requests)}</strong><small>בקשות</small></td>
                  <td>{formatDateTime(visitor.last_seen)}</td>
                  <td dir="ltr">{visitor.latest_path || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="visitor-mobile-list">
              {visitors.visitors.map((visitor) => (
                <button type="button" className="visitor-card" key={visitor.ip} onClick={() => handleOpenVisitor(visitor.ip)}>
                  <span><b dir="ltr">{visitor.ip}</b><strong>{formatNumber(visitor.requests)} בקשות</strong></span>
                  <small><MapPin /> {visitor.city || visitor.region || 'לא ידוע'} · {visitor.device_type || 'לא ידוע'}</small>
                  <small>אחרון: {formatDateTime(visitor.last_seen)}</small>
                  <em dir="ltr">{visitor.latest_path || '—'}</em>
                </button>
              ))}
            </div>
            {!visitors.visitors.length && <div className="quiet-empty">לא נמצאו מבקרים בטווח ובסינון הזה</div>}
          </div>
          <div className="pagination"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronRight /></button><span>עמוד {page} מתוך {pages} · {formatNumber(visitors.total)} מבקרים</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronLeft /></button></div>
        </section>
      </DataState>

      {selectedIp && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedIp(null)}>
          <aside className="visitor-drawer" role="dialog" aria-modal="true" aria-labelledby="visitor-drawer-title">
            <button type="button" className="drawer-close" onClick={() => setSelectedIp(null)} aria-label="סגירה"><X /></button>
            <span className="eyebrow">ציר פעילות</span><h2 id="visitor-drawer-title" dir="ltr">{selectedIp}</h2>
            <p>עד 250 בקשות אחרונות בטווח הנבחר. המיקום משוער בלבד.</p>
            <div className="timeline">
              {!timeline.length && <div className="skeleton-stack"><span /><span /></div>}
              {timeline.map((event, index) => event.error ? <div className="error-state" key="error">{event.error}</div> : (
                <article key={`${event.occurred_at}-${index}`}>
                  <i className={event.is_bot ? 'is-bot' : ''} /><time>{formatDateTime(event.occurred_at)}</time>
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
