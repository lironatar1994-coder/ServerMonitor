import { useEffect, useState } from 'react';
import { BellRing, BellOff, Send } from 'lucide-react';
import { apiFetch } from '../lib/api';

const BASE = import.meta.env.BASE_URL;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const keyBytes = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};
const registration = () => navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });

/** Phone and desktop notifications for the same alerts that are emailed. */
export default function PushSettings() {
  const [state, setState] = useState(supported() ? 'loading' : 'unsupported');
  const [devices, setDevices] = useState(0);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!supported()) return;
    let alive = true;
    Promise.all([registration().then((reg) => reg.pushManager.getSubscription()), apiFetch('/push')])
      .then(([subscription, info]) => { if (alive) { setState(subscription ? 'on' : 'off'); setDevices(info.devices); } })
      .catch(() => alive && setState('off'));
    return () => { alive = false; };
  }, []);
  const enable = async () => {
    setMessage('');
    try {
      if (await Notification.requestPermission() !== 'granted') { setMessage('הדפדפן חסם התראות. אפשר לאשר בהגדרות האתר בדפדפן.'); return; }
      const reg = await registration();
      const { publicKey } = await apiFetch('/push');
      const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      await apiFetch('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
      setState('on'); setDevices((count) => count + 1); setMessage('התראות הופעלו במכשיר הזה.');
    } catch (error) { setMessage(error.message); }
  };
  const disable = async () => {
    setMessage('');
    try {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (subscription) {
        await apiFetch('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setState('off'); setDevices((count) => Math.max(0, count - 1)); setMessage('התראות בוטלו במכשיר הזה.');
    } catch (error) { setMessage(error.message); }
  };
  const test = async () => {
    try { const result = await apiFetch('/push/test', { method: 'POST', body: '{}' }); setMessage(result.delivered ? 'נשלחה התראת בדיקה.' : 'לא נמצא מכשיר פעיל.'); }
    catch (error) { setMessage(error.message); }
  };
  return (
    <div className="push-settings">
      <h3>התראות לטלפון ולמחשב</h3>
      {state === 'unsupported' ? (
        <p className="muted">הדפדפן הזה לא תומך בהתראות. באייפון: פתחו את המוניטור ב־Safari, שתפו › "הוספה למסך הבית", ואז הפעילו כאן מתוך האפליקציה.</p>
      ) : (
        <>
          <p className="muted">אותן התראות שנשלחות בדוא״ל, גם כהתראה במכשיר. {devices ? `${devices} מכשירים רשומים לחשבון.` : ''}</p>
          <div className="btn-group">
            {state === 'on'
              ? <button type="button" className="btn" onClick={disable}><BellOff aria-hidden="true" /> ביטול במכשיר הזה</button>
              : <button type="button" className="btn btn--primary" onClick={enable} disabled={state === 'loading'}><BellRing aria-hidden="true" /> הפעלה במכשיר הזה</button>}
            {state === 'on' && <button type="button" className="btn" onClick={test}><Send aria-hidden="true" /> בדיקה</button>}
          </div>
        </>
      )}
      {message && <p className="status-line" role="status">{message}</p>}
    </div>
  );
}
