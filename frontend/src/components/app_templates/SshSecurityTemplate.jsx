import React, { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, Terminal as TerminalIcon } from 'lucide-react';
import LiveTerminal from '../LiveTerminal';

const SshSecurityTemplate = ({ app }) => {
  const chartData = app.history && app.history.length > 0 ? app.history : [{visitors:0, requests:0, attacks:0}];
  const currentMetrics = chartData[chartData.length - 1] || { visitors: 0, requests: 0, attacks: 0 };

  return (
    <div className="animate-fade-in">
      {/* Stats Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <ShieldCheck size={30} color="var(--success)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>מצב Fail2ban</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--success)' }}>פעיל (Active)</p>
        </div>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <ShieldAlert size={30} color="var(--danger)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>כתובות IP חסומות כעת</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--danger)' }}>{currentMetrics.attacks || 0}</p>
        </div>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <TerminalIcon size={30} color="var(--accent-secondary)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>התראות אבטחה היום</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{currentMetrics.attacks > 0 ? 'חסימה פעילה' : 'תקין (Ok)'}</p>
        </div>
      </div>

      {/* Audit Logs Console */}
      <div style={{ marginTop: '2rem', height: '450px' }}>
        <h2 style={{ marginBottom: '1.2rem', fontSize: '1.3rem', fontWeight: 'bold' }}>לוג אבטחה (/var/log/fail2ban.log)</h2>
        <LiveTerminal appId={app.id} />
      </div>
    </div>
  );
};

export default SshSecurityTemplate;
