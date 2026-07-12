import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, MessageCircle, Send, Smartphone } from 'lucide-react';
import LiveTerminal from '../LiveTerminal';
import { apiFetch } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

const normalizeStatus = (status) => {
  const value = (status || '').toString().toLowerCase();
  if (['sent', 'success', 'delivered', 'ok', 'complete', 'completed'].includes(value)) return 'sent';
  if (['failed', 'error', 'rejected', 'unsent'].includes(value)) return 'failed';
  return 'pending';
};

const WhatsAppTemplate = ({ app }) => {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState(app.whatsapp_status || { status: 'UNKNOWN' });
  const [phone, setPhone] = useState('0508611888');
  const [message, setMessage] = useState('🔔 בדיקת מערכת ההתראות Vee Monitor');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [visitorData, statusData] = await Promise.all([
        apiFetch(`/apps/${app.id}/visitors`),
        apiFetch(`/apps/${app.id}/whatsapp-status`)
      ]);
      setMessages(visitorData.visitors || []);
      setStatus(statusData);
    } catch (error) {
      setFeedback(error.message);
    }
  }, [app.id]);

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [refresh]);

  const handleSend = async (event) => {
    event.preventDefault(); setSending(true); setFeedback('');
    try {
      const result = await apiFetch('/auth/test-whatsapp', { method: 'POST', body: JSON.stringify({ phone, message }) });
      setFeedback(result.message || 'הודעת הבדיקה נשלחה.');
      window.setTimeout(refresh, 1500);
    } catch (error) { setFeedback(error.message); }
    finally { setSending(false); }
  };

  const counts = messages.reduce((result, item) => ({ ...result, [normalizeStatus(item.status)]: result[normalizeStatus(item.status)] + 1 }), { sent: 0, failed: 0, pending: 0 });
  const qr = status.qr || status.qrCode || status.qr_code;

  return (
    <div className="whatsapp-workspace">
      <section className="whatsapp-status-sheet"><div><span className="eyebrow">WhatsApp worker</span><h2><Smartphone /> {status.status === 'READY' ? 'מחובר ומוכן' : status.status === 'NEEDS_SCAN' ? 'נדרשת סריקה' : 'בודק חיבור'}</h2><p>מצב PM2: {status.pm2Online ? 'פעיל' : 'לא פעיל'} · עדכון: {formatDateTime(status.updatedAt)}</p></div>{qr && status.status !== 'READY' && <img src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`} alt="קוד QR לחיבור WhatsApp" />}</section>
      <section className="whatsapp-metrics"><article><CheckCircle2 /><strong>{counts.sent}</strong><span>נשלחו</span></article><article><Clock3 /><strong>{counts.pending}</strong><span>ממתינות</span></article><article><AlertTriangle /><strong>{counts.failed}</strong><span>נכשלו</span></article></section>
      <section className="whatsapp-grid"><form className="whatsapp-test" onSubmit={handleSend}><MessageCircle /><span className="eyebrow">בדיקה</span><h2>שליחת הודעה</h2>{feedback && <div className="settings-feedback">{feedback}</div>}<label>מספר יעד<input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label><label>הודעה<textarea rows="4" value={message} onChange={(event) => setMessage(event.target.value)} required /></label><button type="submit" disabled={sending}><Send /> {sending ? 'שולח…' : 'שליחה'}</button></form><div className="whatsapp-log"><LiveTerminal appId={app.id} /></div></section>
    </div>
  );
};

export default WhatsAppTemplate;
