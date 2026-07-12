import { useEffect, useState } from 'react';
import { Activity, FileText, Globe, Plus, ServerCog, Terminal, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

const initialForm = { name: '', url: '', pm2_name: '', log_path: '', log_filter: '', health_port: '', health_path: '' };

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
        <header><div><span className="eyebrow">שירות חדש</span><h2 id="add-service-title">חיבור לניטור</h2></div><button type="button" onClick={onClose} aria-label="סגירה"><X /></button></header>
        <p>אפשר לחבר אתר סטטי, תהליך PM2 או שירות עם בדיקת תקינות. רק שם השירות הוא שדה חובה.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label><span><ServerCog /> שם השירות *</span><input value={formData.name} onChange={(event) => updateField('name', event.target.value)} placeholder="לדוגמה: Vee Frontend" required autoFocus /></label>
          <label><span><Globe /> כתובת האתר</span><input dir="ltr" value={formData.url} onChange={(event) => updateField('url', event.target.value)} placeholder="https://vee-app.co.il" /></label>
          <label><span><Terminal /> שם תהליך PM2</span><input dir="ltr" value={formData.pm2_name} onChange={(event) => updateField('pm2_name', event.target.value)} placeholder="vee-app" /></label>
          <div className="form-pair"><label><span><Activity /> פורט בדיקת תקינות</span><input type="number" value={formData.health_port} onChange={(event) => updateField('health_port', event.target.value)} placeholder="3001" /></label><label><span>נתיב בדיקה</span><input dir="ltr" value={formData.health_path} onChange={(event) => updateField('health_path', event.target.value)} placeholder="/api/health" /></label></div>
          <label><span><FileText /> קובץ Nginx access log</span><input dir="ltr" value={formData.log_path} onChange={(event) => updateField('log_path', event.target.value)} placeholder="/var/log/nginx/access.log" /></label>
          <label><span>מסנן שורות לוג</span><input dir="ltr" value={formData.log_filter} onChange={(event) => updateField('log_filter', event.target.value)} placeholder="/my-site/|/My_Site/" /></label>
          <footer><button type="button" onClick={onClose}>ביטול</button><button type="submit" disabled={loading}><Plus /> {loading ? 'מחבר…' : 'חיבור השירות'}</button></footer>
        </form>
      </section>
    </div>
  );
};

export default AddAppModal;
