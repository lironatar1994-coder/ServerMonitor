import React, { useState, useEffect } from 'react';
import { Plus, Server, Activity, Users, ShieldAlert } from 'lucide-react';
import AppCard from '../components/AppCard';
import AddAppModal from '../components/AddAppModal';

const Dashboard = () => {
  const [apps, setApps] = useState([]);
  const [stats, setStats] = useState({ ram: {}, cpu: {} });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const token = localStorage.getItem('token');

  const fetchData = async () => {
    try {
      const appsRes = await fetch('/api/apps', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (appsRes.ok) setApps(await appsRes.json());

      const statsRes = await fetch('/api/apps/server-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>סקירת שרת</h1>
          <p style={{ color: 'var(--text-secondary)' }}>מצב כללי של השרת והאפליקציות שלך</p>
        </div>
        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setIsModalOpen(true)}>
          <Plus size={20} />
          הוסף אפליקציה
        </button>
      </div>

      <div className="stats-grid">
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '15px', borderRadius: '12px', color: 'var(--accent-primary)' }}>
            <Server size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>RAM / CPU</p>
            <h3 style={{ fontSize: '1.5rem', marginTop: '0.3rem' }}>
              {stats.ram?.percentage?.toFixed(1)}% / {(stats.cpu?.load || 0).toFixed(2)}
            </h3>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '15px', borderRadius: '12px', color: 'var(--success)' }}>
            <Users size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>מבקרים היום</p>
            <h3 style={{ fontSize: '1.5rem', marginTop: '0.3rem' }}>{totalVisitors}</h3>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '15px', borderRadius: '12px', color: 'var(--danger)' }}>
            <ShieldAlert size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>נסיונות חדירה נחסמו</p>
            <h3 style={{ fontSize: '1.5rem', marginTop: '0.3rem' }}>{totalAttacks}</h3>
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: '1.5rem', marginTop: '3rem', marginBottom: '1.5rem' }}>אפליקציות מנוטרות</h2>
      
      <div className="dashboard-grid">
        {apps.map(app => (
          <AppCard key={app.id} app={app} />
        ))}
        {apps.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            אין אפליקציות מנוטרות. הוסף אחת כעת!
          </div>
        )}
      </div>

      {isModalOpen && <AddAppModal onClose={() => setIsModalOpen(false)} onAdded={fetchData} />}
    </div>
  );
};

export default Dashboard;
