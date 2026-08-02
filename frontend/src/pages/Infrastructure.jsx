import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { DataState, Empty, Panel, PageHead, Stat, StatRow } from '../components/AnalyticsParts';
import { formatNumber, formatTime } from '../lib/format';

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  return `${(value / 1024 ** 2).toFixed(0)} MB`;
};

const toneFor = (percentage) => {
  if (percentage >= 90) return 'vermilion';
  if (percentage >= 75) return 'ochre';
  return 'forest';
};

const Infrastructure = () => {
  const [stats, setStats] = useState(null);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [serverStats, appData] = await Promise.all([apiFetch('/apps/server-stats'), apiFetch('/apps')]);
      setStats(serverStats);
      setApps(appData);
      setUpdatedAt(new Date().toISOString());
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
  const uptimeDays = Math.floor(uptimeSeconds / 86400);
  const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
  const ram = Number(stats?.ram?.percentage) || 0;
  const disk = Number(stats?.disk?.percentage) || 0;
  const cores = Number(stats?.cpu?.cores) || 0;
  const load = Number(stats?.cpu?.load) || 0;
  const loadPercent = cores ? Math.min((load / cores) * 100, 100) : 0;
  const offline = apps.filter((app) => app.status !== 'online');
  const processes = stats?.cpu?.snapshot?.topProcesses || [];

  return (
    <div className="page page--infrastructure">
      <PageHead
        title="שרת"
        meta={<span className="pulse"><i aria-hidden="true" />חי · {formatTime(updatedAt)}</span>}
      >
        <button type="button" className="btn" onClick={fetchData}>רענון</button>
      </PageHead>

      <DataState loading={loading && !stats} error={error} onRetry={fetchData}>
        <StatRow label="משאבי שרת">
          <Stat label="זיכרון" value={`${ram.toFixed(0)}%`} tone={toneFor(ram)} foot={`${formatBytes(stats?.ram?.used)} / ${formatBytes(stats?.ram?.total)}`} />
          <Stat label="מעבד" value={load.toFixed(2)} tone={toneFor(loadPercent)} foot={`עומס דקה · ${formatNumber(cores)} ליבות`} />
          <Stat label="אחסון" value={`${disk.toFixed(0)}%`} tone={toneFor(disk)} foot={stats?.disk ? `${formatBytes(stats.disk.available)} פנויים` : 'לא זמין'} />
          <Stat label="שירותים פעילים" value={`${apps.length - offline.length}/${apps.length}`} tone={offline.length ? 'vermilion' : 'forest'} foot={offline.length ? `${offline.length} דורשים בדיקה` : 'הכול תקין'} />
          <Stat label="זמן פעילות" value={`${uptimeDays}י ${uptimeHours}ש`} foot="מאז האתחול" />
        </StatRow>

        <div className="grid grid--1-1">
          <Panel title="צריכת מעבד לפי תהליך" hint="צילום מצב מהשרת, מתעדכן כל 15 שניות" bleed>
            {processes.length ? (
              <ol className="process-list">
                {processes.map((process, index) => (
                  <li key={`${process.pid}-${index}`}>
                    <span className="process-list__name">
                      <b dir="ltr">{process.command}</b>
                      <small>PID {process.pid} · RAM {process.mem.toFixed(1)}%</small>
                    </span>
                    <strong>{process.cpu.toFixed(1)}%</strong>
                  </li>
                ))}
              </ol>
            ) : <Empty text="צילום התהליכים זמין בשרת Linux" />}
          </Panel>

          <Panel title="שירותים" bleed>
            {apps.length ? (
              <ul className="service-status-list">
                {apps.map((app) => (
                  <li key={app.id}>
                    <Link to={`/services/${app.id}`}>
                      <i className={app.status === 'online' ? 'is-online' : 'is-offline'} aria-hidden="true" />
                      <span className="service-status-list__name">
                        <b>{app.name}</b>
                        <small dir="ltr">{app.pm2_name || 'static / log'}</small>
                      </span>
                      <span className={`chip ${app.status === 'online' ? 'is-online' : 'is-offline'}`}>
                        {app.status === 'online' ? 'פעיל' : app.status === 'offline' ? 'לא פעיל' : 'לא ידוע'}
                      </span>
                      <ChevronLeft aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty text="אין שירותים מוגדרים" />}
          </Panel>
        </div>
      </DataState>
    </div>
  );
};

export default Infrastructure;
