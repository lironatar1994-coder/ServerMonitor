import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Activity, ShieldAlert, Globe, Server, Terminal, RefreshCw, Trash2, Power } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import LiveTerminal from '../components/LiveTerminal';

const AppDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:4000/api/apps/${id}`, {
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ background: 'var(--accent-gradient)', padding: '20px', borderRadius: '20px', color: 'white', boxShadow: '0 8px 16px rgba(79, 70, 229, 0.3)' }}>
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
        
        {/* Remote Control Panel */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderColor: 'transparent' }} title="Stop App">
            <Power size={20} />
          </button>
          <button className="btn-icon" title="Clear Logs">
            <Trash2 size={20} />
          </button>
          <button className="btn-primary" style={{ padding: '10px 20px' }}>
            <RefreshCw size={18} />
            הפעל מחדש (Restart)
          </button>
        </div>
      </div>

      <div className="bento-grid">
        {/* Main Chart */}
        <div className="bento-card span-8 row-span-2" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.4rem', fontWeight: 'bold' }}>היסטוריית תעבורה (24 דגימות)</h2>
          <div style={{ height: '350px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="timestamp" tickFormatter={(t) => t ? new Date(t).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : ''} stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="requests" stroke="var(--accent-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorReq)" name="בקשות" />
                <Area type="monotone" dataKey="visitors" stroke="var(--success)" strokeWidth={2} fill="transparent" name="מבקרים" />
                <Area type="monotone" dataKey="attacks" stroke="var(--danger)" strokeWidth={2} fill="transparent" name="התקפות" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stats Column */}
        <div className="bento-card span-4" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <Globe size={36} color="var(--accent-secondary)" style={{ marginBottom: '10px' }} />
          <h3 style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>מבקרים סה״כ</h3>
          <p style={{ fontSize: '3rem', fontWeight: '800' }}>{chartData[chartData.length - 1]?.visitors || 0}</p>
        </div>

        <div className="bento-card span-4" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <ShieldAlert size={36} color="var(--danger)" style={{ marginBottom: '10px' }} />
          <h3 style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>התקפות נחסמו</h3>
          <p style={{ fontSize: '3rem', fontWeight: '800', color: 'var(--danger)' }}>{chartData[chartData.length - 1]?.attacks || 0}</p>
        </div>

        {/* Live Terminal */}
        <div className="span-8 row-span-3" style={{ height: '500px' }}>
          <LiveTerminal />
        </div>

        {/* Visitor Geography Dummy */}
        <div className="bento-card span-4 row-span-3" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={20} color="var(--accent-primary)" />
            מקורות תנועה (גיאוגרפי)
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
            {/* Israel */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600' }}>ישראל 🇮🇱</span>
                <span style={{ fontWeight: 'bold' }}>78%</span>
              </div>
              <div style={{ width: '100%', height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '78%', height: '100%', background: 'var(--accent-gradient)' }}></div>
              </div>
            </div>
            {/* USA */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600' }}>ארצות הברית 🇺🇸</span>
                <span style={{ fontWeight: 'bold' }}>12%</span>
              </div>
              <div style={{ width: '100%', height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '12%', height: '100%', background: 'var(--success-gradient)' }}></div>
              </div>
            </div>
            {/* Europe */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600' }}>אירופה 🇪🇺</span>
                <span style={{ fontWeight: 'bold' }}>8%</span>
              </div>
              <div style={{ width: '100%', height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '8%', height: '100%', background: 'var(--warning-gradient)' }}></div>
              </div>
            </div>
            {/* Unknown */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600' }}>לא ידוע ❓</span>
                <span style={{ fontWeight: 'bold' }}>2%</span>
              </div>
              <div style={{ width: '100%', height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: '2%', height: '100%', background: 'var(--danger-gradient)' }}></div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AppDetails;
