import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Cpu, MemoryStick, RefreshCw, Server } from 'lucide-react';

const SystemStats = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ ram: {}, cpu: { snapshot: {} }, uptime: 0 });

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/serve-monitor/api/apps/server-stats', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        setStats(await response.json());
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const topProcesses = stats.cpu?.snapshot?.topProcesses || [];
  const uptimeDays = useMemo(() => {
    const totalSeconds = Number(stats.uptime || 0);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }, [stats.uptime]);

  return (
    <div className="animate-fade-in">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="btn-icon"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}
      >
        <ArrowLeft size={18} />
        Back
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '2rem', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.35rem' }}>System Snapshot</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Lightweight process snapshot updated every 15 seconds.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
          <RefreshCw size={16} />
          Auto refresh
        </div>
      </div>

      <div className="stats-grid">
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '15px', borderRadius: '12px', color: 'var(--accent-primary)' }}>
            <Server size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>CPU Load</p>
            <h3 style={{ fontSize: '1.4rem', marginTop: '0.3rem', fontWeight: 800 }}>
              {(stats.cpu?.load || 0).toFixed(2)}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
              Top process: {topProcesses[0] ? `${topProcesses[0].cpu.toFixed(1)}%` : 'n/a'}
            </p>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '15px', borderRadius: '12px', color: 'var(--success)' }}>
            <MemoryStick size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>RAM Used</p>
            <h3 style={{ fontSize: '1.4rem', marginTop: '0.3rem', fontWeight: 800 }}>
              {stats.ram?.percentage?.toFixed(1) || 0}%
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
              Uptime: {uptimeDays}
            </p>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Cpu size={20} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>Top Processes</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {topProcesses.slice(0, 6).map(proc => (
              <div key={`${proc.pid}-${proc.command}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {proc.command}
                </span>
                <strong style={{ whiteSpace: 'nowrap' }}>{proc.cpu.toFixed(1)}%</strong>
              </div>
            ))}
            {topProcesses.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No snapshot data yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemStats;
