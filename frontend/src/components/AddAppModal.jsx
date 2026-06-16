import React, { useState } from 'react';
import { X, Globe, Terminal, FileText, Activity } from 'lucide-react';

const AddAppModal = ({ onClose, onAdded }) => {
  const [formData, setFormData] = useState({ 
    name: '', 
    url: '', 
    pm2_name: '', 
    log_path: '',
    health_port: '',
    health_path: '',
    log_filter: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Convert health_port to integer if provided, else null
    const payload = {
      ...formData,
      health_port: formData.health_port ? parseInt(formData.health_port, 10) : null
    };

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/serve-monitor/api/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        onAdded();
        onClose();
      } else {
        alert('שגיאה בהוספת האפליקציה');
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '500px', padding: '2rem', background: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.4rem' }}>הוספת אפליקציה חדשה</h2>
          <button onClick={onClose} className="btn-icon" style={{ border: 'none' }}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>שם האפליקציה *</label>
            <input 
              required
              className="input-field" 
              placeholder="למשל: Vee Frontend" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}><Globe size={14} style={{ display: 'inline', marginLeft: '5px' }}/>כתובת URL</label>
            <input 
              className="input-field" 
              placeholder="https://vee-app.co.il" 
              value={formData.url}
              onChange={e => setFormData({...formData, url: e.target.value})}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}><Terminal size={14} style={{ display: 'inline', marginLeft: '5px' }}/>שם תהליך PM2</label>
            <input 
              className="input-field" 
              placeholder="vee-app" 
              value={formData.pm2_name}
              onChange={e => setFormData({...formData, pm2_name: e.target.value})}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}><Activity size={14} style={{ display: 'inline', marginLeft: '5px' }}/>פורט בדיקת תקינות</label>
              <input 
                type="number"
                className="input-field" 
                placeholder="3001" 
                value={formData.health_port}
                onChange={e => setFormData({...formData, health_port: e.target.value})}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>נתיב בדיקת תקינות</label>
              <input 
                className="input-field" 
                placeholder="/api/health" 
                value={formData.health_path}
                onChange={e => setFormData({...formData, health_path: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}><FileText size={14} style={{ display: 'inline', marginLeft: '5px' }}/>נתיב קובץ לוג (Nginx Access)</label>
            <input 
              className="input-field" 
              placeholder="/var/log/nginx/access.log" 
              value={formData.log_path}
              onChange={e => setFormData({...formData, log_path: e.target.value})}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>סינון שורות לוג (Log Filter)</label>
            <input 
              className="input-field" 
              placeholder="למשל: /text-to-pdf" 
              value={formData.log_filter}
              onChange={e => setFormData({...formData, log_filter: e.target.value})}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>
              {loading ? 'מוסיף...' : 'הוסף אפליקציה'}
            </button>
            <button type="button" onClick={onClose} className="btn-icon" style={{ flex: 1 }}>ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAppModal;
