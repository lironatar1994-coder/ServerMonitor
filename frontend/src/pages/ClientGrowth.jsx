import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Check, Copy, Mail, MessageCircle, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import { DataState, Empty, Hint, PageHead, Panel, Stat, StatRow, Tabs } from '../components/AnalyticsParts';
import { apiFetch } from '../lib/api';
import { formatDateTime, formatNumber } from '../lib/format';
import './client-growth.css';
import { PROJECT_NAMES } from '../lib/analyticsLabels';

const metrics = { contact_click: 'ביקורים עם לחיצת קשר', form_start: 'ביקורים עם התחלת טופס', form_submit: 'ביקורים עם ניסיון שליחה', lead_received: 'פניות שנקלטו ודווחו', won: 'פניות שסומנו כהצלחה', tool_completed: 'פעולות שהושלמו', file_downloaded: 'הורדות קובץ' };
const leadStatuses = { new: 'חדש', working: 'בטיפול', contacted: 'נוצר קשר', qualified: 'פנייה מתאימה', completed: 'טופל במקור', won: 'נסגר בהצלחה', lost: 'לא נסגר', irrelevant: 'לא רלוונטי' };
const placements = { header: 'תפריט', hero: 'פתיח', floating: 'כפתור צף', contact: 'אזור קשר', footer: 'תחתית', content: 'תוכן' };
const actions = { contact_click: 'לחיצת קשר', project_open: 'פתיחת פרויקט', outbound_click: 'מעבר לאתר פעיל' };
const taskStatuses = { planned: 'מתוכנן', working: 'בביצוע', waiting_client: 'ממתין ללקוח', published: 'פורסם · במדידה', done: 'הושלם', cancelled: 'בוטל' };
const tabs = [{ id: 'overview', label: 'תמונת מצב' }, { id: 'leads', label: 'פניות' }, { id: 'tasks', label: 'שיפורים ותוכן' }, { id: 'goals', label: 'מטרות' }, { id: 'campaigns', label: 'קמפיינים' }, { id: 'activity', label: 'יומן עבודה' }, { id: 'share', label: 'סיכום לשיתוף' }];
const origins = { manual: 'דיווח ידני', quotes: 'מערכת הצעות מחיר', contact: 'מערכת הטפסים', registrations: 'מערכת הרשמות', leads: 'מערכת הפניות' };
const num = formatNumber;
const options = obj => Object.entries(obj).map(([value, label]) => ({ value, label }));
const field = (name, label, type = 'text', extra = {}) => ({ name, label, type, ...extra });
const fields = {
  profile: [field('objective', 'מטרת האתר', 'text', { required: true, maxLength: 300 }), field('owner', 'אחראי', 'text', { maxLength: 80 }), field('response_hours', 'זמן מענה רצוי בשעות', 'number', { required: true, min: 1, max: 720 })],
  goals: [field('title', 'שם המטרה', 'text', { required: true, maxLength: 160 }), field('metric', 'מה מודדים', 'select', { options: options(metrics) }), field('period_days', 'תקופת המטרה בימים', 'select', { options: [{ value: 7, label: '7 ימים' }, { value: 30, label: '30 יום' }, { value: 90, label: '90 יום' }] }), field('target', 'יעד לתקופת המטרה · 0 ללא יעד מספרי', 'number', { min: 0, max: 1000000 }), field('path', 'נתיב עמוד · ריק לכל האתר', 'text', { dir: 'ltr', maxLength: 500 }), field('active', 'מצב', 'select', { options: [{ value: 1, label: 'פעיל' }, { value: 0, label: 'מושהה' }] })],
  leads: [field('reference', 'אסמכתה פנימית · ללא שם או טלפון', 'text', { required: true, maxLength: 120 }), field('status', 'מצב טיפול', 'select', { options: options(leadStatuses) }), field('owner', 'אחראי', 'text', { maxLength: 80 }), field('due_at', 'מועד מעקב', 'datetime-local'), field('value', 'סכום עסקה מדווח בש״ח · אם ידוע', 'number', { min: 0, step: '0.01' }), field('source', 'מקור ידוע · אחרת להשאיר ריק', 'text', { maxLength: 80 }), field('campaign', 'שם קמפיין ידוע · אחרת להשאיר ריק', 'text', { maxLength: 80 })],
  tasks: [field('title', 'מה צריך לעשות', 'text', { required: true, maxLength: 180 }), field('hypothesis', 'ראיות, השערה ותוצאה צפויה', 'textarea', { maxLength: 1500 }), field('status', 'מצב', 'select', { options: options(taskStatuses) }), field('owner', 'אחראי', 'text', { maxLength: 80 }), field('due_at', 'מועד ביצוע', 'datetime-local'), field('priority', 'עדיפות', 'select', { options: options({ normal: 'רגילה', high: 'גבוהה' }) }), field('metric', 'מדד להשוואה לאחר הפרסום', 'select', { options: options(metrics) }), field('path', 'נתיב למדידה · ריק לכל האתר', 'text', { dir: 'ltr', maxLength: 500 })],
  campaigns: [field('name', 'שם קמפיין', 'text', { required: true, maxLength: 80 }), field('source', 'מקור · למשל instagram', 'text', { required: true, maxLength: 80 }), field('medium', 'ערוץ · למשל social או qr', 'text', { required: true, maxLength: 80 }), field('landing_path', 'נתיב עמוד הנחיתה באתר', 'text', { dir: 'ltr', required: true, maxLength: 500 }), field('cost', 'תקציב מדווח לכל הקמפיין בש״ח', 'number', { min: 0, step: '0.01' })]
};
function localDate(value) {
  if (!value) return '';
  const d = new Date(value); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function Editor({ edit, onSave, onClose, busy }) {
  const [value, setValue] = useState(edit.value);
  const formFields = fields[edit.kind];
  return <Panel title={edit.value.id ? 'עריכת רשומה' : edit.kind === 'profile' ? 'הגדרות לקוח' : 'הוספת רשומה'} action={<button className="icon-btn" onClick={onClose} aria-label="סגירת עריכה"><X /></button>}>
    <form className="form growth-form" onSubmit={e => { e.preventDefault(); onSave(value); }}>
      {formFields.map(({ name, label, type, options: choices, ...props }, index) => <label key={name}>{label}
        {type === 'select' ? <select {...props} value={value[name] ?? choices[0].value} onChange={e => setValue(v => ({ ...v, [name]: ['active', 'period_days'].includes(name) ? Number(e.target.value) : e.target.value }))}>{choices.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          : type === 'textarea' ? <textarea {...props} rows="3" value={value[name] || ''} onChange={e => setValue(v => ({ ...v, [name]: e.target.value }))} />
            : <input {...props} autoFocus={index === 0} type={type} value={type === 'datetime-local' ? localDate(value[name]) : value[name] ?? ''} onChange={e => setValue(v => ({ ...v, [name]: type === 'datetime-local' ? (e.target.value ? new Date(e.target.value).toISOString() : null) : e.target.value }))} />}
      </label>)}
      <div className="growth-actions"><button className="btn btn--primary" disabled={busy} type="submit"><Check />{busy ? 'שומר…' : 'שמירה'}</button><button className="btn" type="button" onClick={onClose}>ביטול</button></div>
    </form>
  </Panel>;
}
function InsightList({ items, onTask, busy }) {
  if (!items.length) return <Empty text="אין כרגע המלצות שמבוססות על מספיק נתונים. אפשר לפתוח משימת שיפור ידנית." />;
  return <div className="growth-list">{items.map(item => <article className="growth-item" key={item.key}>
    <div><strong>{item.title}</strong><p>{item.evidence}</p><small>{item.action}</small></div>
    {onTask && <button className="btn" disabled={busy || Boolean(item.task_id)} onClick={() => onTask(item)}>{item.task_id ? 'קיימת משימה' : 'פתיחת משימה'}</button>}
  </article>)}</div>;
}
function ShareDraft({ id, days, notify }) {
  const [draft, setDraft] = useState(null), [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true);
    try { setDraft(await apiFetch(`/client-growth/${id}/report?days=${days}`)); }
    catch (e) { notify(e.message, true); } finally { setBusy(false); }
  };
  return <Panel title="סיכום לעריכה ושיתוף ידני" hint="נפתחת טיוטה באפליקציה שבחרת. פתיחת הטיוטה אינה אישור שההודעה נשלחה. אין ללקוח גישה למערכת.">
    <div className="growth-actions"><button className="btn btn--primary" disabled={busy} onClick={generate}>{draft ? 'יצירת טיוטה מחדש' : 'הכנת סיכום לתקופה'}</button><span className="muted">יש לעבור על הנוסח לפני השיתוף</span></div>
    {draft && <div className="form growth-draft">
      <label>נושא<input value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} maxLength={200} /></label>
      <label>תוכן הסיכום<textarea rows="16" value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} maxLength={10000} /></label>
      <div className="growth-actions">
        <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(draft.body); notify('הסיכום הועתק'); } catch { notify('לא ניתן להעתיק. אפשר לסמן את הטקסט ולהעתיק ידנית.', true); } }}><Copy />העתקה</button>
        <a className="btn" href={`mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}><Mail />פתיחה במייל</a>
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(draft.body)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />פתיחה ב־WhatsApp</a>
      </div>
      <small className="muted">בטיוטה ארוכה אפשר להשתמש בהעתקה אם אפליקציית השיתוף מקצרת את התוכן.</small>
    </div>}
  </Panel>;
}
export default function ClientGrowth() {
  const { id } = useParams();
  const [days, setDays] = useState(30), [tab, setTab] = useState('overview');
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [edit, setEdit] = useState(null), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(null);
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all');
  const notify = (message, isError = false) => setFeedback({ message, isError });
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { setData(await apiFetch(`/client-growth${id ? `/${id}` : ''}?days=${days}`)); setError(''); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [id, days]);
  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    const interval = setInterval(() => load(true), 60000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [load]);
  const startEdit = (kind, value = {}) => {
    const defaults = { goals: { metric: 'lead_received', target: 0, active: 1, period_days: 30 }, leads: { status: 'new', owner: data?.profile?.owner || '' }, tasks: { status: 'planned', priority: 'normal', metric: 'contact_click', owner: data?.profile?.owner || '' }, campaigns: { landing_path: new URL(data.app.url).pathname } };
    setEdit({ kind, value: { ...defaults[kind], ...value } }); setFeedback(null);
  };
  const save = async value => {
    setBusy(true);
    try {
      const url = `/client-growth/${id}/${edit.kind}${value.id ? `/${value.id}` : ''}`;
      await apiFetch(url, { method: edit.kind === 'profile' ? 'PUT' : value.id ? 'PATCH' : 'POST', body: JSON.stringify(value) });
      setEdit(null); notify('השינויים נשמרו'); await load(true);
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  };
  const fromInsight = item => { setTab('tasks'); startEdit('tasks', { title: item.action, hypothesis: `${item.title}\n${item.evidence}\nהמלצה לבדיקה, אינה מסקנה על סיבת השינוי.`, evidence_key: item.key, priority: item.priority, path: item.path }); };
  const sites = (data?.sites || []).filter(s => `${s.name} ${s.owner} ${s.objective}`.toLowerCase().includes(search.toLowerCase()) && (filter !== 'attention' || s.insights.length));
  const m = data?.metrics || {};
  return <div className="page page--visitors growth-workspace">
    <PageHead title={id ? data?.app?.name || 'לקוח' : 'לקוחות וצמיחה'} meta={id ? <Link to="/clients">כל הלקוחות</Link> : 'סביבת עבודה פנימית'}>
      <Tabs label="טווח מדידה" tabs={[{ id: 7, label: '7 ימים' }, { id: 30, label: '30 יום' }, { id: 90, label: '90 יום' }]} value={days} onChange={setDays} />
      <button className="icon-btn" onClick={() => load()} aria-label="רענון"><RefreshCw /></button>
    </PageHead>
    {feedback && <div className={`banner banner--${feedback.isError ? 'error' : 'success'}`} role={feedback.isError ? 'alert' : 'status'}>{feedback.message}</div>}
    <DataState loading={loading} error={error} onRetry={() => load()}>{data && <>
      {!id ? <>
        <StatRow><Stat label="אתרים" value={data.sites.length} /><Stat label="דורשים תשומת לב" value={data.sites.filter(s => s.insights.length).length} /><Stat label="פניות פתוחות" value={data.sites.reduce((n, s) => n + s.open_leads, 0)} /><Stat label="משימות פתוחות" value={data.sites.reduce((n, s) => n + s.open_tasks, 0)} /></StatRow>
        <Panel title="סדר העבודה" hint="הסדר מתעדף פניות שממתינות, בעיות איסוף ומשימות באיחור. ההשוואה היא של כל אתר לעצמו.">
          <div className="growth-toolbar"><label className="growth-search"><span className="sr-only">חיפוש לקוח</span><input placeholder="חיפוש לקוח או אחראי" value={search} onChange={e => setSearch(e.target.value)} /></label><Tabs tabs={[{ id: 'all', label: 'כל הלקוחות' }, { id: 'attention', label: 'דורשים טיפול' }]} value={filter} onChange={setFilter} /></div>
          <div className="growth-list">{sites.map(site => <Link className="growth-client" key={site.id} to={`/clients/${site.id}`}>
            <div><strong>{site.name}</strong><p>{site.objective}</p><small>{site.owner || 'טרם הוגדר אחראי'}</small></div>
            <dl><div><dt>פניות בתקופה</dt><dd>{num(site.metrics.lead_received)}</dd></div><div><dt>ממתינות לטיפול</dt><dd>{num(site.open_leads)}</dd></div><div><dt>משימות</dt><dd>{num(site.open_tasks)}</dd></div></dl>
            <div className="growth-next"><span>{site.insights[0]?.title || 'מטרות ומעקב שוטף'}</span><small>{site.coverage.first ? `מדידת פעולות מ־${formatDateTime(site.coverage.first)}` : 'ממתינים למדידת פעולות ראשונה'}</small></div><ArrowUpRight aria-hidden="true" />
          </Link>)}</div>{!sites.length && <Empty text="אין לקוחות שמתאימים לסינון" />}
        </Panel>
      </> : <>
        <div className="growth-toolbar"><Tabs tabs={tabs} value={tab} onChange={value => { setTab(value); setEdit(null); setFilter('all'); }} label="סביבת לקוח" /><Link className="btn" to={`/visitors/${id}`}>נתוני מבקרים<ArrowUpRight /></Link></div>
        {edit && <Editor key={`${edit.kind}:${edit.value.id || 'new'}`} edit={edit} onSave={save} onClose={() => setEdit(null)} busy={busy} />}
        {tab === 'overview' && <>
          {data.app.name === 'LA webs' && <Panel title="מדידה ובדיקות פנימיות" hint="ההחרגה חלה על הדפדפן שבו נפתח הקישור, לביקורים עתידיים בלבד. ביקורים קודמים אינם מסווגים מחדש.">
            <div className="growth-actions"><a className="btn" href="https://lawebs.co.il/?monitor_internal=1" target="_blank" rel="noopener noreferrer">פתיחת האתר ללא ספירה</a><a className="btn" href="https://lawebs.co.il/?monitor_internal=0" target="_blank" rel="noopener noreferrer">החזרת הספירה בדפדפן</a></div>
          </Panel>}
          <StatRow><Stat label="ביקורים שנמדדו" value={m.sessions} hint="ביקורים אנונימיים במדידה החדשה בלבד; סינון אוטומציה אינו הוכחה לאדם. אין השלמה של היסטוריה שלא נמדדה." /><Stat label="ביקורים עם לחיצת קשר" value={m.contact_click} /><Stat label="פניות ממערכת המקור" value={m.confirmed} hint="רשומות שנשמרו במקור המחובר. אין שיוך אוטומטי לביקור הדפדפן." /><Stat label="פניות בדיווח ידני" value={m.manual} /></StatRow>
          <div className="growth-coverage"><span>מדידת פעולות: {data.coverage.first ? `מ־${formatDateTime(data.coverage.first)}` : 'ממתינים לאות ראשון'}</span><span>מקור פניות: {data.coverage.source ? data.coverage.source.status === 'ok' ? `סונכרן ${formatDateTime(data.coverage.source.last_success_at)}` : data.coverage.source.detail : 'ללא חיבור אוטומטי · אפשר לדווח ידנית'}</span></div>
          <Panel title="מכשירים"><div className="growth-stages">{data.devices.map(d => <div key={d.device}><strong>{num(d.sessions)}</strong><span>{{ mobile: 'נייד', tablet: 'טאבלט', desktop: 'מחשב', unknown: 'לא ידוע' }[d.device]} · {num(d.contacts)} עם לחיצת קשר</span></div>)}{!data.devices.length && <Empty text="ממתינים למדידות מכשיר" />}</div></Panel><Panel title="מה דורש תשומת לב"><InsightList items={data.insights} onTask={fromInsight} busy={busy} /></Panel>
          {data.app.name === 'LA webs' ? <Panel title="פעולות לפי פרויקט ומיקום" hint="פעולות שנצפו בדפדפן בלבד. לחיצה אינה פנייה שנשלחה. נתוני המיקום מתחילים ממועד התקנת המדידה.">
            {(data.actions || []).map((row, i) => <div className="growth-item" key={i}><div><b>{actions[row.event_type]} · {row.label === 'whatsapp' ? 'WhatsApp' : row.label === 'phone' ? 'טלפון' : PROJECT_NAMES[row.project] || 'כללי'}</b><small>{placements[row.placement] || 'מיקום לא נמדד'} · {PROJECT_NAMES[row.project] || 'עמוד הבית'} · <span dir="ltr">{row.path}</span></small></div><span>{num(row.events)} פעולות · {num(row.sessions)} ביקורים</span></div>)}
            {!data.actions?.length && <Empty text="הפעולות יופיעו לאחר המדידות הראשונות" />}
          </Panel> : <Panel title="תהליך יצירת קשר" hint="השלבים הם ביקורים עם כל סוג פעולה, לא משפך מסודר ולא שיעור המרה לפנייה מאומתת."><div className="growth-stages">{[['form_start', 'התחלת טופס'], ['form_submit', 'ניסיון שליחה'], ['form_error', 'שגיאת אימות'], ['form_success_observed', 'הצלחה שדווחה בדפדפן']].map(([k, label]) => <div key={k}><strong>{num(m[k])}</strong><span>{label}</span></div>)}</div></Panel>}
          <div className="grid grid--1-1"><Panel title="עמודים ופעולות">{data.pages.length ? data.pages.map(p => <div className="growth-item" key={p.path}><b dir="ltr">{p.path}</b><span>{num(p.sessions)} ביקורים · {num(p.contacts)} עם קשר</span></div>) : <Empty text="הנתונים יופיעו אחרי המדידות הראשונות" />}</Panel>
            <Panel title="מקורות וקמפיינים">{data.sources.length ? data.sources.map((s, i) => <div className="growth-item" key={i}><div><b>{s.source || 'ישיר / לא ידוע'}</b><small>{[s.medium, s.campaign].filter(Boolean).join(' · ')}</small></div><span>{num(s.sessions)} ביקורים · {num(s.contacts)} עם קשר</span></div>) : <Empty text="טרם נמדדו מקורות הגעה" />}</Panel></div>
        </>}
        {tab === 'goals' && <>
          <Panel title="מטרת האתר" action={<button className="btn" onClick={() => startEdit('profile', data.profile)}><Pencil />עריכה</button>}><p>{data.profile.objective}</p><p className="muted">אחראי: {data.profile.owner || 'טרם הוגדר'} · זמן מענה רצוי: {data.profile.response_hours} שעות</p></Panel>
          <Panel title="מטרות ומדדי הצלחה" action={<button className="btn" onClick={() => startEdit('goals')}><Plus />מטרה</button>}>
            {data.goals.map(g => <div className="growth-item" key={g.id}><div><strong>{g.title}</strong><small>{metrics[g.metric]} · {g.period_days} ימים אחרונים · {g.path || 'כל האתר'} · {g.active ? 'פעיל' : 'מושהה'}</small></div><b>{num(g.current)}{g.target ? ` / ${num(g.target)}` : ' · ללא יעד מספרי'}</b><button className="btn" onClick={() => startEdit('goals', g)}>עריכה</button></div>)}
          </Panel>
        </>}
        {tab === 'leads' && <Panel title="מעקב פניות" hint="רשימת העבודה כוללת גם פניות מחוץ לטווח המדידה. פרטי הקשר נמצאים באתר המקור. מצב הטיפול כאן פנימי ואינו מעדכן את מערכת המקור." action={<button className="btn" onClick={() => startEdit('leads')}><Plus />דיווח ידני</button>}>
          <div className="growth-stages">{(data.outcomes || []).map(row => <div key={row.status}><strong>{num(row.total)}</strong><span>{leadStatuses[row.status]} · מהתקופה</span></div>)}</div>
          <div className="growth-coverage"><span>פניות מהתקופה שסומנו כהצלחה: {num(m.won)}</span><span>סכום מדווח עבורן: {num(m.revenue)} ₪</span><Hint text="סכומים שהוזנו ידנית; אין אימות תשלום או חישוב הכנסה אוטומטי." /></div><div className="growth-toolbar"><label>סינון מצב<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">כל הפניות</option>{options(leadStatuses).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label><span className="muted">{data.lead_total} פניות · מוצגות עד 500 אחרונות</span></div>
          {data.leads.filter(l => filter === 'all' || l.status === filter).map(l => <div className="growth-item" key={l.id}><div><strong>{l.reference}</strong><small>{origins[l.origin] || 'מקור מחובר'} · {formatDateTime(l.occurred_at)}</small><small>{l.owner || 'ללא אחראי'}{l.due_at ? ` · מעקב: ${formatDateTime(l.due_at)}` : ''}{l.source_status === 'notification_failed' ? ' · הודעת המייל במקור נכשלה' : ''}</small></div><span className="growth-status">{leadStatuses[l.status]}</span><button className="btn" onClick={() => startEdit('leads', l)}>עדכון טיפול</button></div>)}
          {!data.leads.filter(l => filter === 'all' || l.status === filter).length && <Empty text="אין פניות להצגה. אפשר להוסיף דיווח ידני ללא פרטי קשר." />}
        </Panel>}
        {tab === 'tasks' && <Panel title="שיפורים ותוכן" action={<button className="btn" onClick={() => startEdit('tasks')}><Plus />משימה</button>}>
          {data.tasks.map(t => <article className="growth-task" key={t.id}><div className="growth-item"><div><strong>{t.title}</strong><small>{t.owner || 'ללא אחראי'} · {t.due_at ? formatDateTime(t.due_at) : 'ללא מועד'} · {t.priority === 'high' ? 'עדיפות גבוהה' : 'עדיפות רגילה'}</small></div><span className="growth-status">{taskStatuses[t.status]}</span><button className="btn" onClick={() => startEdit('tasks', t)}>עדכון</button></div>
            {t.hypothesis && <p className="growth-note">{t.hypothesis}</p>}
            {t.impact && <div className="growth-impact">{t.impact.ready ? <><strong>{metrics[t.metric]}: {num(t.impact.before)} לפני ← {num(t.impact.after)} אחרי</strong><span>{t.impact.days} ימים בכל צד · ביקורים: {num(t.impact.sessions_before)} לפני / {num(t.impact.sessions_after)} אחרי{t.impact.confidence === 'low_sample' ? ' · מדגם קטן' : ''}</span><Hint text={t.impact.caveat} /></> : t.impact.reason}</div>}
          </article>)}{!data.tasks.length && <Empty text="הוסיפו משימת תוכן או שיפור. סימון כפורסם מתחיל השוואת לפני ואחרי." />}
        </Panel>}
        {tab === 'campaigns' && <Panel title="קישורים ומדידת קמפיינים" hint="השיוך הוא למקור בתחילת הביקור. פניות ישויכו לקמפיין רק לאחר עדכון מפורש על בסיס מידע ידוע." action={<button className="btn" onClick={() => startEdit('campaigns')}><Plus />קמפיין</button>}>
          {data.campaigns.map(c => <article className="growth-task" key={c.id}><div className="growth-item"><div><strong>{c.name}</strong><small>{c.source} · {c.medium}</small></div><span>{num(c.sessions)} ביקורים · {num(c.contacts)} עם קשר · {num(c.attributed_leads)} פניות משויכות</span><button className="btn" onClick={() => startEdit('campaigns', c)}>עריכה</button></div><div className="growth-link"><a dir="ltr" href={c.url} target="_blank" rel="noopener noreferrer">{c.url}</a><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(c.url); notify('הקישור הועתק'); } catch { notify('אפשר לסמן ולהעתיק את הקישור ידנית', true); } }}><Copy />העתקת קישור</button></div>{c.cost !== null && <p className="muted">תקציב מדווח: {num(c.cost)} ₪ לכל הקמפיין. ההיקפים מעל מתייחסים לטווח שנבחר.</p>}</article>)}
          {!data.campaigns.length && <Empty text="צרו קישור מסומן לפוסט, מודעה או קוד QR. אין צורך בחיבור לחשבון פרסום." />}
        </Panel>}
        {tab === 'activity' && <Panel title="יומן עבודה פנימי"><div className="growth-list">{data.activity.map(a => <div className="growth-item" key={a.id}><div><strong>{a.summary}</strong><small>{a.actor}</small></div><time>{formatDateTime(a.occurred_at)}</time></div>)}</div>{!data.activity.length && <Empty text="שינויים במטרות, בפניות ובמשימות יתועדו כאן" />}</Panel>}
        {tab === 'share' && <ShareDraft key={`${id}:${days}`} id={id} days={days} notify={notify} />}
      </>}
    </>}</DataState>
  </div>;
}
