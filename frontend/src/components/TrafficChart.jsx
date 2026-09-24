import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Panel, Tabs } from './AnalyticsParts';
import { comparisonSeries } from '../lib/dailyCheck';
import { formatDateTime, formatNumber } from '../lib/format';

const metrics = [{ id: 'browser_signal_visitors', label: 'מבקרים משוערים' }, { id: 'browser_signal_page_views', label: 'עמודים שנפתחו' }];
export default function TrafficChart({ data, previous, comparisonError }) {
  const [metric, setMetric] = useState(metrics[0].id);
  const rows = comparisonSeries(data?.series, previous?.series, data?.range, metric);
  return <Panel title="פעילות לאורך זמן" action={<Tabs tabs={metrics} value={metric} onChange={setMetric} label="מדד בגרף" />}>
    <div className="chart-legend"><span>קו מלא · התקופה שנבחרה</span><span>קו מקווקו · התקופה הקודמת</span></div>
    {comparisonError && <p className="status-line is-attention" role="status">ההשוואה לא נטענה · {comparisonError}</p>}
    <div className="chart" role="img" aria-label={`${metrics.find(m => m.id === metric).label}: התקופה שנבחרה לעומת התקופה הקודמת`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <LineChart data={rows} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#D9E1E4" vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={v => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', ...(rows.length > 2 && Date.parse(rows[1].bucket) - Date.parse(rows[0].bucket) === 3600000 ? { hour: '2-digit' } : { day: '2-digit', month: '2-digit' }) }).format(new Date(v))} minTickGap={35} axisLine={false} tickLine={false} tick={{ fill: '#53656D', fontSize: 12 }} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#53656D', fontSize: 12 }} />
          <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="chart-tooltip" dir="rtl">{payload.map(p => <p key={p.dataKey}>{p.dataKey === 'current' ? 'נבחרה' : 'קודמת'} · {formatDateTime(p.dataKey === 'current' ? p.payload.bucket : p.payload.previousBucket)}: <b>{formatNumber(p.value)}</b></p>)}</div> : null} />
          <Line isAnimationActive={false} dataKey="current" name="נבחרה" stroke="#006775" strokeWidth={2.5} dot={false} />
          <Line isAnimationActive={false} dataKey="previous" name="קודמת" stroke="#73858E" strokeWidth={2} strokeDasharray="5 5" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <p className="muted">ספירה לפי מקטע זמן; אין מדידה אינה הוכחה שאין מבקרים.</p>
  </Panel>;
}
