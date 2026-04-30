import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Activity, ShieldAlert, Globe, Server } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const AppDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/apps/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setApp(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [id]);

  if (!app) return <div style={{ padding: '3rem', textAlign: 'center' }}>טוען נתונים...</div>;

  const chartData = app.history && app.history.length > 0 ? app.history : [{visitors:0, requests:0, attacks:0}];

  return (
    <div className="animate-fade-in">
      <button onClick={() => navigate('/')} className="btn-icon" style={{ display: 'inline-flex', marginBottom: '2rem' }}>
        <ArrowRight size={20} style={{ marginLeft: '8px' }} />
        חזרה לדשבורד
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '2rem' }}>
        <div style={{ background: 'var(--accent-primary)', padding: '15px', borderRadius: '15px', color: 'white' }}>
          <Server size={30} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '2.5rem', margin: 0 }}>{app.name}</h1>
            <span className={`status-dot ${app.status === 'online' ? 'online' : 'offline'}`} style={{ width: '15px', height: '15px' }}></span>
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>{app.url || 'ללא URL'} | PM2: {app.pm2_name || 'לא מוגדר'} | עודכן לאחרונה: {new Date(app.last_checked).toLocaleTimeString('he-IL')}</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Globe size={30} color="var(--accent-secondary)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>מבקרים סה״כ</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{chartData[chartData.length - 1]?.visitors || 0}</p>
        </div>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Activity size={30} color="var(--success)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>בקשות / תעבורה</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{chartData[chartData.length - 1]?.requests || 0}</p>
        </div>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <ShieldAlert size={30} color="var(--danger)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>התקפות נחסמו</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--danger)' }}>{chartData[chartData.length - 1]?.attacks || 0}</p>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '2rem', marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem' }}>היסטוריית תעבורה (24 דגימות אחרונות)</h2>
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="timestamp" tickFormatter={(t) => t ? new Date(t).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : ''} />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="requests" stroke="var(--accent-primary)" fillOpacity={1} fill="url(#colorReq)" name="בקשות" />
              <Area type="monotone" dataKey="visitors" stroke="var(--success)" fill="transparent" name="מבקרים" />
              <Area type="monotone" dataKey="attacks" stroke="var(--danger)" fill="transparent" name="התקפות" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default AppDetails;
