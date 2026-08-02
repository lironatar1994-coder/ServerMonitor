import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, ExternalLink, Play, Power, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import LiveTerminal from '../components/LiveTerminal';
import SshSecurityTemplate from '../components/app_templates/SshSecurityTemplate';
import WhatsAppTemplate from '../components/app_templates/WhatsAppTemplate';
import { DataState, Panel, PageHead } from '../components/AnalyticsParts';
import { formatDateTime } from '../lib/format';
import { apiFetch } from '../lib/api';

const ACTION_LABEL = { start: 'הפעלה', stop: 'עצירה', restart: 'הפעלה מחדש' };

const AppDetails = () => {
  const { id } = useParams();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [actionState, setActionState] = useState('');

  const fetchApp = useCallback(async () => {
    try { setApp(await apiFetch(`/apps/${id}`)); setError(''); }
    catch (fetchError) { setError(fetchError.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    const initial = window.setTimeout(fetchApp, 0);
    const interval = window.setInterval(fetchApp, 10000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [fetchApp]);

  useEffect(() => {
    if (!pendingAction) return undefined;
    const handleEscape = (event) => event.key === 'Escape' && setPendingAction(null);
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [pendingAction]);

  const handleAction = async () => {
    const action = pendingAction;
    setPendingAction(null); setActionState(action);
    try { await apiFetch(`/apps/${id}/action`, { method: 'POST', body: JSON.stringify({ action }) }); await fetchApp(); }
    catch (actionError) { setError(actionError.message); }
    finally { setActionState(''); }
  };

  return (
    <div className="page page--service-detail">
      <DataState loading={loading && !app} error={error} onRetry={fetchApp}>
        {app && <>
          <PageHead
            title={app.name}
            meta={
              <>
                <Link className="crumb" to="/services"><ChevronRight aria-hidden="true" /> כל השירותים</Link>
                <span className={`chip ${app.status === 'online' ? 'is-online' : 'is-offline'}`}>{app.status === 'online' ? 'פעיל' : 'לא פעיל'}</span>
                <span className="muted">בדיקה: {formatDateTime(app.last_checked)}</span>
                {app.url && <a className="crumb" href={app.url} target="_blank" rel="noreferrer">פתיחה <ExternalLink aria-hidden="true" /></a>}
              </>
            }
          >
            {app.pm2_name && (
              <div className="btn-group">
                {app.status === 'online'
                  ? <button type="button" className="btn btn--danger" onClick={() => setPendingAction('stop')}><Power aria-hidden="true" /> עצירה</button>
                  : <button type="button" className="btn btn--primary" onClick={() => setPendingAction('start')}><Play aria-hidden="true" /> הפעלה</button>}
                <button type="button" className="btn" onClick={() => setPendingAction('restart')}>
                  <RefreshCw className={actionState ? 'is-spinning' : ''} aria-hidden="true" /> הפעלה מחדש
                </button>
              </div>
            )}
          </PageHead>

          {app.pm2_name === 'vee-whatsapp-worker' ? <WhatsAppTemplate app={app} />
            : app.name === 'SSH Security' ? <SshSecurityTemplate app={app} />
              : (
                <div className="grid grid--1-2">
                  <Panel title="מצב השירות">
                    <dl className="spec-list">
                      <div><dt>סוג</dt><dd>{app.pm2_name ? 'תהליך PM2' : 'אתר סטטי'}</dd></div>
                      <div><dt>CPU</dt><dd>{(app.cpu || 0).toFixed(1)}%</dd></div>
                      <div><dt>זיכרון</dt><dd>{((app.memory || 0) / 1024 / 1024).toFixed(1)} MB</dd></div>
                      <div><dt>דומיין לוג</dt><dd dir="ltr">{app.log_host || '—'}</dd></div>
                      <div><dt>נתיבים לכלול</dt><dd dir="ltr">{app.log_filter || 'הכול'}</dd></div>
                      <div><dt>נתיבים להוציא</dt><dd dir="ltr">{app.log_exclude || '—'}</dd></div>
                    </dl>
                    {app.log_path && <Link className="btn btn--wide" to={`/visitors/${app.id}`}>תמונת המבקרים</Link>}
                  </Panel>

                  <Panel title="לוג חי" className="panel--terminal" bleed>
                    <LiveTerminal appId={app.id} />
                  </Panel>
                </div>
              )}
        </>}
      </DataState>

      {pendingAction && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPendingAction(null)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title">{ACTION_LABEL[pendingAction]} של {app?.name}?</h2>
            <p>הפעולה תשפיע מיד על השירות בשרת.</p>
            <div className="dialog__actions">
              <button type="button" className="btn" onClick={() => setPendingAction(null)}>ביטול</button>
              <button type="button" className="btn btn--danger" onClick={handleAction}>{ACTION_LABEL[pendingAction]}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppDetails;
