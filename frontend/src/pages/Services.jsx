import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ExternalLink, Plus, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import AddAppModal from '../components/AddAppModal';
import { DataState, Empty, Panel, PageHead, Tabs } from '../components/AnalyticsParts';
import { apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/format';

const FILTERS = [
  { id: 'all', label: 'הכול' },
  { id: 'online', label: 'פעילים' },
  { id: 'issues', label: 'לבדיקה' }
];

const Services = () => {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fetchApps = useCallback(async () => {
    try { setApps(await apiFetch('/apps')); setError(''); }
    catch (fetchError) { setError(fetchError.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timeout = window.setTimeout(fetchApps, 0); return () => window.clearTimeout(timeout); }, [fetchApps]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return apps.filter((app) => {
      if (filter === 'online' && app.status !== 'online') return false;
      if (filter === 'issues' && app.status === 'online') return false;
      if (!term) return true;
      return [app.name, app.url, app.pm2_name, app.log_path].some((field) => (field || '').toLowerCase().includes(term));
    });
  }, [apps, filter, search]);

  const online = apps.filter((app) => app.status === 'online').length;

  return (
    <div className="page page--services">
      <PageHead title="שירותים" meta={<span className="muted">{online} מתוך {apps.length} פעילים</span>}>
        <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" /> הוספה
        </button>
      </PageHead>

      <DataState loading={loading} error={error} onRetry={fetchApps}>
        <Panel
          action={
            <>
              <Tabs tabs={FILTERS} value={filter} onChange={setFilter} label="סינון שירותים" />
              <div className="search">
                <Search aria-hidden="true" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש שירות" aria-label="חיפוש שירות" />
                {search && <button type="button" onClick={() => setSearch('')} aria-label="ניקוי חיפוש"><X aria-hidden="true" /></button>}
              </div>
            </>
          }
          bleed
        >
          {visible.length ? (
            <ul className="service-list">
              {visible.map((app) => (
                <li key={app.id}>
                  <Link to={`/services/${app.id}`} className="service-list__main">
                    <i className={app.status === 'online' ? 'is-online' : 'is-offline'} aria-hidden="true" />
                    <span className="service-list__name">
                      <b>{app.name}</b>
                      <small dir="ltr">{app.url || app.pm2_name || app.log_path || '—'}</small>
                    </span>
                    <span className="service-list__meta">
                      <b>{app.pm2_name ? 'תהליך PM2' : app.log_path ? 'אתר סטטי' : 'ניטור בסיסי'}</b>
                      <small>
                        {app.pm2_name
                          ? `${(app.cpu || 0).toFixed(1)}% CPU · ${((app.memory || 0) / 1024 / 1024).toFixed(0)} MB`
                          : `נבדק ${formatDateTime(app.last_checked)}`}
                      </small>
                    </span>
                    <span className={`chip ${app.status === 'online' ? 'is-online' : 'is-offline'}`}>
                      {app.status === 'online' ? 'פעיל' : 'לבדיקה'}
                    </span>
                    <ChevronLeft aria-hidden="true" />
                  </Link>
                  {app.url && (
                    <a className="icon-btn" href={app.url} target="_blank" rel="noreferrer" aria-label={`פתיחת ${app.name}`}>
                      <ExternalLink aria-hidden="true" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty text={apps.length ? 'אין שירותים שתואמים לסינון' : 'אין שירותים מוגדרים עדיין'} />
          )}
        </Panel>
      </DataState>

      {adding && <AddAppModal onClose={() => setAdding(false)} onAdded={() => { setAdding(false); fetchApps(); }} />}
    </div>
  );
};

export default Services;
