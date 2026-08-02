import { useState } from 'react';
import { KeyRound, MessageCircle, Save, Send } from 'lucide-react';
import { Panel, PageHead } from '../components/AnalyticsParts';
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
    if (newPassword !== confirmPassword) return setFeedback({ type: 'error', text: 'הסיסמאות אינן תואמות.' });
    setLoading('password'); setFeedback(null);
    try {
      const result = await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
      setFeedback({ type: 'success', text: result.message || 'הסיסמה שונתה.' });
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
      <PageHead title="הגדרות" />

      {feedback && <div className={`banner banner--${feedback.type}`} role="status">{feedback.text}</div>}

      <div className="grid grid--1-1">
        <Panel title="שינוי סיסמה" action={<span className="panel__mark"><KeyRound aria-hidden="true" /></span>}>
          <form className="form" onSubmit={handlePassword}>
            <label>סיסמה נוכחית
              <input type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            <label>סיסמה חדשה
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength="8" required />
            </label>
            <label>אימות סיסמה
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength="8" required />
            </label>
            <button type="submit" className="btn btn--primary" disabled={loading === 'password'}>
              <Save aria-hidden="true" /> {loading === 'password' ? 'שומר…' : 'שמירה'}
            </button>
          </form>
        </Panel>

        <Panel title="בדיקת WhatsApp" action={<span className="panel__mark"><MessageCircle aria-hidden="true" /></span>}>
          <form className="form" onSubmit={handleWhatsApp}>
            <label>מספר יעד
              <input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} required />
            </label>
            <label>תוכן ההודעה
              <textarea rows="4" value={message} onChange={(event) => setMessage(event.target.value)} required />
            </label>
            <button type="submit" className="btn btn--primary" disabled={loading === 'whatsapp'}>
              <Send aria-hidden="true" /> {loading === 'whatsapp' ? 'שולח…' : 'שליחת בדיקה'}
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
};

export default Settings;
