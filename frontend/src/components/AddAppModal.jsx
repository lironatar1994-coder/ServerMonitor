import { useEffect, useState } from 'react';
import { Activity, FileText, Globe, Plus, ServerCog, Terminal, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

const initialForm = {
  name: '',
  url: '',
  pm2_name: '',
  log_path: '',
  log_host: '',
  log_filter: '',
  log_exclude: '',
  health_url: '',
  health_port: '',
  health_path: '',
  analytics_enabled: true,
  reporting_enabled: false
};

const AddAppModal = ({ onClose, onAdded }) => {
  const [formData, setFormData] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleEscape = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const updateField = (field, value) => setFormData((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      await apiFetch('/apps', {
        method: 'POST',
        body: JSON.stringify({ ...formData, health_port: formData.health_port ? Number(formData.health_port) : null })
      });
      onAdded();
    } catch (submitError) { setError(submitError.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="add-service-dialog" role="dialog" aria-modal="true" aria-labelledby="add-service-title">
        <header><h2 id="add-service-title">שירות חדש</h2><button type="button" onClick={onClose} aria-label="סגירה"><X /></button></header>
        <p>רק שם השירות הוא שדה חובה.</p>
        {error && <div className="banner banner--error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label><span><ServerCog /> שם השירות *</span><input dir="auto" value={formData.name} onChange={(event) => updateField('name', event.target.value)} placeholder="לדוגמה: Vee Frontend" required autoFocus /></label>
          <label><span><Globe /> כתובת האתר</span><input dir="ltr" value={formData.url} onChange={(event) => updateField('url', event.target.value)} placeholder="https://vee-app.co.il" /></label>
          <label><span><Terminal /> שם תהליך PM2</span><input dir="ltr" value={formData.pm2_name} onChange={(event) => updateField('pm2_name', event.target.value)} placeholder="vee-app" /></label>
          <label><span><Activity /> כתובת בדיקת תקינות מלאה</span><input dir="ltr" value={formData.health_url} onChange={(event) => updateField('health_url', event.target.value)} placeholder="http://127.0.0.1:3001/api/health" /></label>
          <div className="form-pair"><label><span><Activity /> פורט בדיקה (תאימות ישנה)</span><input dir="ltr" type="number" value={formData.health_port} onChange={(event) => updateField('health_port', event.target.value)} placeholder="3001" /></label><label><span>נתיב בדיקה</span><input dir="ltr" value={formData.health_path} onChange={(event) => updateField('health_path', event.target.value)} placeholder="/api/health" /></label></div>
          <label><span><FileText /> קובץ Nginx access log</span><input dir="ltr" value={formData.log_path} onChange={(event) => updateField('log_path', event.target.value)} placeholder="/var/log/nginx/monitor_host_access.log" /></label>
          <label><span>דומיינים מדויקים</span><input dir="ltr" value={formData.log_host} onChange={(event) => updateField('log_host', event.target.value)} placeholder="example.co.il|www.example.co.il" /></label>
          <label><span>נתיבים לכלול</span><input dir="ltr" value={formData.log_filter} onChange={(event) => updateField('log_filter', event.target.value)} placeholder="/my-site/|/My_Site/" /></label>
          <label><span>נתיבים להוציא</span><input dir="ltr" value={formData.log_exclude} onChange={(event) => updateField('log_exclude', event.target.value)} placeholder="/admin|/monitor" /></label>
          <label className="analytics-toggle"><input type="checkbox" checked={formData.analytics_enabled} onChange={(event) => setFormData((current) => ({ ...current, analytics_enabled: event.target.checked, reporting_enabled: event.target.checked ? current.reporting_enabled : false }))} /><span>הכללת האתר באנליטיקת מבקרים</span></label>
          <label className="analytics-toggle"><input type="checkbox" checked={formData.reporting_enabled} disabled={!formData.analytics_enabled} onChange={(event) => updateField('reporting_enabled', event.target.checked)} /><span>הכללת האתר בדוחות ההשוואה היומיים והשבועיים</span></label>
          <footer><button type="button" onClick={onClose}>ביטול</button><button type="submit" disabled={loading}><Plus /> {loading ? 'מחבר…' : 'חיבור השירות'}</button></footer>
        </form>
      </section>
    </div>
  );
};

export default AddAppModal;
