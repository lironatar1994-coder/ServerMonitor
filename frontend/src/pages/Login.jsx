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
      const response = await fetch('/serve-monitor/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'שם המשתמש או הסיסמה אינם נכונים');
      localStorage.setItem('token', data.token);
      window.dispatchEvent(new Event('auth-change'));
      navigate('/visitors', { replace: true });
    } catch (loginError) { setError(loginError.message); }
    finally { setLoading(false); }
  };

  return (
    <main className="login-page">
      <section className="login-manifesto"><span className="login-brand"><Activity /> Vee Monitor</span><div><span className="edition-label">מבקרים. שרת. שני עולמות.</span><h1>לראות אנשים.<br /><em>להבין תנועה.</em><br />לשמור על השרת.</h1><p>מרכז ניטור פרטי שמציג קודם את מה שחשוב באמת—מי הגיע לאתרים שלך ומה הוא עשה שם.</p></div><small>Private operations desk · Israel</small></section>
      <section className="login-form-side"><form onSubmit={handleSubmit}><span className="eyebrow">כניסה מאובטחת</span><h2>ברוך שובך</h2><p>התחבר כדי לפתוח את תמונת המבקרים החיה.</p>{error && <div className="form-error" role="alert">{error}</div>}<label>שם משתמש<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required autoFocus /></label><label>סיסמה<span className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'הסתרת סיסמה' : 'הצגת סיסמה'}>{showPassword ? <EyeOff /> : <Eye />}</button></span></label><button className="login-submit" type="submit" disabled={loading}>{loading ? 'מתחבר…' : <>כניסה למערכת <ArrowLeft /></>}</button></form></section>
    </main>
  );
};

export default Login;
