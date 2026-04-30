import React from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

const SSLCard = ({ daysLeft = 64, domain = "vee-app.co.il" }) => {
  const isHealthy = daysLeft > 14;
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1rem' }}>
        <div style={{ 
          background: isHealthy ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
          padding: '16px', 
          borderRadius: '16px', 
          color: isHealthy ? 'var(--success)' : 'var(--danger)' 
        }}>
          {isHealthy ? <ShieldCheck size={32} /> : <ShieldAlert size={32} />}
        </div>
        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>תעודת SSL</h3>
          <p style={{ color: 'var(--text-secondary)' }}>{domain}</p>
        </div>
      </div>
      
      <div style={{ background: 'var(--bg-primary)', padding: '15px', borderRadius: '12px', textAlign: 'center' }}>
        <span style={{ fontSize: '2rem', fontWeight: '800', color: isHealthy ? 'var(--success)' : 'var(--danger)' }}>
          {daysLeft}
        </span>
        <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginRight: '8px' }}>ימים נותרו</span>
      </div>
    </div>
  );
};

export default SSLCard;
