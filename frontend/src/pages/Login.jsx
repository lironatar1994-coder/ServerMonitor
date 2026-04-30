import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Lock, User } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        navigate('/');
        window.location.reload(); // Refresh to show navbar
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('שגיאת התחברות לשרת');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
      <div className="glass-card animate-fade-in" style={{ padding: '3rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <div style={{ background: 'var(--accent-primary)', padding: '15px', borderRadius: '50%', color: 'white', boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)' }}>
            <Server size={40} />
          </div>
        </div>
        
        <h2 style={{ marginBottom: '0.5rem', fontSize: '1.8rem', fontWeight: '800' }}>ברוכים הבאים</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>מערכת ניטור שרתים חכמה</p>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', background: '#fee2e2', padding: '10px', borderRadius: '8px' }}>{error}</div>}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div style={{ position: 'relative' }}>
            <User size={20} style={{ position: 'absolute', right: '15px', top: '14px', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              placeholder="שם משתמש" 
              className="input-field" 
              style={{ paddingRight: '45px' }}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          
          <div style={{ position: 'relative' }}>
            <Lock size={20} style={{ position: 'absolute', right: '15px', top: '14px', color: 'var(--text-secondary)' }} />
            <input 
              type="password" 
              placeholder="סיסמה" 
              className="input-field" 
              style={{ paddingRight: '45px' }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }}>
            התחבר למערכת
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
