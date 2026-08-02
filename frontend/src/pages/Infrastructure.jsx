import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { DataState, Empty, Panel, PageHead, Stat, StatRow, Tabs } from '../components/AnalyticsParts';
import { formatNumber, formatTime } from '../lib/format';

const RESOURCE_TABS = [
  { id: 'applications', label: 'RAM לפי שירות' },
  { id: 'storage', label: 'אחסון לפי פרויקט' },
  { id: 'processes', label: 'תהליכים' }
];

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  return `${(value / 1024).toFixed(0)} KB`;
};

const toneFor = (percentage) => {
  if (percentage >= 90) return 'vermilion';
  if (percentage >= 75) return 'ochre';
  return 'forest';
};

const ResourceRows = ({ items, kind }) => {
  if (!items.length) return <Empty text="הפירוט זמין בשרת Linux" />;
  const peak = Math.max(...items.map((item) => Number(kind === 'storage' ? item.bytes : item.memory_bytes || item.rss_bytes) || 0), 1);

  return (
    <ol className="resource-list">
      {items.map((item, index) => {
        const bytes = Number(kind === 'storage' ? item.bytes : item.memory_bytes || item.rss_bytes) || 0;
        const isProcess = kind === 'processes';
        const subtitle = kind === 'applications'
          ? `${formatNumber(item.process_count)} תהליכים · ${formatBytes(item.child_memory_bytes)} בתהליכי־משנה`
          : kind === 'storage'
            ? `${formatBytes(item.dependency_bytes)} תלויות · ${Number(item.dependency_percent || 0).toFixed(0)}% מהפרויקט`
            : `${item.owner || 'ללא שיוך'} · PID ${item.pid} · CPU ${Number(item.cpu || 0).toFixed(1)}%`;
        const label = isProcess ? item.command : item.name;

        return (
          <li key={`${item.id || item.pid || label}-${index}`} style={{ '--resource-bar': `${(bytes / peak) * 100}%` }}>
            <span className="resource-list__identity">
              <b dir={isProcess ? 'ltr' : undefined} title={label}>{label}</b>
              <small>{subtitle}</small>
            </span>
            <span className="resource-list__value">
              <strong>{formatBytes(bytes)}</strong>
              {kind === 'applications' && <small>{Number(item.memory_percent || 0).toFixed(1)}% RAM</small>}
              {kind === 'storage' && <small>{Number(item.disk_percent || 0).toFixed(1)}% מהדיסק</small>}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

const Infrastructure = () => {
  const [stats, setStats] = useState(null);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [resourceView, setResourceView] = useState('applications');

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
  const swapTotal = Number(stats?.ram?.swap?.total) || 0;
  const swapUsed = Number(stats?.ram?.swap?.used) || 0;
  const swap = swapTotal ? (swapUsed / swapTotal) * 100 : 0;
  const disk = Number(stats?.disk?.percentage) || 0;
  const cores = Number(stats?.cpu?.cores) || 0;
  const load = Number(stats?.cpu?.load) || 0;
  const loadPercent = cores ? Math.min((load / cores) * 100, 100) : 0;
  const offline = apps.filter((app) => app.status !== 'online');
  const resources = stats?.resources;
  const applications = resources?.applications || [];
  const storage = resources?.storage;
  const topProcesses = resources?.top_memory_processes || [];
  const storageItems = useMemo(() => [...(storage?.projects || []), ...(storage?.other || [])]
    .sort((a, b) => Number(b.bytes) - Number(a.bytes)), [storage]);
  const largestApp = applications[0];

  const selectedItems = resourceView === 'applications'
    ? applications
    : resourceView === 'storage'
      ? storageItems
      : topProcesses;

  return (
    <div className="page page--infrastructure">
      <PageHead
        title="שרת ומשאבים"
        meta={<span className="pulse"><i aria-hidden="true" />חי · {formatTime(updatedAt)}</span>}
      >
        <button type="button" className="btn" onClick={fetchData}>רענון</button>
      </PageHead>

      <DataState loading={loading && !stats} error={error} onRetry={fetchData}>
        <StatRow label="משאבי שרת">
          <Stat label="זיכרון" value={`${ram.toFixed(0)}%`} tone={toneFor(ram)} foot={`${formatBytes(stats?.ram?.available)} זמינים`} />
          <Stat label="Swap" value={`${swap.toFixed(0)}%`} tone={swap >= 75 ? 'ochre' : 'forest'} hint="Swap יכול להכיל דפים ישנים גם כשהשרת אינו תחת עומס פעיל" foot={`${formatBytes(swapUsed)} / ${formatBytes(swapTotal)}`} />
          <Stat label="מעבד" value={load.toFixed(2)} tone={toneFor(loadPercent)} foot={`עומס דקה · ${formatNumber(cores)} ליבות`} />
          <Stat label="אחסון" value={`${disk.toFixed(0)}%`} tone={toneFor(disk)} foot={stats?.disk ? `${formatBytes(stats.disk.available)} פנויים` : 'לא זמין'} />
          <Stat label="שירותים פעילים" value={`${apps.length - offline.length}/${apps.length}`} tone={offline.length ? 'vermilion' : 'forest'} foot={offline.length ? `${offline.length} דורשים בדיקה` : 'הכול תקין'} />
          <Stat label="זמן פעילות" value={`${uptimeDays}י ${uptimeHours}ש`} foot="מאז האתחול" />
        </StatRow>

        <Panel
          title="מי משתמש במשאבים"
          hint="RAM נספר לכל עץ התהליכים, כולל תהליכי־משנה ש-PM2 אינו מציג בשורת השירות. האחסון נסרק בנתיבים מוגדרים ונשמר במטמון לחמש דקות."
          action={<Tabs tabs={RESOURCE_TABS} value={resourceView} onChange={setResourceView} label="סוג פירוט משאבים" />}
          bleed
        >
          <div className="resource-summary" aria-label="עיקרי צריכת המשאבים">
            <span><small>הצרכן הגדול ב-RAM</small><strong>{largestApp?.name || 'לא זמין'}</strong><b>{formatBytes(largestApp?.memory_bytes)}</b></span>
            <span><small>תלויות בפרויקטים</small><strong>{formatBytes(storage?.totals?.dependency_bytes)}</strong><b>{storage?.projects?.length || 0} פרויקטים</b></span>
            <span><small>גיבויים ו-Rollback</small><strong>{formatBytes((Number(storage?.totals?.backup_bytes) || 0) + (Number(storage?.totals?.rollback_bytes) || 0))}</strong><b>קיבולת התאוששות</b></span>
          </div>
          <ResourceRows items={selectedItems} kind={resourceView} />
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
      </DataState>
    </div>
  );
};

export default Infrastructure;
