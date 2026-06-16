import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Server, RefreshCw, Power } from 'lucide-react';
import DefaultWebTemplate from '../components/app_templates/DefaultWebTemplate';
import WhatsAppTemplate from '../components/app_templates/WhatsAppTemplate';
import SshSecurityTemplate from '../components/app_templates/SshSecurityTemplate';

const AppDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setApp(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

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
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [id]);

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
    <div className="animate-fade-in">
      <button onClick={() => navigate('/')} className="btn-icon" style={{ display: 'inline-flex', marginBottom: '2rem' }}>
        <ArrowRight size={20} style={{ marginLeft: '8px' }} />
        חזרה לדשבורד
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ background: 'var(--accent-gradient)', padding: '20px', borderRadius: '20px', color: 'white', boxShadow: '0 8px 16px rgba(59, 130, 246, 0.3)' }}>
            <Server size={40} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <h1 style={{ fontSize: '2.8rem', fontWeight: '800', margin: 0 }}>{app.name}</h1>
              <span className={`status-dot ${app.status === 'online' ? 'online' : 'offline'}`} style={{ width: '16px', height: '16px' }}></span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginTop: '4px' }}>
              {app.url || 'ללא URL'} | מנוהל ע״י PM2: {app.pm2_name || 'לא'} 
            </p>
          </div>
        </div>
        
        {app.pm2_name && (
          <div style={{ display: 'flex', gap: '10px' }}>
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
      {renderTemplate()}
    </div>
  );
};

export default AppDetails;
