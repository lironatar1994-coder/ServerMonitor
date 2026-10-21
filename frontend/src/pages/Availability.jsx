import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { DataState, Empty, Panel, PageHead, Stat, StatRow } from '../components/AnalyticsParts';
import OpsTabs from '../components/OpsTabs';
import { apiFetch } from '../lib/api';
import { formatDateTime, formatNumber } from '../lib/format';

const percent = (value) => value == null ? '—' : `${value >= 99.995 ? '100' : value.toFixed(2)}%`;
const speed = (ms) => ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${formatNumber(ms)} ms`;
const speedTone = (ms) => ms == null ? '' : ms > 4000 ? 'is-danger' : ms > 2000 ? 'is-attention' : '';
const duration = (from, to) => {
  const minutes = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
  return minutes < 60 ? `${minutes} דק׳` : minutes < 1440 ? `${(minutes / 60).toFixed(1)} שע׳` : `${(minutes / 1440).toFixed(1)} ימים`;
};

export default function Availability() {
  const [apps, setApps] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setApps((await apiFetch('/apps/availability')).apps); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const rows = [...(apps || [])].sort((a, b) => Number(a.status === 'online') - Number(b.status === 'online')
    || (a.month ?? 101) - (b.month ?? 101) || a.name.localeCompare(b.name, 'he'));
  const measured = rows.filter((row) => row.month != null);
  const outages = rows.reduce((sum, row) => sum + row.outages.length, 0);
  const slowest = [...rows].filter((row) => row.response_avg_ms != null).sort((a, b) => b.response_avg_ms - a.response_avg_ms)[0];

  return (
    <div className="page page--infrastructure page--availability">
      <PageHead title="תפעול" meta={<span className="muted">זמינות ומהירות</span>}>
        <button type="button" className="icon-btn" onClick={load} aria-label="רענון" title="רענון"><RefreshCw className={loading ? 'is-spinning' : ''} aria-hidden="true" /></button>
      </PageHead>
      <OpsTabs />
      <DataState loading={loading && !apps} error={error} onRetry={load}>
        <StatRow label="זמינות ומהירות">
          <Stat label="זמינות ממוצעת, 30 יום" value={measured.length ? percent(measured.reduce((sum, row) => sum + row.month, 0) / measured.length) : '—'}
            hint="ממוצע של כל השירותים שיש להם היסטוריה. נמדד בבדיקה כל 10 דקות, החל מהפעלת המדידה." />
          <Stat label="תקלות שנרשמו, 30 יום" value={outages} />
          <Stat label="האיטי ביותר, 24 שעות" value={slowest ? speed(slowest.response_avg_ms) : '—'} foot={slowest?.name} hint="זמן ממוצע עד תחילת התשובה מהכתובת הציבורית." />
        </StatRow>
        <Panel title="לפי שירות" hint="אחוז הזמן שבו השירות ענה תקין מתוך הזמן שנמדד. מהירות היא הזמן עד תחילת התשובה; מעל 4 שניות פעמיים ברצף שולח התראה." bleed>
          {rows.length ? (
            <div className="availability-table" role="table" aria-label="זמינות ומהירות לפי שירות">
              <div className="availability-row availability-row--head" role="row">
                <span role="columnheader">שירות</span><span role="columnheader">7 ימים</span><span role="columnheader">30 יום</span>
                <span role="columnheader">תגובה</span><span role="columnheader">תקלה אחרונה</span><span aria-hidden="true" />
              </div>
              {rows.map((row) => {
                const last = row.outages[0];
                return (
                  <Link key={row.id} to={`/services/${row.id}`} className="availability-row" role="row">
                    <span role="cell" className="availability-name">
                      <i className={row.status === 'online' ? 'is-online' : 'is-offline'} aria-hidden="true" />
                      <b>{row.name}</b>
                      {row.status !== 'online' && <small>{`לא זמין${row.status_changed_at ? ` מאז ${formatDateTime(row.status_changed_at)}` : ''}`}</small>}
                    </span>
                    <span role="cell" data-label="7 ימים"><bdi dir="ltr">{percent(row.week)}</bdi></span>
                    <span role="cell" data-label="30 יום"><bdi dir="ltr">{percent(row.month)}</bdi></span>
                    <span role="cell" data-label="תגובה" className={speedTone(row.response_avg_ms)} title={row.response_max_ms != null ? `מקסימום 24 שעות: ${speed(row.response_max_ms)}` : undefined}>
                      <bdi dir="ltr">{speed(row.response_avg_ms ?? row.response_ms)}</bdi>
                    </span>
                    <span role="cell" data-label="תקלה אחרונה" className="availability-last">
                      {last ? `${formatDateTime(last.from)} · ${last.ongoing ? 'נמשכת' : duration(last.from, last.to)}` : 'אין'}
                    </span>
                    <ChevronLeft aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          ) : <Empty text="אין שירותים במדידה" />}
        </Panel>
      </DataState>
    </div>
  );
}
