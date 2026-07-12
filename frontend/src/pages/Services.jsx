import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Plus, ServerCog } from 'lucide-react';
import { Link } from 'react-router-dom';
import AddAppModal from '../components/AddAppModal';
import { DataState, SectionHeader } from '../components/AnalyticsParts';
import { apiFetch } from '../lib/api';

const Services = () => {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchApps = useCallback(async () => {
    try { setApps(await apiFetch('/apps')); setError(''); }
    catch (fetchError) { setError(fetchError.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timeout = window.setTimeout(fetchApps, 0); return () => window.clearTimeout(timeout); }, [fetchApps]);

  return (
    <div className="page page--services">
      <header className="simple-hero"><div><span className="edition-label">שירותים / ניהול</span><h1>כל מה<br /><em>שרץ אצלך.</em></h1><p>הגדרות, סטטוס ופעולות תפעוליות. תנועת מבקרים נשארת באזור המבקרים.</p></div><button type="button" className="primary-action" onClick={() => setAdding(true)}><Plus /> הוספת שירות</button></header>
      <DataState loading={loading} error={error}>
        <section className="service-directory">
          <SectionHeader eyebrow="רשימה מלאה" title={`${apps.length} שירותים מנוטרים`} />
          <div className="service-list">
            {apps.map((app, index) => (
              <article className="service-line" key={app.id}>
                <span className="service-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="service-mark"><ServerCog /></span>
                <div><h2>{app.name}</h2><p dir="ltr">{app.url || app.pm2_name || app.log_path || 'ללא כתובת'}</p></div>
                <span className={`status-tag ${app.status === 'online' ? 'is-online' : 'is-offline'}`}>{app.status === 'online' ? 'פעיל' : 'דורש בדיקה'}</span>
                {app.url && <a className="icon-link" href={app.url} target="_blank" rel="noreferrer" aria-label={`פתיחת ${app.name}`}><ExternalLink /></a>}
                <Link className="line-action" to={`/services/${app.id}`}>ניהול השירות</Link>
              </article>
            ))}
            {!apps.length && <div className="quiet-empty">אין שירותים מוגדרים. אפשר להוסיף את הראשון עכשיו.</div>}
          </div>
        </section>
      </DataState>
      {adding && <AddAppModal onClose={() => setAdding(false)} onAdded={() => { setAdding(false); fetchApps(); }} />}
    </div>
  );
};

export default Services;
