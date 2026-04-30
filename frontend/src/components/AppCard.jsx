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

  const handleRestart = (e) => {
    e.stopPropagation(); // Prevent card click
    alert(`Mock: Restarting ${app.name}...`);
  };

  return (
    <div 
      className="bento-card" 
      style={{ padding: '1.5rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '300px' }}
      onClick={() => navigate(`/app/${app.id}`)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className={`status-dot ${isOnline ? 'online' : 'offline'}`}></span>
            <h3 style={{ fontSize: '1.4rem', fontWeight: '800' }}>{app.name}</h3>
          </div>
          {app.url && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{app.url}</p>}
        </div>
        
        {/* Hover Actions - In a real app we'd use CSS group-hover, here we'll just show the button */}
        <button 
          onClick={handleRestart}
          className="btn-icon" 
          style={{ padding: '8px', borderRadius: '50%' }}
          title="Restart App"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: '100px', margin: '1rem 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData}>
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="url(#colorUv)" 
              strokeWidth={4} 
              dot={false} 
            />
            <defs>
              <linearGradient id="colorUv" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--accent-primary)" />
                <stop offset="100%" stopColor="var(--accent-secondary)" />
              </linearGradient>
            </defs>
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.5)', padding: '1rem', borderRadius: '12px', marginTop: 'auto' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><Globe size={12}/> מבקרים</p>
          <p style={{ fontWeight: '800', fontSize: '1.2rem' }}>{app.metrics?.visitors || 0}</p>
        </div>
        <div style={{ width: '1px', background: 'rgba(0,0,0,0.05)' }}></div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><ArrowUpRight size={12}/> בקשות</p>
          <p style={{ fontWeight: '800', fontSize: '1.2rem' }}>{app.metrics?.requests || 0}</p>
        </div>
        <div style={{ width: '1px', background: 'rgba(0,0,0,0.05)' }}></div>
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
