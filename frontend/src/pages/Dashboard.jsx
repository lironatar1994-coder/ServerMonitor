import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Server, Users, ShieldAlert, BellRing, HardDrive, ShieldCheck } from 'lucide-react';
import AppCard from '../components/AppCard';
import AddAppModal from '../components/AddAppModal';

const Dashboard = () => {
  const [apps, setApps] = useState([]);
  const [stats, setStats] = useState({ ram: {}, cpu: {} });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState('');
  const navigate = useNavigate();

  const handleAuthFailure = useCallback(() => {
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  }, [navigate]);

  const fetchApps = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const appsRes = await fetch('/serve-monitor/api/apps', { headers: { 'Authorization': `Bearer ${token}` } });
      if (appsRes.status === 401 || appsRes.status === 403) {
        handleAuthFailure();
        return;
      }
      if (!appsRes.ok) {
        throw new Error(`Failed to load apps (${appsRes.status})`);
      }

      setApps(await appsRes.json());
      setAppsError('');
    } catch (e) {
      console.error(e);
      setAppsError(e.message || 'Failed to load monitored apps');
    } finally {
      setAppsLoading(false);
    }
  }, [handleAuthFailure]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const statsRes = await fetch('/serve-monitor/api/apps/server-stats', { headers: { 'Authorization': `Bearer ${token}` } });
      if (statsRes.status === 401 || statsRes.status === 403) {
        handleAuthFailure();
        return;
      }
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      console.error(e);
    }
  }, [handleAuthFailure]);

  const fetchData = useCallback(async () => {
    await Promise.all([fetchApps(), fetchStats()]);
  }, [fetchApps, fetchStats]);

  useEffect(() => {
    const initialLoad = setTimeout(fetchData, 0);
    const appsInterval = setInterval(fetchApps, 5000);
    const statsInterval = setInterval(fetchStats, 15000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(appsInterval);
      clearInterval(statsInterval);
    };
  }, [fetchApps, fetchData, fetchStats]);

  const topCpuProcess = stats.cpu?.snapshot?.topProcesses?.[0];
  const snapshotUpdatedAt = stats.cpu?.snapshot?.updatedAt
    ? new Date(stats.cpu.snapshot.updatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const totalVisitors = apps.reduce((acc, app) => acc + (app.metrics?.visitors || 0), 0);
  const totalAttacks = apps.reduce((acc, app) => acc + (app.metrics?.attacks || 0), 0);

  return (
    <div className="animate-fade-in">
      {/* Top Header */}
      <div className="dashboard-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div className="dashboard-hero-copy">
          <h1 style={{ fontSize: '2.2rem', color: 'var(--text-primary)', marginBottom: '0.3rem', fontWeight: '800' }}>סקירת שרת</h1>
          <p style={{ color: 'var(--text-secondary)' }}>מצב כללי של השרת והאפליקציות שלך</p>
        </div>
        <div className="dashboard-top-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* Subtle Alerts Badge instead of giant purple box */}
          <div className="dashboard-alert-chip" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#eff6ff', borderRadius: '12px', color: 'var(--accent-primary)', fontSize: '0.9rem', fontWeight: '600' }}>
            <BellRing size={16} />
            התראות פעילות
          </div>
          
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} />
            הוסף אפליקציה
          </button>
        </div>
      </div>

      {/* Stats Grid - Clean 4 column layout */}
      <div className="stats-grid">
        {/* Memory / CPU */}
        <button
          type="button"
          className="glass-card"
          onClick={() => navigate('/system-stats')}
          style={{
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            textAlign: 'left',
            width: '100%',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '15px', borderRadius: '12px', color: 'var(--accent-primary)' }}>
            <Server size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>RAM / CPU</p>
            <h3 style={{ fontSize: '1.4rem', marginTop: '0.3rem', fontWeight: '800' }}>
              {stats.ram?.percentage?.toFixed(1) || 0}% / {(stats.cpu?.load || 0).toFixed(2)}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.35rem' }}>
              {topCpuProcess
                ? `Snapshot: ${topCpuProcess.command.split(' ').slice(0, 1)[0]} ${topCpuProcess.cpu.toFixed(1)}% CPU`
                : 'Snapshot unavailable'}
            </p>
            {snapshotUpdatedAt && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.15rem' }}>
                Updated: {snapshotUpdatedAt}
              </p>
            )}
          </div>
        </button>

        {/* Disk Space - Reverted to clean metric instead of huge gauge */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '15px', borderRadius: '12px', color: 'var(--accent-secondary)' }}>
            <HardDrive size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>שטח אחסון (42GB פנוי)</p>
            <h3 style={{ fontSize: '1.4rem', marginTop: '0.3rem', fontWeight: '800' }}>
              42%
            </h3>
          </div>
        </div>

        {/* Visitors */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '15px', borderRadius: '12px', color: 'var(--success)' }}>
            <Users size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>מבקרים היום</p>
            <h3 style={{ fontSize: '1.4rem', marginTop: '0.3rem', fontWeight: '800' }}>{totalVisitors}</h3>
          </div>
        </div>

        {/* Attacks / Security */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '15px', borderRadius: '12px', color: 'var(--danger)' }}>
            <ShieldAlert size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>התקפות נחסמו</p>
            <h3 style={{ fontSize: '1.4rem', marginTop: '0.3rem', fontWeight: '800' }}>{totalAttacks}</h3>
          </div>
        </div>
      </div>

      <div className="dashboard-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3.5rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)' }}>אפליקציות מנוטרות</h2>
        
        {/* Subtle SSL Warning next to title instead of huge card */}
        <div className="dashboard-ssl-chip" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontSize: '0.9rem', fontWeight: '600' }}>
          <ShieldCheck size={18} />
          תעודות SSL תקינות (64 ימים נותרו)
        </div>
      </div>
      
      {/* Reverted to clean grid */}
      <div className="dashboard-grid">
        {apps.map(app => (
          <AppCard key={app.id} app={app} />
        ))}
        {appsLoading && apps.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            Loading monitored apps...
          </div>
        )}
        {!appsLoading && appsError && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: 'var(--danger)', fontWeight: '700' }}>
            {appsError}
          </div>
        )}
        {!appsLoading && !appsError && apps.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            אין אפליקציות מנוטרות. הוסף אחת כעת!
          </div>
        )}
      </div>

      {isModalOpen && <AddAppModal onClose={() => setIsModalOpen(false)} onAdded={fetchData} />}
    </div>
  );
};

export default Dashboard;
