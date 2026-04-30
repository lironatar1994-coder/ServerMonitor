import React, { useState, useEffect } from 'react';
import { Plus, Server, Users, ShieldAlert, Cpu, BellRing, HardDrive, ShieldCheck } from 'lucide-react';
import AppCard from '../components/AppCard';
import AddAppModal from '../components/AddAppModal';

const Dashboard = () => {
  const [apps, setApps] = useState([]);
  const [stats, setStats] = useState({ ram: {}, cpu: {} });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
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
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', color: 'var(--text-primary)', marginBottom: '0.3rem', fontWeight: '800' }}>סקירת שרת</h1>
          <p style={{ color: 'var(--text-secondary)' }}>מצב כללי של השרת והאפליקציות שלך</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* Subtle Alerts Badge instead of giant purple box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#eff6ff', borderRadius: '12px', color: 'var(--accent-primary)', fontSize: '0.9rem', fontWeight: '600' }}>
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
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '15px', borderRadius: '12px', color: 'var(--accent-primary)' }}>
            <Server size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>RAM / CPU</p>
            <h3 style={{ fontSize: '1.4rem', marginTop: '0.3rem', fontWeight: '800' }}>
              {stats.ram?.percentage?.toFixed(1) || 0}% / {(stats.cpu?.load || 0).toFixed(2)}
            </h3>
          </div>
        </div>

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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3.5rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)' }}>אפליקציות מנוטרות</h2>
        
        {/* Subtle SSL Warning next to title instead of huge card */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontSize: '0.9rem', fontWeight: '600' }}>
          <ShieldCheck size={18} />
          תעודות SSL תקינות (64 ימים נותרו)
        </div>
      </div>
      
      {/* Reverted to clean grid */}
      <div className="dashboard-grid">
        {apps.map(app => (
          <AppCard key={app.id} app={app} />
        ))}
        {apps.length === 0 && (
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
