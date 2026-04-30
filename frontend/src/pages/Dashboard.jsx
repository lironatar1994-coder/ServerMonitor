import React, { useState, useEffect } from 'react';
import { Plus, Server, Users, ShieldAlert, Cpu, BellRing } from 'lucide-react';
import AppCard from '../components/AppCard';
import AddAppModal from '../components/AddAppModal';
import StorageGauge from '../components/StorageGauge';
import SSLCard from '../components/SSLCard';

const Dashboard = () => {
  const [apps, setApps] = useState([]);
  const [stats, setStats] = useState({ ram: {}, cpu: {} });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    // In actual implementation, we would fetch from backend here.
    // For now, using mock or backend data if available.
    try {
      const token = localStorage.getItem('token');
      const appsRes = await fetch('http://localhost:4000/api/apps', { headers: { 'Authorization': `Bearer ${token}` } });
      if (appsRes.ok) setApps(await appsRes.json());

      const statsRes = await fetch('http://localhost:4000/api/apps/server-stats', { headers: { 'Authorization': `Bearer ${token}` } });
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalVisitors = apps.reduce((acc, app) => acc + (app.metrics?.visitors || 0), 0);
  const totalAttacks = apps.reduce((acc, app) => acc + (app.metrics?.attacks || 0), 0);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-1px', marginBottom: '0.2rem' }}>סקירת שרת</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>מצב כללי של המערכות שלך בזמן אמת</p>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={22} />
          הוסף אפליקציה
        </button>
      </div>

      {/* Bento Grid */}
      <div className="bento-grid">
        
        {/* Memory / CPU Card */}
        <div className="bento-card span-4 row-span-2" style={{ padding: '2rem' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={20} color="var(--accent-primary)" />
            משאבי ליבה
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>זיכרון (RAM)</span>
                <span style={{ fontWeight: 'bold' }}>{stats.ram?.percentage?.toFixed(1) || 0}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${stats.ram?.percentage || 0}%`, height: '100%', background: 'var(--accent-gradient)' }}></div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>עומס מעבד (Load)</span>
                <span style={{ fontWeight: 'bold' }}>{(stats.cpu?.load || 0).toFixed(2)}</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(((stats.cpu?.load || 0) / (stats.cpu?.cores || 1)) * 100, 100)}%`, height: '100%', background: 'var(--success-gradient)' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Disk Space Gauge */}
        <div className="bento-card span-4 row-span-2" style={{ padding: '2rem' }}>
          <StorageGauge used={42} total={100} />
        </div>

        {/* Quick Stats */}
        <div className="bento-card span-4" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '18px', borderRadius: '16px', color: 'var(--success)' }}>
            <Users size={32} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: '600' }}>מבקרים היום</p>
            <h3 style={{ fontSize: '2rem', fontWeight: '800', lineHeight: '1' }}>{totalVisitors}</h3>
          </div>
        </div>

        <div className="bento-card span-4" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '18px', borderRadius: '16px', color: 'var(--danger)' }}>
            <ShieldAlert size={32} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: '600' }}>התקפות נחסמו</p>
            <h3 style={{ fontSize: '2rem', fontWeight: '800', lineHeight: '1', color: 'var(--danger)' }}>{totalAttacks}</h3>
          </div>
        </div>

        {/* SSL Status Card */}
        <div className="bento-card span-4" style={{ padding: '1.5rem' }}>
          <SSLCard daysLeft={64} domain="vee-app.co.il" />
        </div>

        {/* Alerts Config Widget */}
        <div className="bento-card span-8" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--accent-gradient)', color: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '15px', borderRadius: '50%' }}>
              <BellRing size={28} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>התראות חכמות פעילות</h3>
              <p style={{ opacity: 0.9 }}>WhatsApp / Telegram מקושרים בהצלחה</p>
            </div>
          </div>
          <button style={{ background: 'white', color: 'var(--accent-primary)', border: 'none', padding: '10px 20px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
            הגדרות התראה
          </button>
        </div>

      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: '800' }}>מערכות ואפליקציות</h2>
      </div>
      
      <div className="bento-grid">
        {apps.map(app => (
          <div key={app.id} className="span-4">
            <AppCard app={app} />
          </div>
        ))}
        {apps.length === 0 && (
          <div className="bento-card span-12" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <Server size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>אין אפליקציות מנוטרות</h3>
            <p>הוסף אפליקציה חדשה כדי להתחיל לעקוב אחר הביצועים שלה.</p>
          </div>
        )}
      </div>

      {isModalOpen && <AddAppModal onClose={() => setIsModalOpen(false)} onAdded={fetchData} />}
    </div>
  );
};

export default Dashboard;
