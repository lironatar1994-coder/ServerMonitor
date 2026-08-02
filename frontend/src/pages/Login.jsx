import { useState } from 'react';
import { Activity, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const response = await fetch('/serve-monitor/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'שם המשתמש או הסיסמה אינם נכונים');
      localStorage.setItem('token', data.token);
      window.dispatchEvent(new Event('auth-change'));
      navigate('/visitors', { replace: true });
    } catch (loginError) { setError(loginError.message); }
    finally { setLoading(false); }
  };

  return (
    <main className="login">
      <form className="login__card" onSubmit={handleSubmit}>
        <span className="login__brand"><i aria-hidden="true"><Activity /></i><b>Vee</b> Monitor</span>
        <h1>כניסה</h1>
        {error && <div className="banner banner--error" role="alert">{error}</div>}
        <label>שם משתמש
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label>סיסמה
          <span className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'הסתרת סיסמה' : 'הצגת סיסמה'}>
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </span>
        </label>
        <button className="btn btn--primary btn--wide" type="submit" disabled={loading}>
          {loading ? 'מתחבר…' : <>כניסה <ArrowLeft aria-hidden="true" /></>}
        </button>
      </form>
    </main>
  );
};

export default Login;
