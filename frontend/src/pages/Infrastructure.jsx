import { useCallback, useEffect, useState } from 'react';
import { Activity, Cpu, Database, HardDrive, MemoryStick, RefreshCw, Server, TimerReset } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { DataState, SectionHeader } from '../components/AnalyticsParts';
import { formatNumber } from '../lib/format';

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  return `${(value / 1024 ** 2).toFixed(0)} MB`;
};

const Infrastructure = () => {
  const [stats, setStats] = useState(null);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [serverStats, appData] = await Promise.all([apiFetch('/apps/server-stats'), apiFetch('/apps')]);
      setStats(serverStats);
      setApps(appData);
      setError('');
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(fetchData, 0);
    const interval = window.setInterval(fetchData, 15000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [fetchData]);

  const uptimeSeconds = Number(stats?.uptime) || 0;
  const uptime = `${Math.floor(uptimeSeconds / 86400)} ימים, ${Math.floor((uptimeSeconds % 86400) / 3600)} שעות`;
  const online = apps.filter((app) => app.status === 'online').length;

  return (
    <div className="page page--infrastructure">
      <header className="infra-hero">
        <div><span className="infra-kicker">Operations / live machine</span><h1>השרת.<br /><em>בלי רעש מסביב.</em></h1><p>משאבים, תהליכים ושירותים—מופרדים לחלוטין מתנועת המבקרים.</p></div>
        <button type="button" className="infra-refresh" onClick={fetchData}><RefreshCw /> רענון</button>
      </header>

      <DataState loading={loading} error={error}>
        <section className="instrument-grid">
          <article className="instrument instrument--major"><span><MemoryStick /> שימוש בזיכרון</span><strong>{(stats?.ram?.percentage || 0).toFixed(1)}<small>%</small></strong><div className="instrument-bar"><i style={{ width: `${Math.min(stats?.ram?.percentage || 0, 100)}%` }} /></div><p>{formatBytes(stats?.ram?.used)} מתוך {formatBytes(stats?.ram?.total)}</p></article>
          <article className="instrument"><span><Cpu /> עומס מעבד / דקה</span><strong>{(stats?.cpu?.load || 0).toFixed(2)}</strong><p>{formatNumber(stats?.cpu?.cores)} ליבות זמינות</p></article>
          <article className="instrument"><span><HardDrive /> שטח אחסון</span><strong>{(stats?.disk?.percentage || 0).toFixed(0)}<small>%</small></strong><p>{stats?.disk ? `${formatBytes(stats.disk.available)} פנויים` : 'נתוני דיסק לא זמינים'}</p></article>
          <article className="instrument"><span><TimerReset /> זמן פעילות</span><strong className="instrument-text">{uptime}</strong><p>מאז האתחול האחרון</p></article>
        </section>

        <section className="infra-layout">
          <article className="machine-panel">
            <SectionHeader eyebrow="תהליכים" title="מי צורך את המעבד" note="צילום מצב מהשרת, מתעדכן כל 15 שניות" />
            <div className="process-list">
              {(stats?.cpu?.snapshot?.topProcesses || []).map((process, index) => (
                <div className="process-row" key={`${process.pid}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><b dir="ltr">{process.command}</b><small>PID {process.pid} · RAM {process.mem.toFixed(1)}%</small></div><strong>{process.cpu.toFixed(1)}%</strong></div>
              ))}
              {!stats?.cpu?.snapshot?.topProcesses?.length && <div className="infra-empty">צילום התהליכים זמין בשרת Linux</div>}
            </div>
          </article>

          <article className="machine-panel machine-panel--services">
            <SectionHeader eyebrow="שירותים" title={`${online}/${apps.length} פעילים`} />
            <div className="infra-services">
              {apps.map((app) => <Link to={`/services/${app.id}`} key={app.id}><i className={app.status === 'online' ? 'online' : 'offline'} /><div><b>{app.name}</b><small>{app.pm2_name || 'אתר סטטי / ניטור לוג'}</small></div><span>{app.status === 'online' ? 'פעיל' : app.status === 'offline' ? 'לא פעיל' : 'לא ידוע'}</span></Link>)}
            </div>
          </article>
        </section>

        <section className="infra-note"><Activity /><div><b>הפרדה מלאה בין העולמות</b><p>המסך הזה מציג בריאות שרת ושירותים בלבד. נתוני אנשים, דפים ומקורות תנועה נמצאים באזור “מבקרים”.</p></div><Server /><Database /></section>
      </DataState>
    </div>
  );
};

export default Infrastructure;
