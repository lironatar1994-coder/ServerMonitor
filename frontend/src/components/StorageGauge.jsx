import React from 'react';
import { HardDrive } from 'lucide-react';

const StorageGauge = ({ used = 65, total = 100 }) => {
  const percentage = (used / total) * 100;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  let color = 'var(--accent-primary)';
  if (percentage > 85) color = 'var(--danger)';
  else if (percentage > 70) color = 'var(--warning)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ position: 'relative', width: '150px', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="150" height="150" style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
          {/* Background Circle */}
          <circle 
            cx="75" cy="75" r={radius} 
            stroke="rgba(0,0,0,0.05)" strokeWidth="12" fill="none" 
          />
          {/* Progress Circle */}
          <circle 
            cx="75" cy="75" r={radius} 
            stroke={color} strokeWidth="12" fill="none" 
            strokeDasharray={circumference} 
            strokeDashoffset={strokeDashoffset} 
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease-out, stroke 0.5s ease' }}
          />
        </svg>
        <div style={{ textAlign: 'center', zIndex: 10 }}>
          <HardDrive size={24} color={color} style={{ margin: '0 auto 5px' }} />
          <div style={{ fontSize: '1.5rem', fontWeight: '800', lineHeight: '1' }}>{percentage.toFixed(0)}%</div>
        </div>
      </div>
      <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '600' }}>
        שטח אחסון: {used}GB / {total}GB
      </p>
    </div>
  );
};

export default StorageGauge;
