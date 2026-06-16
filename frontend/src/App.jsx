import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AppDetails from './pages/AppDetails';
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

const ChangePasswordModal = ({ onClose }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '2rem', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>שינוי סיסמת מנהל</h2>
          <button onClick={onClose} className="btn-icon" style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
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
          </Routes>
        </main>
        {isSettingsOpen && <ChangePasswordModal onClose={() => setIsSettingsOpen(false)} />}
      </div>
    </BrowserRouter>
  );
}

export default App;
