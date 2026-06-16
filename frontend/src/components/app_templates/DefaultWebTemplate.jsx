import React, { useState, useEffect } from 'react';
import { Globe, Activity, ShieldAlert } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import LiveTerminal from '../LiveTerminal';

const DefaultWebTemplate = ({ app }) => {
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchVisitors = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${app.id}/visitors`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVisitors(data.visitors || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchVisitors();
    const interval = setInterval(fetchVisitors, 5000);
    return () => clearInterval(interval);
  }, [app.id]);

  const chartData = app.history && app.history.length > 0 ? app.history : [{visitors:0, requests:0, attacks:0}];
  const currentMetrics = chartData[chartData.length - 1] || { visitors: 0, requests: 0, attacks: 0 };

  return (
    <div className="animate-fade-in">
      {/* Stats Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Globe size={30} color="var(--accent-secondary)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>מבקרים סה״כ</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{currentMetrics.visitors || 0}</p>
        </div>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Activity size={30} color="var(--success)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>בקשות / תעבורה</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{currentMetrics.requests || 0}</p>
        </div>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <ShieldAlert size={30} color="var(--danger)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>התקפות נחסמו</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--danger)' }}>{currentMetrics.attacks || 0}</p>
        </div>
      </div>

      {/* Chart and traffic sources */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginTop: '2rem' }}>
        <div className="glass-card" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold' }}>היסטוריית תעבורה (24 דגימות אחרונות)</h2>
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
                <Area type="monotone" dataKey="requests" stroke="var(--accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorReq)" name="בקשות" />
                <Area type="monotone" dataKey="visitors" stroke="var(--success)" strokeWidth={2} fill="transparent" name="מבקרים" />
                <Area type="monotone" dataKey="attacks" stroke="var(--danger)" strokeWidth={2} fill="transparent" name="התקפות" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={20} color="var(--accent-primary)" />
            מקורות תנועה
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600' }}>ישראל 🇮🇱</span>
                <span style={{ fontWeight: 'bold' }}>78%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '78%', height: '100%', background: 'var(--accent-gradient)' }}></div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600' }}>ארצות הברית 🇺🇸</span>
                <span style={{ fontWeight: 'bold' }}>12%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '12%', height: '100%', background: 'var(--success)' }}></div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600' }}>אירופה 🇪🇺</span>
                <span style={{ fontWeight: 'bold' }}>8%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '8%', height: '100%', background: 'var(--warning)' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Access Logs List */}
      <div className="glass-card" style={{ padding: '2rem', marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold' }}>כניסות אחרונות (100 כניסות אחרונות בזמן אמת)</h2>
        <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', direction: 'rtl' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '12px 8px' }}>זמן</th>
                <th style={{ padding: '12px 8px' }}>כתובת IP</th>
                <th style={{ padding: '12px 8px' }}>מתודה</th>
                <th style={{ padding: '12px 8px' }}>נתיב</th>
                <th style={{ padding: '12px 8px' }}>סוג</th>
                <th style={{ padding: '12px 8px' }}>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {loading && visitors.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>טוען נתונים...</td>
                </tr>
              ) : visitors.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>אין כניסות זמינות להצגה כעת</td>
                </tr>
              ) : (
                visitors.map((v, i) => {
                  const formatTime = (ts) => {
                    if (!ts) return '';
                    const parts = ts.split(':');
                    if (parts.length >= 4) {
                      return parts[1] + ':' + parts[2] + ':' + parts[3].split(' ')[0];
                    }
                    return ts;
                  };
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: '0.9rem' }}>{formatTime(v.timestamp)}</td>
                      <td style={{ padding: '10px 8px', fontWeight: '600' }}>{v.ip}</td>
                      <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', fontSize: '0.8rem', fontWeight: 'bold' }}>{v.method}</span></td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{v.path}</td>
                      <td style={{ padding: '10px 8px' }}>{v.agent === 'Mobile' ? '📱 נייד' : v.agent === 'Desktop' ? '💻 מחשב' : v.agent === 'Bot' ? '🤖 בוט' : '❓ לא ידוע'}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ 
                          padding: '3px 8px', 
                          borderRadius: '6px', 
                          fontSize: '0.8rem', 
                          fontWeight: 'bold',
                          background: v.status >= 200 && v.status < 300 ? '#d1fae5' : v.status >= 300 && v.status < 400 ? '#eff6ff' : v.status >= 400 && v.status < 500 ? '#fef3c7' : '#fee2e2',
                          color: v.status >= 200 && v.status < 300 ? '#065f46' : v.status >= 300 && v.status < 400 ? '#1e40af' : v.status >= 400 && v.status < 500 ? '#92400e' : '#991b1b'
                        }}>
                          {v.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Terminal logs */}
      <div style={{ marginTop: '2rem', height: '400px' }}>
        <LiveTerminal appId={app.id} />
      </div>
    </div>
  );
};

export default DefaultWebTemplate;
