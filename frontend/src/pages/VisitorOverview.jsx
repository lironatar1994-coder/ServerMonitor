import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Globe2 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { apiFetch, rangeQuery } from '../lib/api';
import { useRange } from '../lib/useRange';
import { DataState, Empty, Panel, PageHead, RangePicker, RankedList, Stat, StatRow, Tabs } from '../components/AnalyticsParts';
import { formatAgo, formatNumber, formatTime } from '../lib/format';

const CANDIDATE_HINT = 'מועמד = כתובת IP שלא זוהתה כבוט. הערכה מהלוגים, לא אימות של אדם.';
const PAGE_VIEW_HINT = 'ניווטים מוצלחים בלבד — ללא תמונות, קוד, גופנים, API או בקשות שנכשלו.';
const BROWSER_SIGNAL_HINT = 'אות דפדפן = העמוד הפעיל קוד בדפדפן ושלח מזהה אקראי ואנונימי. זה חזק יותר מלוג IP, אך עדיין לא הוכחה לאדם או ללקוח.';

const BREAKDOWN_TABS = [
  { id: 'pages', label: 'עמודים' },
  { id: 'locations', label: 'מיקומים' },
  { id: 'devices', label: 'מכשירים' },
  { id: 'referrers', label: 'מקורות' }
];

const BREAKDOWN_META = {
  pages: { color: 'forest', empty: 'עדיין אין צפיות בעמודים' },
  locations: { color: 'ochre', empty: 'מיקום יופיע לאחר חיבור מסד GeoIP' },
  devices: { color: 'vermilion', empty: 'אין נתוני מכשיר' },
  referrers: { color: 'forest', empty: 'רוב הכניסות ישירות' }
};

const FEED_STEP = 8;

const VisitorOverview = () => {
  const { days, custom, setDays, setCustom, resolveRange } = useRange(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [breakdown, setBreakdown] = useState('pages');
  const [feedLimit, setFeedLimit] = useState(FEED_STEP);

  const fetchAnalytics = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setData(await apiFetch(`/visitor-analytics/overview?${rangeQuery(resolveRange())}`));
      setError('');
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }, [resolveRange]);

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
  const recent = data?.recent || [];
  const breakdownMeta = BREAKDOWN_META[breakdown];

  return (
    <div className="page page--visitors">
      <PageHead
        title="מבקרים"
        meta={<span className="pulse"><i aria-hidden="true" />חי · {formatTime(data?.generated_at)}</span>}
      >
        <RangePicker
          days={days}
          customActive={Boolean(custom)}
          onChange={setDays}
          onCustom={setCustom}
          loading={loading}
          onRefresh={() => fetchAnalytics()}
        />
      </PageHead>

      <DataState loading={loading && !data} error={error} onRetry={() => fetchAnalytics()}>
        <StatRow>
          <Stat label="אותות דפדפן" value={summary.browser_signal_visitors} delta={data?.comparison?.browser_signal_visitors_percent} tone="forest" hint={BROWSER_SIGNAL_HINT} />
          <Stat label="מועמדי IP" value={summary.unique_candidates} delta={data?.comparison?.unique_candidates_percent} hint={CANDIDATE_HINT} />
          <Stat label="כתובות פעילות" value={summary.active_candidates} tone="vermilion" foot="5 דקות אחרונות" />
          <Stat label="צפיות לוג משוערות" value={summary.page_views} delta={data?.comparison?.page_views_percent} hint={PAGE_VIEW_HINT} />
          <Stat label="תנועת בוטים" value={`${botShare.toFixed(0)}%`} tone="ochre" foot={`${formatNumber(summary.bot_requests)} סוננו`} />
        </StatRow>

        <div className="grid grid--2-1">
          <Panel title="תנועה לאורך זמן" action={
            <div className="legend">
              <span className="legend__item legend__item--forest">אותות דפדפן</span>
              <span className="legend__item legend__item--vermilion">מועמדי IP</span>
              <span className="legend__item legend__item--ochre">צפיות לוג</span>
            </div>
          }>
            <div className="chart chart--tall">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="visitorInk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1f5a47" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#1f5a47" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#d7d0c2" strokeDasharray="2 6" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={24} tick={{ fill: '#6f695f', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} width={40} tick={{ fill: '#6f695f', fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#171713', border: 0, borderRadius: 4, color: '#f2ebdd', fontSize: 12 }} />
                    <Area type="monotone" dataKey="browser_signal_visitors" name="אותות דפדפן" stroke="#1f5a47" strokeWidth={2.5} fill="url(#visitorInk)" />
                    <Area type="monotone" dataKey="unique_candidates" name="מועמדי IP" stroke="#d5543f" strokeWidth={2} fill="transparent" />
                    <Area type="monotone" dataKey="page_views" name="צפיות לוג משוערות" stroke="#9a6b16" strokeWidth={1.5} strokeDasharray="4 4" fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Empty text="אין תנועה בטווח שנבחר" />}
            </div>
          </Panel>

          <Panel title="אתרים" bleed>
            {data?.sites?.length ? (
              <ol className="site-ranking">
                {data.sites.map((site) => (
                  <li key={site.app_id}>
                    <Link to={`/visitors/${site.app_id}`}>
                      <span className="site-ranking__name">
                        <b>{site.name}</b>
                        <small>{formatNumber(site.browser_signal_visitors)} אותות דפדפן · {formatNumber(site.page_views)} צפיות לוג</small>
                      </span>
                      <span className="site-ranking__metric">
                        <strong>{formatNumber(site.unique_candidates)}</strong>
                        <small>מועמדי IP</small>
                      </span>
                      <ChevronLeft aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ol>
            ) : <Empty text="אין אתרים עם תנועה" />}
          </Panel>
        </div>

        <Panel title="פילוח" action={<Tabs tabs={BREAKDOWN_TABS} value={breakdown} onChange={setBreakdown} />}>
          <RankedList items={data?.[breakdown]} color={breakdownMeta.color} empty={breakdownMeta.empty} />
        </Panel>

        <Panel
          title="פעילות אחרונה"
          hint={CANDIDATE_HINT}
          action={recent.length > FEED_STEP && (
            <button type="button" className="text-action" onClick={() => setFeedLimit(feedLimit >= recent.length ? FEED_STEP : recent.length)}>
              {feedLimit >= recent.length ? 'הצג פחות' : `הצג הכול (${recent.length})`}
            </button>
          )}
          bleed
        >
          {recent.length ? (
            <ul className="feed">
              {recent.slice(0, feedLimit).map((event, index) => (
                <li key={`${event.ip}-${event.occurred_at}-${index}`}>
                  <Link to={`/visitors/${event.app_id}`}>
                    <span className="feed__who">
                      <b dir="ltr">{event.ip}</b>
                      <small>{[event.city || event.region, event.device_type].filter(Boolean).join(' · ') || 'מיקום לא ידוע'}</small>
                    </span>
                    <span className="feed__what">
                      <b>{event.app_name}</b>
                      <small dir="ltr">{event.path}</small>
                    </span>
                    <time dateTime={event.occurred_at}>{formatAgo(event.occurred_at)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty icon={Globe2} text="כניסות חדשות יופיעו כאן" />}
        </Panel>
      </DataState>
    </div>
  );
};

export default VisitorOverview;
