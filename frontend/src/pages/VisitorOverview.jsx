import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CircleDot, Globe2, MousePointer2 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { apiFetch, getRangePreset, rangeQuery } from '../lib/api';
import { DataState, MetricBlock, RangePicker, RankedList, SectionHeader } from '../components/AnalyticsParts';
import { formatDateTime, formatNumber } from '../lib/format';

const VisitorOverview = () => {
  const [days, setDays] = useState(1);
  const [customRange, setCustomRange] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const range = customRange || getRangePreset(days);
      setData(await apiFetch(`/visitor-analytics/overview?${rangeQuery(range)}`));
      setError('');
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }, [customRange, days]);

  useEffect(() => {
    const initial = window.setTimeout(() => fetchAnalytics(), 0);
    const interval = window.setInterval(() => fetchAnalytics(true), 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [fetchAnalytics]);

  const chartData = useMemo(() => (data?.series || []).map((item) => ({
    ...item,
    label: new Intl.DateTimeFormat('he-IL', days === 1
      ? { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }
      : { day: '2-digit', month: '2-digit', timeZone: 'Asia/Jerusalem' }).format(new Date(item.bucket))
  })), [data, days]);

  const summary = data?.summary || {};
  const botShare = summary.total_requests ? (summary.bot_requests / summary.total_requests) * 100 : 0;

  return (
    <div className="page page--visitors">
      <header className="editorial-hero">
        <div>
          <span className="edition-label">תמונת מצב / כל האתרים</span>
          <h1>מי נמצא<br /><em>באתרים שלך?</em></h1>
          <p>מבט אחד שמפריד בין אנשים אמיתיים, תנועה אוטומטית והסיפור שמאחורי כל כניסה.</p>
        </div>
        <div className="hero-aside">
          <span className="live-now"><CircleDot /> מתעדכן כל 30 שניות</span>
          <RangePicker days={days} onChange={(value) => { setDays(value); setCustomRange(null); }} customActive={Boolean(customRange)} onCustom={setCustomRange} loading={loading} onRefresh={() => fetchAnalytics()} />
          <small>מבקר ייחודי = כתובת IP אנושית ייחודית בטווח הנבחר</small>
        </div>
      </header>

      <DataState loading={loading && !data} error={error}>
        <section className="metrics-ledger" aria-label="מדדי מבקרים מרכזיים">
          <MetricBlock label="מבקרים ייחודיים" value={summary.unique_humans} delta={data?.comparison?.unique_humans_percent} tone="forest" note="לעומת הטווח הקודם" />
          <MetricBlock label="פעילים עכשיו" value={summary.active_humans} tone="vermilion" note="בקשה בחמש הדקות האחרונות" />
          <MetricBlock label="בקשות אנושיות" value={summary.human_requests} delta={data?.comparison?.human_requests_percent} note="פעילות שנקלטה בשרת" />
          <MetricBlock label="תנועת בוטים" value={`${botShare.toFixed(0)}%`} tone="ochre" note={`${formatNumber(summary.bot_requests)} בקשות שסוננו`} />
        </section>

        <section className="overview-composition">
          <article className="story-panel story-panel--chart">
            <SectionHeader eyebrow="קצב התנועה" title="מתי הם הגיעו" note="אנשים ייחודיים ובקשות אנושיות לאורך הטווח" />
            <div className="main-chart" aria-label="גרף תנועת מבקרים">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <AreaChart data={chartData} margin={{ top: 12, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="visitorInk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1f5a47" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#1f5a47" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#cfc7b8" strokeDasharray="2 6" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#6f695f', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6f695f', fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#171713', border: 0, borderRadius: 0, color: '#f2ebdd' }} />
                    <Area type="monotone" dataKey="human_requests" name="בקשות" stroke="#1f5a47" strokeWidth={3} fill="url(#visitorInk)" />
                    <Area type="monotone" dataKey="unique_humans" name="ייחודיים" stroke="#d5543f" strokeWidth={2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="quiet-empty">הגרף יתמלא ברגע שתיקלט תנועה חדשה</div>}
            </div>
          </article>

          <article className="story-panel story-panel--sites">
            <SectionHeader eyebrow="השוואת אתרים" title="איפה קורה הכי הרבה" />
            <div className="site-ranking">
              {(data?.sites || []).map((site, index) => (
                <Link to={`/visitors/${site.app_id}`} className="site-rank" key={site.app_id}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><b>{site.name}</b><small>{formatNumber(site.human_requests)} בקשות אנושיות</small></div>
                  <strong>{formatNumber(site.unique_humans)}</strong>
                  <ArrowLeft aria-hidden="true" />
                </Link>
              ))}
              {!data?.sites?.length && <div className="quiet-empty">עדיין אין אתרים עם נתוני תנועה</div>}
            </div>
          </article>
        </section>

        <section className="insight-grid">
          <article className="story-panel"><SectionHeader eyebrow="התעניינות" title="העמודים שמושכים אנשים" /><RankedList items={data?.pages} /></article>
          <article className="story-panel"><SectionHeader eyebrow="ישראל" title="מאיפה מגיעים" note="מיקום משוער לפי כתובת IP" /><RankedList items={data?.locations} color="ochre" empty="מיקום יופיע לאחר חיבור מסד GeoIP" /></article>
          <article className="story-panel"><SectionHeader eyebrow="מכשירים" title="איך הם גולשים" /><RankedList items={data?.devices} color="vermilion" /></article>
        </section>

        <section className="live-feed-section">
          <SectionHeader eyebrow="זרם חי" title="הכניסות האנושיות האחרונות" note={`עודכן ${formatDateTime(data?.generated_at)}`} />
          <div className="live-feed">
            {(data?.recent || []).map((event, index) => (
              <Link to={`/visitors/${event.app_id}`} className="feed-row" key={`${event.ip}-${event.occurred_at}-${index}`}>
                <span className="feed-icon"><MousePointer2 /></span>
                <div className="feed-person"><b dir="ltr">{event.ip}</b><small>{event.device_type || 'לא ידוע'} · {event.city || event.region || 'מיקום לא ידוע'}</small></div>
                <div className="feed-path"><b>{event.app_name}</b><small dir="ltr">{event.path}</small></div>
                <time>{formatDateTime(event.occurred_at)}</time>
                <ArrowLeft aria-hidden="true" />
              </Link>
            ))}
            {!data?.recent?.length && <div className="quiet-empty"><Globe2 /> כניסות חדשות יופיעו כאן בזמן אמת</div>}
          </div>
        </section>
      </DataState>
    </div>
  );
};

export default VisitorOverview;
