import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowUpRight, Globe, Shield } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

const AppCard = ({ app }) => {
  const navigate = useNavigate();
  const isOnline = app.status === 'online';

  const trendData = app.trend && app.trend.length > 0 
    ? app.trend.map((t, i) => ({ name: i, value: t.requests }))
    : [{value: 0}, {value: 10}, {value: 5}, {value: 20}]; // fallback

  return (
    <div 
      className="glass-card" 
      style={{ padding: '1.5rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%' }}
      onClick={() => navigate(`/app/${app.id}`)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className={`status-dot ${isOnline ? 'online' : 'offline'}`}></span>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{app.name}</h3>
          </div>
          {app.url && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{app.url}</p>}
        </div>
        <div style={{ padding: '8px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
          <Activity size={20} color={isOnline ? 'var(--success)' : 'var(--danger)'} />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: '80px', margin: '1rem 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData}>
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Line type="monotone" dataKey="value" stroke="var(--accent-primary)" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '1rem', marginTop: 'auto' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><Globe size={12}/> מבקרים</p>
          <p style={{ fontWeight: '600', fontSize: '1.1rem' }}>{app.metrics?.visitors || 0}</p>
        </div>
        <div style={{ width: '1px', background: '#f1f5f9' }}></div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><ArrowUpRight size={12}/> בקשות</p>
          <p style={{ fontWeight: '600', fontSize: '1.1rem' }}>{app.metrics?.requests || 0}</p>
        </div>
        <div style={{ width: '1px', background: '#f1f5f9' }}></div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--danger)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><Shield size={12}/> התקפות</p>
          <p style={{ fontWeight: '600', fontSize: '1.1rem', color: app.metrics?.attacks > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
            {app.metrics?.attacks || 0}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AppCard;
