import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AppDetails from './pages/AppDetails';
import SystemStats from './pages/SystemStats';
import { Activity } from 'lucide-react';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

const Navbar = ({ onChangePassword }) => {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Activity size={28} color="var(--accent-primary)" />
        <span>Vee Monitor</span>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={onChangePassword} className="btn-icon" style={{ borderColor: '#e2e8f0', color: 'var(--text-secondary)' }} title="שינוי סיסמה">
          שינוי סיסמה
        </button>
        <button onClick={handleLogout} className="btn-icon" title="התנתק">
          התנתק
        </button>
      </div>
    </nav>
  );
};

const SettingsModal = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('password'); // 'password' or 'whatsapp'
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [phone, setPhone] = useState('0508611888');
  const [message, setMessage] = useState('🔔 *בדיקת מערכת התראות מנטור Vee* - הודעת הבדיקה נשלחה בהצלחה!');
  
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert('הסיסמאות החדשות אינן תואמות');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/serve-monitor/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        onClose();
      } else {
        alert(data.error || 'שגיאה בשינוי הסיסמה');
      }
    } catch (err) {
      console.error(err);
      alert('שגיאת תקשורת');
    }
    setLoading(false);
  };

  const handleTestWhatsApp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/serve-monitor/api/auth/test-whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phone, message })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
      } else {
        alert(data.error || 'שגיאה בשליחת הודעת בדיקה');
      }
    } catch (err) {
      console.error(err);
      alert('שגיאת תקשורת');
    }
    setLoading(false);
  };

  return (
    <div className="settings-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="glass-card settings-modal-card animate-fade-in" style={{ width: '100%', maxWidth: '450px', padding: '2rem', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>הגדרות מערכת</h2>
          <button onClick={onClose} className="btn-icon" style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
          <button 
            type="button"
            onClick={() => setActiveTab('password')}
            style={{ 
              flex: 1, 
              padding: '10px', 
              background: 'none', 
              border: 'none', 
              borderBottom: activeTab === 'password' ? '2px solid var(--accent-primary)' : 'none', 
              fontWeight: activeTab === 'password' ? 'bold' : 'normal',
              color: activeTab === 'password' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            שינוי סיסמה
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            style={{ 
              flex: 1, 
              padding: '10px', 
              background: 'none', 
              border: 'none', 
              borderBottom: activeTab === 'whatsapp' ? '2px solid var(--accent-primary)' : 'none', 
              fontWeight: activeTab === 'whatsapp' ? 'bold' : 'normal',
              color: activeTab === 'whatsapp' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            בדיקת WhatsApp
          </button>
        </div>

        {activeTab === 'password' ? (
          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>סיסמה נוכחית *</label>
              <input 
                type="password"
                required
                className="input-field" 
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>סיסמה חדשה *</label>
              <input 
                type="password"
                required
                className="input-field" 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>אימות סיסמה חדשה *</label>
              <input 
                type="password"
                required
                className="input-field" 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'משנה...' : 'שנה סיסמה'}
              </button>
              <button type="button" onClick={onClose} className="btn-icon" style={{ flex: 1 }}>ביטול</button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleTestWhatsApp} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>מספר טלפון ליעד (עם קידומת מדינה) *</label>
              <input 
                type="text"
                required
                placeholder="למשל: 0508611888"
                className="input-field" 
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>תוכן ההודעה לבדיקה *</label>
              <textarea 
                required
                rows={3}
                className="input-field" 
                style={{ resize: 'vertical', minHeight: '80px' }}
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'שולח...' : 'שלח הודעת בדיקה'}
              </button>
              <button type="button" onClick={onClose} className="btn-icon" style={{ flex: 1 }}>ביטול</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasToken, setHasToken] = useState(!!localStorage.getItem('token'));

  // Listen to storage events to update token state
  useEffect(() => {
    const handleStorage = () => {
      setHasToken(!!localStorage.getItem('token'));
    };
    window.addEventListener('storage', handleStorage);
    // Periodically check token as backup
    const interval = setInterval(handleStorage, 1000);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="app-layout">
        {hasToken && <Navbar onChangePassword={() => setIsSettingsOpen(true)} />}
        <main className="main-content">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/app/:id" element={
              <ProtectedRoute>
                <AppDetails />
              </ProtectedRoute>
            } />
            <Route path="/system-stats" element={
              <ProtectedRoute>
                <SystemStats />
              </ProtectedRoute>
            } />
          </Routes>
        </main>
        {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      </div>
    </BrowserRouter>
  );
}

export default App;
