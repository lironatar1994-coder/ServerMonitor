import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, Play, Power, RefreshCw, ServerCog, TerminalSquare } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import LiveTerminal from '../components/LiveTerminal';
import SshSecurityTemplate from '../components/app_templates/SshSecurityTemplate';
import WhatsAppTemplate from '../components/app_templates/WhatsAppTemplate';
import { DataState } from '../components/AnalyticsParts';
import { formatDateTime } from '../lib/format';
import { apiFetch } from '../lib/api';

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

  const handleAction = async () => {
    const action = pendingAction;
    setPendingAction(null); setActionState(action);
    try { await apiFetch(`/apps/${id}/action`, { method: 'POST', body: JSON.stringify({ action }) }); await fetchApp(); }
    catch (actionError) { setError(actionError.message); }
    finally { setActionState(''); }
  };

  const actionLabel = { start: 'הפעלה', stop: 'עצירה', restart: 'הפעלה מחדש' };

  return (
    <div className="page page--service-detail">
      <Link className="back-link" to="/services"><ArrowRight /> כל השירותים</Link>
      <DataState loading={loading} error={error}>
        {app && <>
          <header className="service-detail-hero"><div className="service-detail-mark"><ServerCog /></div><div><span className="edition-label">שירות / תפעול</span><h1>{app.name}</h1><div className="site-meta"><span className={`status-tag ${app.status === 'online' ? 'is-online' : 'is-offline'}`}>{app.status === 'online' ? 'פעיל' : 'לא פעיל'}</span><span>בדיקה אחרונה: {formatDateTime(app.last_checked)}</span>{app.url && <a href={app.url} target="_blank" rel="noreferrer">פתיחה <ExternalLink /></a>}</div></div>{app.pm2_name && <div className="service-actions">{app.status === 'online' ? <button type="button" className="danger-action" onClick={() => setPendingAction('stop')}><Power /> עצירה</button> : <button type="button" onClick={() => setPendingAction('start')}><Play /> הפעלה</button>}<button type="button" onClick={() => setPendingAction('restart')}><RefreshCw className={actionState ? 'is-spinning' : ''} /> הפעלה מחדש</button></div>}</header>

          {app.pm2_name === 'vee-whatsapp-worker' ? <div className="special-service"><WhatsAppTemplate app={app} /></div> : app.name === 'SSH Security' ? <div className="special-service"><SshSecurityTemplate app={app} /></div> : <section className="operations-grid"><article className="operation-sheet"><span className="eyebrow">Runtime</span><h2>מצב השירות</h2><dl><div><dt>סוג</dt><dd>{app.pm2_name ? 'תהליך PM2' : 'אתר סטטי'}</dd></div><div><dt>CPU יישום</dt><dd>{(app.cpu || 0).toFixed(1)}%</dd></div><div><dt>זיכרון יישום</dt><dd>{((app.memory || 0) / 1024 / 1024).toFixed(1)} MB</dd></div><div><dt>מסנן לוג</dt><dd dir="ltr">{app.log_filter || 'ללא'}</dd></div></dl>{app.log_path && <Link className="visitor-jump" to={`/visitors/${app.id}`}>מעבר לתמונת המבקרים</Link>}</article><article className="operation-terminal"><span className="terminal-title"><TerminalSquare /> לוג חי</span><LiveTerminal appId={app.id} /></article></section>}
        </>}
      </DataState>

      {pendingAction && <div className="dialog-backdrop" role="presentation"><div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><span className="eyebrow">אישור פעולה</span><h2 id="confirm-title">{actionLabel[pendingAction]} של {app?.name}?</h2><p>הפעולה תשפיע מיד על השירות בשרת.</p><div><button type="button" onClick={() => setPendingAction(null)}>ביטול</button><button type="button" className="danger-action" onClick={handleAction}>כן, {actionLabel[pendingAction]}</button></div></div></div>}
    </div>
  );
};

export default AppDetails;
