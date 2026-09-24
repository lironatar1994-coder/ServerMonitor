import { useState } from 'react';
import { Eye, Users } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Panel, Tabs } from './AnalyticsParts';
import { comparisonSeries } from '../lib/dailyCheck';
import { formatDateTime, formatNumber } from '../lib/format';

const metrics = [{ id: 'browser_signal_visitors', label: 'משוערים', icon: Users }, { id: 'browser_signal_page_views', label: 'צפיות', icon: Eye }];
export default function TrafficChart({ data, previous, comparisonError }) {
  const [metric, setMetric] = useState(metrics[0].id);
  const rows = comparisonSeries(data?.series, previous?.series, data?.range, metric);
  return <Panel title="פעילות" className="traffic-panel" hint="מבקרים משוערים או פתיחות עמודים שנמדדו, לפי מקטע זמן. חוסר מדידה אינו הוכחה שאין מבקרים." action={<Tabs tabs={metrics} value={metric} onChange={setMetric} label="מדד בגרף" />}>
    <div className="chart-legend"><span><i aria-hidden="true" />נבחרה</span><span><i aria-hidden="true" />קודמת</span></div>
    {comparisonError && <p className="status-line is-attention" role="status">ההשוואה לא נטענה · {comparisonError}</p>}
    <div className="chart" role="img" aria-label={`${metrics.find(m => m.id === metric).label}: התקופה שנבחרה לעומת התקופה הקודמת`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <LineChart data={rows} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={v => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', ...(rows.length > 2 && Date.parse(rows[1].bucket) - Date.parse(rows[0].bucket) === 3600000 ? { hour: '2-digit' } : { day: '2-digit', month: '2-digit' }) }).format(new Date(v))} minTickGap={35} axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-muted)', fontSize: 12 }} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-muted)', fontSize: 12 }} />
          <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="chart-tooltip" dir="rtl">{payload.map(p => <p key={p.dataKey}>{p.dataKey === 'current' ? 'נבחרה' : 'קודמת'} · {formatDateTime(p.dataKey === 'current' ? p.payload.bucket : p.payload.previousBucket)}: <b>{formatNumber(p.value)}</b></p>)}</div> : null} />
          <Line isAnimationActive={false} dataKey="current" name="נבחרה" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
          <Line isAnimationActive={false} dataKey="previous" name="קודמת" stroke="var(--ink-muted)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </Panel>;
}
