import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, Copy, ExternalLink, Monitor, Play, Power, RefreshCw, Search, X } from 'lucide-react';
import { DataState, Empty, IconAction, PageHead, Panel } from '../components/AnalyticsParts';
import Modal from '../components/Modal';
import { apiFetch } from '../lib/api';
import { getSessionSnapshot } from '../lib/session';
import './remote.css';

const ACTIVE = new Set(['queued', 'running']);
const LABEL = { list: 'רענון רשימה', connect: 'חיבור', disconnect: 'כיבוי', status: 'מצב', screenshot: 'צילום מסך', launch: 'הפעלת Claude' };
const STATUS = { queued: 'ממתין', running: 'רץ', done: 'הושלם', error: 'נכשל', expired: 'פג' };

// Server timestamps are compared with the server clock so a skewed phone clock reads correctly.
const ago = (ts, now) => {
  if (!ts) return 'אף פעם';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return 'עכשיו';
  if (s < 60) return `לפני ${s} שנ׳`;
  if (s < 3600) return `לפני ${Math.round(s / 60)} ד׳`;
  if (s < 86400) return `לפני ${Math.round(s / 3600)} ש׳`;
  return `לפני ${Math.round(s / 86400)} ימים`;
};
const statusTone = (status) => /running|working|responding/i.test(status) ? 'is-running' : !status || /idle/i.test(status) ? '' : 'is-attention';

export default function Remote() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [dismissed, setDismissed] = useState(null);
  const [shot, setShot] = useState(null); // { job } while the screen viewer is open
  const [notice, setNotice] = useState('');
  const timer = useRef(null);
  const lastAutoList = useRef(0);
  const owner = getSessionSnapshot()?.role === 'owner';

  const jobs = useMemo(() => state?.jobs || [], [state]);
  const active = useCallback((type) => jobs.find((job) => job.type === type && ACTIVE.has(job.status)) || null, [jobs]);

  const queue = useCallback(async (type, args) => {
    const { job, agentOnline } = await apiFetch('/remote/jobs', { method: 'POST', body: JSON.stringify({ type, args }) });
    setState((current) => current && ({ ...current, jobs: [job, ...current.jobs.filter((item) => item.id !== job.id)] }));
    if (!agentOnline && type !== 'list') setNotice('המחשב לא מחובר. הפעולה תרוץ כשיתחבר, עד 90 שניות.');
    return job;
  }, []);
  const fail = (e) => setNotice(e.message || String(e));

  // Polls every 3 s, every second while a job runs; hidden tabs pause until visible again.
  const poller = useRef(() => {});
  useEffect(() => {
    if (!owner) return undefined;
    let alive = true;
    const tick = async () => {
      clearTimeout(timer.current);
      if (document.hidden) return;
      let next = 3000;
      try {
        const data = await apiFetch('/remote/state');
        if (!alive) return;
        setState(data);
        setError('');
        if (data.jobs.some((job) => ACTIVE.has(job.status))) next = 1000;
        // A fresh list whenever the screen is open; the agent reads it in about a second.
        const stale = !data.sessionsAt || data.now - data.sessionsAt > 30e3;
        if (data.agent.online && stale && !data.jobs.some((job) => job.type === 'list' && ACTIVE.has(job.status)) && Date.now() - lastAutoList.current > 30e3) {
          lastAutoList.current = Date.now();
          queue('list').catch(() => {});
        }
      } catch (e) { if (!alive) return; setError(e.message); next = 10000; }
      timer.current = setTimeout(tick, next);
    };
    poller.current = tick;
    const start = setTimeout(tick, 0);
    const resume = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', resume);
    return () => { alive = false; clearTimeout(start); clearTimeout(timer.current); document.removeEventListener('visibilitychange', resume); };
  }, [owner, queue]);
  const tick = () => poller.current();

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // The result card sits above the list, so bring it into view.
  const run = (type, args) => {
    setDismissed(null);
    return queue(type, args).then(() => { tick(); window.scrollTo({ top: 0, behavior: 'smooth' }); }).catch(fail);
  };
  const openShot = async () => {
    setShot({ job: null });
    try { const job = await queue('screenshot'); setShot({ job: job.id }); tick(); } catch (e) { fail(e); }
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setNotice('הקישור הועתק'); } catch { setNotice(text); }
  };

  if (!owner) return <div className="page"><PageHead title="מחשב" /><Empty text="שליטה במחשב זמינה לבעלי המערכת בלבד." /></div>;

  const now = state?.now ?? 0;
  const agent = state?.agent;
  const term = query.trim().toLowerCase();
  const sessions = (state?.sessions || []).filter((session) => !term || session.title.toLowerCase().includes(term));
  const connecting = active('connect');
  const listing = Boolean(active('list'));

  // The newest connect/disconnect/launch result stays on top until it is closed.
  const hero = jobs.find((job) => ['connect', 'disconnect', 'launch'].includes(job.type));
  const shotJob = shot && jobs.find((job) => job.id === shot.job);

  return (
    <div className="page page--remote">
      <PageHead
        title="מחשב"
        meta={agent && (
          <span className={`chip ${agent.online ? 'is-online' : 'is-offline'}`} title={agent.host ? `${agent.host} · סוכן ${agent.version}` : undefined}>
            {agent.online ? 'מחובר' : `לא מחובר · ${ago(agent.lastSeen, now)}`}
          </span>
        )}
      >
        <IconAction icon={RefreshCw} label="רענון רשימת השיחות" onClick={() => queue('list').catch(fail)} className={`icon-btn${listing ? ' is-busy' : ''}`} />
        <IconAction icon={Monitor} label="צילום מסך המחשב" onClick={openShot} />
      </PageHead>

      <DataState loading={!state && !error} error={state ? '' : error} onRetry={tick}>
        {state && (
          <>
            {!agent.online && (
              <div className="banner banner--attention" role="status">
                <b>המחשב לא עונה.</b> {agent.lastSeen ? `נראה ${ago(agent.lastSeen, now)}.` : 'הסוכן עוד לא התחבר.'} המחשב צריך להיות דלוק, מחובר למשתמש ועם הסוכן פועל.
              </div>
            )}
            {agent.online && agent.claudeRunning === false && (
              <div className="banner banner--attention remote-banner" role="status">
                <b>Claude סגור במחשב.</b>
                <button type="button" className="btn" disabled={Boolean(active('launch'))} onClick={() => run('launch')}><Play aria-hidden="true" />הפעלת Claude</button>
              </div>
            )}
            {hero && dismissed !== hero.id && (
              <RemoteResult job={hero} online={agent.online} onClose={() => setDismissed(hero.id)} onRetry={() => run(hero.type, hero.args)}
                onDisconnect={() => run('disconnect', hero.args)} onCopy={copy} onScreen={openShot} />
            )}

            <Panel
              title="שיחות"
              hint="הרשימה נקראת מסרגל הצד של Claude במחשב. לחיצה על שיחה פותחת אותה במחשב ומפעילה Remote Control."
              action={<span className="muted remote-updated">{listing ? 'קורא מהמחשב…' : state.sessionsAt ? ago(state.sessionsAt, now) : ''}</span>}
              bleed
            >
              <div className="remote-search">
                <div className="search">
                  <Search aria-hidden="true" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש שיחה" aria-label="חיפוש שיחה" />
                  {query && <button type="button" onClick={() => setQuery('')} aria-label="ניקוי חיפוש"><X aria-hidden="true" /></button>}
                </div>
              </div>
              {sessions.length ? (
                <ul className="remote-list">
                  {sessions.map((session, index) => {
                    const rc = state.links[session.title];
                    const mine = connecting && connecting.args.title === session.title && connecting.args.occurrence === session.occurrence;
                    const heading = index === 0 || sessions[index - 1].section !== session.section;
                    return (
                      <li key={`${session.index}:${session.title}`}>
                        {heading && session.section && <h3 className="remote-section">{session.section}</h3>}
                        <button type="button" className={`remote-row${session.current ? ' is-current' : ''}`} aria-busy={mine || undefined}
                          aria-label={`חיבור ${session.title}`} onClick={() => run('connect', { title: session.title, occurrence: session.occurrence })}>
                          <i className={`remote-dot ${statusTone(session.status)}`} title={session.status} aria-hidden="true" />
                          <span className="remote-row__main">
                            <b dir="auto">{session.title}</b>
                            <small>
                              {session.status && !/idle/i.test(session.status) && <span dir="auto">{session.status}</span>}
                              {session.current && <span>פתוחה במחשב</span>}
                              {rc?.cloud ? <span className="is-on">בענן</span> : rc?.enabled ? <span className="is-on">Remote פעיל · {ago(rc.at, now)}</span> : null}
                            </small>
                          </span>
                          {mine ? <RefreshCw className="is-spinning" aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty text={term && state.sessions.length ? 'אין שיחה תואמת.'
                  : state.sessionsAt && !listing ? 'לא נמצאו שיחות בסרגל של Claude.'
                  : agent.online ? 'קורא שיחות מהמחשב…' : 'אין עדיין שיחות. ממתין למחשב.'} />
              )}
            </Panel>

            <details className="remote-activity">
              <summary>פעולות אחרונות</summary>
              <ol>
                {jobs.map((job) => (
                  <li key={job.id}>
                    <span className={`remote-job remote-job--${job.status}`}>{STATUS[job.status] || job.status}</span>
                    <span><b>{LABEL[job.type] || job.type}</b>{job.args?.title && <span dir="auto"> · {job.args.title}</span>}
                      {job.error && <span dir="auto"> · {job.error}</span>} · {ago(job.updatedAt, now)}</span>
                  </li>
                ))}
              </ol>
            </details>
          </>
        )}
      </DataState>

      {shot && (
        <Modal className="remote-shot" label="מסך המחשב" onClose={() => setShot(null)}>
          <div className="remote-shot__bar">
            <span className="muted">
              {!shotJob || ACTIVE.has(shotJob.status) ? 'מצלם את המסך…' : shotJob.status !== 'done' ? (shotJob.error || 'הצילום נכשל') : `צולם ${ago(state?.screenshotAt, now)}`}
            </span>
            <div className="btn-group">
              <IconAction icon={RefreshCw} label="צילום חדש" onClick={openShot} />
              <IconAction icon={X} label="סגירה" onClick={() => setShot(null)} />
            </div>
          </div>
          <div className="remote-shot__body">
            {state?.screenshotAt ? <img src={`/serve-monitor/api/remote/screenshot?t=${state.screenshotAt}`} alt="צילום מסך המחשב" /> : null}
          </div>
        </Modal>
      )}
      {notice && <div className="remote-toast" role="status">{notice}</div>}
    </div>
  );
}

function RemoteResult({ job, online, onClose, onRetry, onDisconnect, onCopy, onScreen }) {
  const title = job.args?.title;
  const close = <IconAction icon={X} label="סגירה" onClick={onClose} />;
  if (ACTIVE.has(job.status)) {
    const what = job.type === 'launch' ? 'מפעיל את Claude במחשב…' : job.type === 'disconnect' ? 'מכבה Remote Control…' : 'מתחבר…';
    const sub = job.status === 'queued' ? (online ? 'נשלח למחשב…' : 'ממתין שהמחשב יתחבר…') : job.type === 'connect' ? 'פותח את השיחה במחשב ומפעיל Remote Control' : 'בעבודה';
    return (
      <section className="remote-result" aria-live="polite">
        <RefreshCw className="is-spinning" aria-hidden="true" />
        <div><b>{what}</b>{title && <small dir="auto">{title}</small>}<small>{sub}</small></div>
      </section>
    );
  }
  if (job.status === 'done') {
    if (job.type === 'connect' && job.result?.cloud) return (
      <section className="remote-result is-ok" aria-live="polite">
        <Check aria-hidden="true" />
        <div><b>שיחת ענן, כבר זמינה בטלפון</b>{title && <small dir="auto">{title}</small>}</div>
        {close}
        <div className="remote-result__actions">
          <a className="btn btn--primary" href="https://claude.ai/code" target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />פתיחת Claude Code</a>
        </div>
      </section>
    );
    if (job.type === 'connect' && job.result?.link) return (
      <section className="remote-result is-ok" aria-live="polite">
        <Check aria-hidden="true" />
        <div><b>Remote Control פעיל</b>{title && <small dir="auto">{title}</small>}</div>
        {close}
        <div className="remote-result__actions">
          <a className="btn btn--primary" href={job.result.link} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />פתיחה ב־Claude</a>
          <button type="button" className="btn" onClick={() => onCopy(job.result.link)}><Copy aria-hidden="true" />העתקת קישור</button>
          <button type="button" className="btn" onClick={onDisconnect}><Power aria-hidden="true" />כיבוי</button>
        </div>
      </section>
    );
    const message = job.type === 'launch' ? 'Claude פתוח במחשב' : job.type === 'disconnect' ? 'Remote Control כבוי' : 'בוצע';
    return (
      <section className="remote-result is-ok" aria-live="polite">
        <Check aria-hidden="true" />
        <div><b>{message}</b>{title && <small dir="auto">{title}</small>}</div>
        {close}
      </section>
    );
  }
  return (
    <section className="remote-result is-bad" role="alert">
      <X aria-hidden="true" />
      <div><b>{job.type === 'connect' ? 'החיבור נכשל' : 'הפעולה נכשלה'}</b>{title && <small dir="auto">{title}</small>}<small dir="auto">{job.error || 'שגיאה לא ידועה'}</small></div>
      {close}
      <div className="remote-result__actions">
        <button type="button" className="btn btn--primary" onClick={onRetry}>ניסיון נוסף</button>
        <button type="button" className="btn" onClick={onScreen}><Monitor aria-hidden="true" />מסך המחשב</button>
      </div>
    </section>
  );
}
