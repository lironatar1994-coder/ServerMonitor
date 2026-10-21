import { useEffect, useState } from 'react';
import { BellRing, BellOff, Download, Send } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/format';

const BASE = import.meta.env.BASE_URL;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const keyBytes = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};
const registration = () => navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
const LABELS = {
  outage: ['שירות לא זמין, איטי או חזר לפעול', 'תמיד מיידי; נפילה עוקפת שעות שקט'],
  leads: ['פנייה חדשה ופנייה שממתינה מעל יום', ''],
  digest: ['סיכום בוקר ב־08:00', 'ביקורים, לחיצות קשר ופניות פתוחות מאתמול'],
  traffic: ['ביקורים חריגים', 'קפיצה או ירידה גדולה לעומת השבוע האחרון'],
  contacts: ['הרבה לחיצות קשר', 'טלפון, וואטסאפ או טופס; לחיצה אינה פנייה'],
  campaigns: ['קמפיין חדש מביא תנועה', ''],
  pages: ['עמוד חדש פופולרי או עמוד שלא נמצא', ''],
  speed: ['האתר נטען לאט יותר', '']
};
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);


/** Phone and desktop notifications: outages plus chosen insights, per device. */
export default function PushSettings() {
  const [state, setState] = useState(supported() ? 'loading' : 'unsupported');
  const [devices, setDevices] = useState(0);
  const [endpoint, setEndpoint] = useState('');
  const [prefs, setPrefs] = useState(null);
  const [categories, setCategories] = useState([]);
  const [insights, setInsights] = useState([]);
  const [message, setMessage] = useState('');
  const [canInstall, setCanInstall] = useState(Boolean(window.__monitorInstallPrompt));
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;

  useEffect(() => {
    const ready = () => setCanInstall(true);
    window.addEventListener('monitor-installable', ready);
    apiFetch('/push/insights').then((value) => setInsights(value.insights)).catch(() => {});
    if (!supported()) return () => window.removeEventListener('monitor-installable', ready);
    let alive = true;
    registration().then((reg) => reg.pushManager.getSubscription()).then(async (subscription) => {
      const info = await apiFetch(`/push${subscription ? `?endpoint=${encodeURIComponent(subscription.endpoint)}` : ''}`);
      if (!alive) return;
      setDevices(info.devices); setCategories(info.categories);
      if (subscription && info.preferences) { setEndpoint(subscription.endpoint); setPrefs(info.preferences); setState('on'); }
      else setState('off');
    }).catch(() => alive && setState('off'));
    return () => { alive = false; window.removeEventListener('monitor-installable', ready); };
  }, []);

  const enable = async () => {
    setMessage('');
    try {
      if (await Notification.requestPermission() !== 'granted') { setMessage('הדפדפן חסם התראות. אפשר לאשר בהגדרות האתר בדפדפן.'); return; }
      const reg = await registration();
      const info = await apiFetch('/push');
      const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.publicKey) });
      const result = await apiFetch('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
      setEndpoint(subscription.endpoint); setPrefs(result.preferences); setCategories(info.categories);
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
      setState('off'); setPrefs(null); setDevices((count) => Math.max(0, count - 1)); setMessage('התראות בוטלו במכשיר הזה.');
    } catch (error) { setMessage(error.message); }
  };
  const save = async (next) => {
    setPrefs(next);
    try {
      const result = await apiFetch('/push/preferences', { method: 'PUT', body: JSON.stringify({ endpoint, ...next }) });
      setPrefs(result.preferences); setMessage('נשמר.');
    } catch (error) { setMessage(error.message); }
  };
  const test = async () => {
    try { const result = await apiFetch('/push/test', { method: 'POST', body: '{}' }); setMessage(result.delivered ? 'נשלחה התראת בדיקה.' : 'לא נמצא מכשיר פעיל.'); }
    catch (error) { setMessage(error.message); }
  };
  const install = async () => {
    const prompt = window.__monitorInstallPrompt;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => null);
    window.__monitorInstallPrompt = null; setCanInstall(false);
  };

  return (
    <div className="push-settings">
      <h3>התראות לטלפון ולמחשב</h3>
      {!standalone && (canInstall
        ? <button type="button" className="btn" onClick={install}><Download aria-hidden="true" /> התקנת המוניטור כאפליקציה</button>
        : <p className="muted">להתקנה בטלפון: באנדרואיד, תפריט Chrome › "התקנת אפליקציה". באייפון: Safari › שיתוף › "הוספה למסך הבית", ואז פותחים מהאייקון ומפעילים כאן.</p>)}
      {state === 'unsupported' ? (
        <p className="muted">הדפדפן הזה לא תומך בהתראות. באייפון ההתראות עובדות רק מתוך האפליקציה שנוספה למסך הבית.</p>
      ) : (
        <>
          <p className="muted">נפילות שירות ותובנות, לפי הבחירה שלך בכל מכשיר. {devices ? `${devices} מכשירים רשומים לחשבון.` : ''}</p>
          <div className="btn-group">
            {state === 'on'
              ? <button type="button" className="btn" onClick={disable}><BellOff aria-hidden="true" /> ביטול במכשיר הזה</button>
              : <button type="button" className="btn btn--primary" onClick={enable} disabled={state === 'loading'}><BellRing aria-hidden="true" /> הפעלה במכשיר הזה</button>}
            {state === 'on' && <button type="button" className="btn" onClick={test}><Send aria-hidden="true" /> בדיקה</button>}
          </div>
          {state === 'on' && prefs && (
            <div className="push-preferences">
              <fieldset>
                <legend>מה לשלוח למכשיר הזה</legend>
                {categories.map((id) => (
                  <label key={id} className="push-category">
                    <input type="checkbox" checked={prefs.categories.includes(id)}
                      onChange={(event) => save({ ...prefs, categories: event.target.checked ? [...prefs.categories, id] : prefs.categories.filter((item) => item !== id) })} />
                    <span><b>{LABELS[id]?.[0] || id}</b>{LABELS[id]?.[1] && <small>{LABELS[id][1]}</small>}</span>
                  </label>
                ))}
              </fieldset>
              <div className="push-limits">
                <label>שעות שקט מ־
                  <select value={prefs.quiet_start} onChange={(event) => save({ ...prefs, quiet_start: Number(event.target.value) })}>
                    {HOURS.map((hour) => <option key={hour} value={hour}>{`${String(hour).padStart(2, '0')}:00`}</option>)}
                  </select>
                </label>
                <label>עד
                  <select value={prefs.quiet_end} onChange={(event) => save({ ...prefs, quiet_end: Number(event.target.value) })}>
                    {HOURS.map((hour) => <option key={hour} value={hour}>{`${String(hour).padStart(2, '0')}:00`}</option>)}
                  </select>
                </label>
                <label>עד
                  <select value={prefs.daily_cap} onChange={(event) => save({ ...prefs, daily_cap: Number(event.target.value) })}>
                    {[3, 5, 10, 20].map((cap) => <option key={cap} value={cap}>{cap}</option>)}
                  </select>
                  תובנות ביום
                </label>
              </div>
              <p className="muted">תובנות שנחסמו בשעות השקט או מעבר לתקרה נספרות בסיכום הבוקר.</p>
            </div>
          )}
        </>
      )}
      {message && <p className="status-line" role="status">{message}</p>}
      {insights.length > 0 && (
        <div className="push-insights">
          <h3>תובנות אחרונות</h3>
          <ul>
            {insights.slice(0, 10).map((item) => (
              <li key={item.key}>
                <a href={item.url}><b>{item.title}</b><small>{item.body}</small></a>
                <time>{formatDateTime(item.created_at)}</time>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
