import { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Server, RefreshCw, Power, MemoryStick } from 'lucide-react';
import DefaultWebTemplate from '../components/app_templates/DefaultWebTemplate';
import WhatsAppTemplate from '../components/app_templates/WhatsAppTemplate';
import SshSecurityTemplate from '../components/app_templates/SshSecurityTemplate';

const AppDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [stats, setStats] = useState({ ram: {}, cpu: {} });

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setApp(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [id]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/serve-monitor/api/apps/server-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleAction = async (action) => {
    if (!window.confirm(`האם אתה בטוח שברצונך לבצע ${action} לאפליקציה?`)) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        alert('הפעולה בוצעה בהצלחה');
        fetchData();
      } else {
        const err = await res.json();
        alert(`שגיאה: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
      alert('שגיאת תקשורת עם השרת');
    }
  };

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      fetchData();
      fetchStats();
    }, 0);
    const appInterval = setInterval(fetchData, 5000);
    const statsInterval = setInterval(fetchStats, 15000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(appInterval);
      clearInterval(statsInterval);
    };
  }, [fetchData, fetchStats]);

  if (!app) return <div style={{ padding: '3rem', textAlign: 'center' }}>טוען נתונים...</div>;

  const renderTemplate = () => {
    if (app.pm2_name === 'vee-whatsapp-worker') {
      return <WhatsAppTemplate app={app} />;
    }
    if (app.name === 'SSH Security') {
      return <SshSecurityTemplate app={app} />;
    }
    return <DefaultWebTemplate app={app} />;
  };

  return (
    <div className={`animate-fade-in app-detail-page ${app.pm2_name ? 'pm2-app' : 'static-app'}`}>
      <button onClick={() => navigate('/')} className="btn-icon details-back-button" style={{ display: 'inline-flex', marginBottom: '2rem' }}>
        <ArrowRight size={20} style={{ marginLeft: '8px' }} />
        חזרה לדשבורד
      </button>

      <div className="details-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div className="details-title" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="details-title-icon" style={{ background: 'var(--accent-gradient)', padding: '20px', borderRadius: '20px', color: 'white', boxShadow: '0 8px 16px rgba(59, 130, 246, 0.3)' }}>
            <Server size={40} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <h1 style={{ fontSize: '2.8rem', fontWeight: '800', margin: 0 }}>{app.name}</h1>
              <span className={`status-dot ${app.status === 'online' ? 'online' : 'offline'}`} style={{ width: '16px', height: '16px' }}></span>
            </div>
            <p className="details-meta" style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginTop: '4px' }}>
              {app.pm2_name
                ? `${app.url || 'ללא URL'} | מנוהל ע״י PM2: ${app.pm2_name}`
                : (app.url || 'ללא URL')}
            </p>
          </div>
        </div>
        
        {app.pm2_name && (
          <div className="details-actions" style={{ display: 'flex', gap: '10px' }}>
            {app.status === 'online' ? (
              <button 
                onClick={() => handleAction('stop')}
                className="btn-icon" 
                style={{ background: '#fee2e2', color: 'var(--danger)', borderColor: 'transparent' }} 
                title="Stop App"
              >
                <Power size={20} />
              </button>
            ) : (
              <button 
                onClick={() => handleAction('start')}
                className="btn-icon" 
                style={{ background: '#d1fae5', color: 'var(--success)', borderColor: 'transparent' }} 
                title="Start App"
              >
                <Power size={20} />
              </button>
            )}
            <button 
              onClick={() => handleAction('restart')}
              className="btn-primary" 
              style={{ padding: '10px 20px' }}
            >
              <RefreshCw size={18} />
              הפעל מחדש (Restart)
            </button>
          </div>
        )}
      </div>

      <div className="stats-grid details-metrics" style={{ marginBottom: '2rem', gridTemplateColumns: app.pm2_name ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)' }}>
        {app.pm2_name && (
          <>
            <div className="glass-card" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '14px', borderRadius: '12px', color: 'rgb(99, 102, 241)' }}>
                <Server size={26} />
              </div>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>מעבד אפליקציה</p>
                <h3 style={{ fontSize: '1.35rem', marginTop: '0.25rem', fontWeight: '800' }}>
                  {(app.cpu || 0).toFixed(1)}%
                </h3>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '14px', borderRadius: '12px', color: 'var(--success)' }}>
                <MemoryStick size={26} />
              </div>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>זיכרון אפליקציה</p>
                <h3 style={{ fontSize: '1.35rem', marginTop: '0.25rem', fontWeight: '800' }}>
                  {((app.memory || 0) / 1024 / 1024).toFixed(1)} MB
                </h3>
              </div>
            </div>
          </>
        )}

        <div className="glass-card" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '14px', borderRadius: '12px', color: 'var(--accent-primary)' }}>
            <Server size={26} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>עומס שרת (מעבד)</p>
            <h3 style={{ fontSize: '1.35rem', marginTop: '0.25rem', fontWeight: '800' }}>
              {(stats.cpu?.load || 0).toFixed(2)}
            </h3>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '14px', borderRadius: '12px', color: 'var(--success)' }}>
            <MemoryStick size={26} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>זיכרון שרת כללי</p>
            <h3 style={{ fontSize: '1.35rem', marginTop: '0.25rem', fontWeight: '800' }}>
              {stats.ram?.percentage?.toFixed(1) || 0}%
            </h3>
          </div>
        </div>
      </div>

      {renderTemplate()}
    </div>
  );
};

export default AppDetails;
