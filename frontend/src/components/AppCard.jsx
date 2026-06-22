import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowUpRight, Globe, Shield, RefreshCw } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

const AppCard = ({ app }) => {
  const navigate = useNavigate();
  const isOnline = app.status === 'online';

  const trendData = app.trend && app.trend.length > 0 
    ? app.trend.map((t, i) => ({ name: i, value: t.requests }))
    : [{value: 0}, {value: 10}, {value: 5}, {value: 20}]; // fallback

  const handleRestart = async (e) => {
    e.stopPropagation();
    if (!app.pm2_name) {
      alert('אפליקציה זו אינה מנוהלת ע״י PM2');
      return;
    }
    if (!window.confirm(`האם אתה בטוח שברצונך להפעיל מחדש את ${app.name}?`)) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${app.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'restart' })
      });
      if (res.ok) {
        alert('אותחל בהצלחה');
      } else {
        const err = await res.json();
        alert(`שגיאה: ${err.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('שגיאת תקשורת');
    }
  };

  return (
    <div 
      className="glass-card app-card" 
      style={{ padding: '1.5rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '300px' }}
      onClick={() => navigate(`/app/${app.id}`)}
    >
      <div className="app-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className={`status-dot ${isOnline ? 'online' : 'offline'}`}></span>
            <h3 style={{ fontSize: '1.4rem', fontWeight: '800' }}>{app.name}</h3>
          </div>
          {app.url && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{app.url}</p>}
        </div>
        
        {app.pm2_name && (
          <button 
            onClick={handleRestart}
            className="btn-icon" 
            style={{ padding: '8px', borderRadius: '50%' }}
            title="Restart App"
          >
            <RefreshCw size={18} />
          </button>
        )}
      </div>

      <div className="app-card-chart" style={{ flex: 1, minHeight: '100px', margin: '1rem 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData}>
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="var(--accent-primary)" 
              strokeWidth={3} 
              dot={false} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {app.pm2_name && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.5rem 0', padding: '0.5rem 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>מעבד:</span>
            <strong style={{ color: 'var(--text-primary)' }}>{(app.cpu || 0).toFixed(1)}%</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>זיכרון:</span>
            <strong style={{ color: 'var(--text-primary)' }}>{((app.memory || 0) / 1024 / 1024).toFixed(1)} MB</strong>
          </div>
        </div>
      )}

      <div className="app-card-metrics" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '1rem', marginTop: 'auto' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><Globe size={12}/> מבקרים</p>
          <p style={{ fontWeight: '800', fontSize: '1.2rem' }}>{app.metrics?.visitors || 0}</p>
        </div>
        <div style={{ width: '1px', background: '#f1f5f9' }}></div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><ArrowUpRight size={12}/> בקשות</p>
          <p style={{ fontWeight: '800', fontSize: '1.2rem' }}>{app.metrics?.requests || 0}</p>
        </div>
        <div style={{ width: '1px', background: '#f1f5f9' }}></div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--danger)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><Shield size={12}/> התקפות</p>
          <p style={{ fontWeight: '800', fontSize: '1.2rem', color: app.metrics?.attacks > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
            {app.metrics?.attacks || 0}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AppCard;
