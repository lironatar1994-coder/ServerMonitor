import { useState } from 'react';
import { KeyRound, MessageCircle, Save, Send } from 'lucide-react';
import { apiFetch } from '../lib/api';

const Settings = () => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('0508611888');
  const [message, setMessage] = useState('🔔 בדיקת מערכת התראות Vee Monitor');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState('');

  const handlePassword = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) return setFeedback({ type: 'error', text: 'הסיסמאות החדשות אינן תואמות.' });
    setLoading('password'); setFeedback(null);
    try {
      const result = await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
      setFeedback({ type: 'success', text: result.message || 'הסיסמה שונתה בהצלחה.' });
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (error) { setFeedback({ type: 'error', text: error.message }); }
    finally { setLoading(''); }
  };

  const handleWhatsApp = async (event) => {
    event.preventDefault(); setLoading('whatsapp'); setFeedback(null);
    try {
      const result = await apiFetch('/auth/test-whatsapp', { method: 'POST', body: JSON.stringify({ phone, message }) });
      setFeedback({ type: 'success', text: result.message || 'הודעת הבדיקה נשלחה.' });
    } catch (error) { setFeedback({ type: 'error', text: error.message }); }
    finally { setLoading(''); }
  };

  return (
    <div className="page page--settings">
      <header className="simple-hero"><div><span className="edition-label">הגדרות / מערכת</span><h1>שליטה שקטה.<br /><em>בלי הפתעות.</em></h1><p>אבטחת החשבון ובדיקת ערוץ ההתראות במקום אחד.</p></div></header>
      {feedback && <div className={`settings-feedback settings-feedback--${feedback.type}`} role="status">{feedback.text}</div>}
      <section className="settings-grid">
        <form className="settings-sheet" onSubmit={handlePassword}><span className="settings-icon"><KeyRound /></span><span className="eyebrow">אבטחה</span><h2>שינוי סיסמה</h2><p>בחר סיסמה חדשה ושמור אותה במקום בטוח.</p><label>סיסמה נוכחית<input type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} required /></label><label>סיסמה חדשה<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="8" required /></label><label>אימות סיסמה<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength="8" required /></label><button type="submit" disabled={loading === 'password'}><Save /> {loading === 'password' ? 'שומר…' : 'שמירת סיסמה'}</button></form>
        <form className="settings-sheet settings-sheet--dark" onSubmit={handleWhatsApp}><span className="settings-icon"><MessageCircle /></span><span className="eyebrow">התראות</span><h2>בדיקת WhatsApp</h2><p>שלח הודעת בדיקה כדי לוודא שהחיבור לערוץ ההתראות פעיל.</p><label>מספר יעד<input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label><label>תוכן ההודעה<textarea rows="5" value={message} onChange={(event) => setMessage(event.target.value)} required /></label><button type="submit" disabled={loading === 'whatsapp'}><Send /> {loading === 'whatsapp' ? 'שולח…' : 'שליחת בדיקה'}</button></form>
      </section>
    </div>
  );
};

export default Settings;
