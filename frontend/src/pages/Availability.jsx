import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { DataState, Empty, Panel, PageHead, Stat, StatRow } from '../components/AnalyticsParts';
import OpsTabs from '../components/OpsTabs';
import { apiFetch } from '../lib/api';
import { formatAgo, formatDateTime, formatNumber } from '../lib/format';

const percent = (value) => value == null ? '—' : `${value >= 99.995 ? '100' : value.toFixed(2)}%`;
const speed = (ms) => ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${formatNumber(ms)} ms`;
const speedTone = (ms) => ms == null ? '' : ms > 4000 ? 'is-danger' : ms > 2000 ? 'is-attention' : '';
const duration = (from, to) => {
  const minutes = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
  return minutes < 60 ? `${minutes} דק׳` : minutes < 1440 ? `${(minutes / 60).toFixed(1)} שע׳` : `${(minutes / 1440).toFixed(1)} ימים`;
};

// The outside view of one site: fresh results from the owner's PCs, worst first.
const outside = (rows = []) => {
  const fresh = rows.filter((row) => row.fresh);
  if (!rows.length) return { text: '—', tone: '', title: 'לא נבדק מבחוץ' };
  if (!fresh.length) return { text: 'לא עדכני', tone: '', title: `נבדק ${formatAgo(rows[0].checked_at)}` };
  const failing = fresh.find((row) => !row.ok);
  if (failing) return { text: 'לא נפתח', tone: 'is-danger', title: `${failing.source}: ${failing.error || 'נכשל'} · מאז ${formatDateTime(failing.failing_since)}` };
  const ms = Math.max(...fresh.map((row) => row.ms ?? 0));
  return { text: speed(ms || null), tone: speedTone(ms), title: `נפתח תקין מ־${fresh.map((row) => row.source).join(', ')}` };
};

export default function Availability() {
  const [apps, setApps] = useState(null);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await apiFetch('/apps/availability'); setApps(data.apps); setSources(data.external_sources || []); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  // Down first, then sites the server reaches but visitors can't, then the least available.
  const outsideFails = (row) => outside(row.external).tone === 'is-danger';
  const rows = [...(apps || [])].sort((a, b) => Number(a.status === 'online') - Number(b.status === 'online')
    || Number(outsideFails(b)) - Number(outsideFails(a))
    || (a.month ?? 101) - (b.month ?? 101) || a.name.localeCompare(b.name, 'he'));
  const measured = rows.filter((row) => row.month != null);
  const outages = rows.reduce((sum, row) => sum + row.outages.length, 0);
  const lastOutside = [...sources].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const outsideFailing = rows.filter(outsideFails).length;
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
          <Stat label="נבדק מבחוץ" value={lastOutside ? formatAgo(lastOutside.at) : 'לא נבדק'}
            tone={outsideFailing ? 'vermilion' : lastOutside?.inconclusive ? 'ochre' : 'ink'}
            foot={lastOutside ? <><bdi dir="ltr">{lastOutside.source}</bdi>{lastOutside.inconclusive ? ': רוב האתרים נכשלו, כנראה בעיית חיבור אצל הבודק' : outsideFailing ? ` · ${outsideFailing} לא נפתחים` : ''}</> : undefined}
            hint="סוכן המחשב פותח כל כתובת ציבורית מחיבור האינטרנט שלו כל 10 דקות, כמו גולש. כך נתפסות תקלות DNS, רשת ותעודה שבדיקה מתוך השרת לא רואה. כשהמחשב כבוי אין מדידה." />
        </StatRow>
        <Panel title="לפי שירות" hint="אחוז הזמן שבו השירות ענה תקין מתוך הזמן שנמדד. מהירות היא הזמן עד תחילת התשובה; מעל 4 שניות פעמיים ברצף שולח התראה. מבחוץ: זמן התשובה כשהכתובת נפתחת מהמחשב; כשלון פעמיים ברצף בזמן שהשרת עונה שולח התראה." bleed>
          {rows.length ? (
            <div className="availability-table" role="table" aria-label="זמינות ומהירות לפי שירות">
              <div className="availability-row availability-row--head" role="row">
                <span role="columnheader">שירות</span><span role="columnheader">7 ימים</span><span role="columnheader">30 יום</span>
                <span role="columnheader">תגובה</span><span role="columnheader">מבחוץ</span><span role="columnheader">תקלה אחרונה</span><span aria-hidden="true" />
              </div>
              {rows.map((row) => {
                const last = row.outages[0];
                const view = outside(row.external);
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
                    <span role="cell" data-label="מבחוץ" className={view.tone} title={view.title}><bdi dir="ltr">{view.text}</bdi></span>
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
