import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Plus, QrCode, Trash2 } from 'lucide-react';
import { Empty, IconAction, Panel } from './AnalyticsParts';
import LinkGuide from './LinkGuide';
import { apiFetch, rangeQuery } from '../lib/api';
import { formatNumber, formatDateTime } from '../lib/format';
import { getSessionSnapshot } from '../lib/session';

const SHORT_CODES = { whatsapp: 'wa', facebook: 'fb', instagram: 'ig', tiktok: 'tt', google_business: 'g', email: 'mail', sms: 'sms', qr: 'qr', linkedin: 'in', youtube: 'yt', telegram: 'tg' };
const share = (part, total) => (total ? Math.round((part / total) * 100) : 0);

/** Channels, campaigns and referring sites for one site, from the anonymous action tracker. */
export function SourcesPanel({ appId, range }) {
  const [snapshot, setData] = useState(null);
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');
  const requestKey = `${appId}:${rangeQuery(range)}:${campaign}:${content}`;
  const data = snapshot?._key === requestKey ? snapshot : null;
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    apiFetch(`/visitor-analytics/apps/${appId}/sources?${rangeQuery(range)}&campaign=${encodeURIComponent(campaign)}&content=${encodeURIComponent(content)}`, { signal: controller.signal })
      .then((value) => { if (alive) { setData({...value,_key:requestKey}); setError(''); } })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; controller.abort(); };
  }, [appId, range, campaign, content, requestKey]);
  const top = data?.channels?.[0]?.sessions || 1;
  return (
    <Panel title="איך הגיעו" hint="לפי תגית הקמפיין בקישור, ואם אין כזו לפי האתר שממנו הגיעו. וואטסאפ ואפליקציות רבות לא מוסרות מאיפה הגיעו, ולכן מופיעות כ'ישיר' — בשביל זה יש קישורים למעקב. ביקורים הם משוערים; לחיצת קשר אינה פנייה." bleed>
      {error && <p className="status-line is-attention">{error}</p>}
      <div className="link-form"><label>קמפיין<select value={campaign} onChange={e => {setCampaign(e.target.value);setContent('');}}><option value="">כל הקמפיינים</option>{[...new Set(snapshot?.options?.map(o=>o.campaign).filter(Boolean))].map(v=><option key={v}>{v}</option>)}</select></label><label>פרסום<select value={content} onChange={e=>setContent(e.target.value)}><option value="">כל הפרסומים</option>{[...new Set(snapshot?.options?.filter(o=>!campaign||o.campaign===campaign).map(o=>o.content).filter(Boolean))].map(v=><option key={v}>{v}</option>)}</select></label></div>
      {!data && !error && <p className="status-line">טוען מקורות…</p>}
      {data?.coverage && <p className={`status-line ${data.sessions >= 10 && data.coverage.percent < 70 ? 'is-attention' : ''}`}>
        מקור ידוע ב־{formatNumber(data.coverage.known)} מתוך {formatNumber(data.sessions)} ביקורים שנמדדו למקורות{data.coverage.percent !== null ? ` (${data.coverage.percent}%)` : ''}
        <small> · קישור מתויג: {formatNumber(data.coverage.tagged)} · אתר מפנה: {formatNumber(data.coverage.referrer)} · רשומה ישנה: {formatNumber(data.coverage.legacy)} · לא ידוע: {formatNumber(data.coverage.unknown)}</small>
      </p>}
      {data && !data.sessions && <Empty text="אין עדיין ביקורים עם מקור בטווח הזה" />}
      {data?.sessions > 0 && (
        <>
          <ul className="source-list">
            {data.channels.map((item) => (
              <li key={item.channel} style={{ '--bar': item.sessions / top }}>
                <b>{item.label}</b>
                <span className="source-list__numbers">
                  <strong>{formatNumber(item.sessions)}</strong>
                  <small>{share(item.sessions, data.sessions)}%{item.contacts ? ` · ${formatNumber(item.contacts)} עם לחיצת קשר` : ''}</small>
                </span>
              </li>
            ))}
          </ul>
          {data.campaigns.length > 0 && (
            <div className="source-section">
              <h3>קמפיינים</h3>
              <ul className="source-list source-list--plain">
                {data.campaigns.map((item) => (
                  <li key={`${item.channel}:${item.campaign}`}>
                    <b>{item.campaign} <small>· {item.label}</small></b>
                    <span className="source-list__numbers"><strong>{formatNumber(item.sessions)}</strong>{item.contacts > 0 && <small>{formatNumber(item.contacts)} עם לחיצת קשר</small>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.referrals.length > 0 && (
            <div className="source-section">
              <h3>אתרים שהפנו</h3>
              <ul className="source-list source-list--plain">
                {data.referrals.map((item) => <li key={item.host}><b dir="ltr">{item.host}</b><span className="source-list__numbers"><strong>{formatNumber(item.sessions)}</strong></span></li>)}
              </ul>
            </div>
          )}
          {data.placements?.length > 0 && <div className="source-section"><h3>פרסומים וקישורים</h3><ul className="source-list source-list--plain">{data.placements.map(item => <li key={`${item.channel}:${item.campaign}:${item.content}`}><b><bdi>{item.content}</bdi><small> · {item.label} · <bdi>{item.campaign}</bdi></small></b><span className="source-list__numbers"><strong>{formatNumber(item.sessions)}</strong><small>{formatNumber(item.contacts)} עם לחיצת קשר</small></span></li>)}</ul></div>}
        </>
      )}
      {data && <div className="source-section"><h3>תוצאות ב־Desk</h3>
        <p className="status-line">{data.desk?.status === 'ok' ? `נבדק ${formatDateTime(data.desk.checked_at)}` : 'מקור הפניות אינו זמין — אין להסיק שאין פניות'}</p>
        <ul className="source-list source-list--plain">{data.outcomes?.map(item => <li key={`${item.source}:${item.campaign}:${item.content}:${item.stage}`}><b><bdi>{item.source || 'מקור לא ידוע'}</bdi><small> · <bdi>{item.campaign} {item.content}</bdi></small></b><span className="source-list__numbers"><strong>{formatNumber(item.count)}</strong><small>{({submitted:'טפסים שנשלחו',received:'פניות שהתקבלו',qualified:'פניות מתאימות',customer:'לקוחות עם תשלום',lost:'לא התקדם'})[item.stage]}</small></span></li>)}</ul>
        {data.desk?.status === 'ok' && !data.outcomes?.length && <Empty text="אין תוצאות מ־Desk בטווח שנבחר" />}
        <p className="status-line">לחיצות וטפסים אינם אישור להודעת וואטסאפ. התוצאות משויכות למועד הפנייה; תשלום לפי התיק המקושר.</p>
      </div>}
      {data?.bursts?.length > 0 && <details className="source-section"><summary>פתיחות סמוכות שדורשות בדיקה</summary><ul className="source-list source-list--plain">{data.bursts.map((b,i)=><li key={i}><b><bdi>{formatDateTime(b.second+'Z')}</bdi> · <bdi>{b.source || 'מקור לא ידוע'}</bdi></b><span>{formatNumber(b.signals)} ביקורים באותה שנייה</span></li>)}</ul><p className="status-line">הקיבוץ בזמן אינו הוכחה לאוטומציה. הרשומות נשמרו ולא סוננו על בסיס הזמן בלבד.</p></details>}
      {data?.recent?.length > 0 && <details className="source-section"><summary>פעילות ומקורות לפי זמן</summary><ul className="source-list source-list--plain">{data.recent.map((item,i) => <li key={i}><b><bdi>{formatDateTime(item.occurred_at)}</bdi><small> · {({tagged:'קישור מתויג',referrer:'אתר מפנה',unknown:'לא ידוע'})[item.evidence] || 'רשומה ישנה'} · <bdi>{item.source || 'לא ידוע'}</bdi></small><small><bdi>{item.path}</bdi> · <bdi>{item.campaign} {item.content}</bdi></small></b><span>{({page_view:'פתיחת עמוד',contact_click:'לחיצת קשר',form_submit:'ניסיון שליחה',form_start:'התחלת טופס'})[item.event_type] || 'פעולה'}</span></li>)}</ul><p className="status-line">30 הפעולות האחרונות · שעון ישראל · קישור שהועבר הלאה שומר את תגית הפרסום המקורי.</p></details>}
    </Panel>
  );
}

function LinkRow({ link, canEdit, onRemove }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(link.short_url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };
  const toggleQr = async () => setQr(qr ? '' : await QRCode.toDataURL(link.short_url, { errorCorrectionLevel: 'M', margin: 3, width: 220 }));
  return (
    <li>
      <div className="link-row">
        <span className="link-row__main">
          <b dir="ltr">{link.short_url.replace('https://', '')}</b>
          <small>{link.label}{link.campaign ? ` · ${link.campaign}` : ''}{link.path !== '/' ? ` · ${link.path}` : ''}</small>
        </span>
        <span className="link-row__numbers" title="לחיצות על הקישור (ללא בוטים ותצוגות מקדימות) · ביקורים שנמדדו באתר">
          <strong>{formatNumber(link.clicks_30d)}</strong><small>לחיצות, 30 יום</small>
        </span>
        <span className="link-row__numbers"><strong>{formatNumber(link.sessions)}</strong><small>ביקורים לפי קוד{link.contacts ? ` · ${formatNumber(link.contacts)} קשר` : ''}</small></span>
        <span className="link-row__actions">
          <IconAction icon={copied ? Check : Copy} label={copied ? 'הועתק' : `העתקת ${link.short_url}`} onClick={copy} />
          <IconAction icon={QrCode} label={qr ? 'הסתרת קוד QR' : 'קוד QR להדפסה'} onClick={toggleQr} />
          {canEdit && <IconAction icon={Trash2} label={`מחיקת הקישור ${link.code}`} onClick={() => onRemove(link)} />}
        </span>
      </div>
      {qr && (
        <div className="link-qr">
          <img src={qr} width="220" height="220" alt={`קוד QR ל־${link.short_url}`} />
          <a className="btn" href={qr} download={`qr-${link.code}.png`}>הורדה</a>
        </div>
      )}
    </li>
  );
}

/** Short links per channel, e.g. lawebs.co.il/l/wa for WhatsApp, with clicks, visits and QR. */
export function LinksPanel({ appId, siteUrl }) {
  const [data, setData] = useState({ links: [], channels: [] });
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const user = getSessionSnapshot();
  const canEdit = ['owner', 'editor'].includes(user?.role) && !user?.service;
  const basePath = (() => { try { return new URL(siteUrl).pathname; } catch { return '/'; } })();
  const load = useCallback(async () => {
    try { setData(await apiFetch(`/visitor-analytics/links?app_id=${appId}`)); }
    catch (e) { setError(e.message); }
  }, [appId]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  const choose = async (channel) => {
    const value = await apiFetch(`/visitor-analytics/links?app_id=${appId}&channel=${channel}`).catch(() => null);
    // The server suggestion avoids codes already in use; the local short form covers a failed lookup.
    setForm((current) => ({ ...current, channel, code: value?.suggestion || SHORT_CODES[channel] || current.code }));
  };
  const open = async () => { setError(''); setForm({ channel: 'whatsapp', code: '', campaign: '', path: basePath,medium:'link' }); await choose('whatsapp'); };
  const save = async (event) => {
    event.preventDefault();
    try {
      const result = await apiFetch('/visitor-analytics/links', { method: 'POST', body: JSON.stringify({ app_id: appId, ...form }) });
      setData((current) => ({ ...current, links: result.links })); setForm(null); setError('');
    } catch (e) { setError(e.message); }
  };
  const remove = async (link) => {
    if (!window.confirm(`למחוק את ${link.short_url}? קישורים שכבר פורסמו יובילו לדף הבית של האתר.`)) return;
    try { await apiFetch(`/visitor-analytics/links/${link.id}`, { method: 'DELETE' }); load(); }
    catch (e) { setError(e.message); }
  };
  return (
    <Panel title="קישורים למעקב" hint="קישור קצר על הדומיין של האתר. מי שלוחץ מגיע לאתר הרגיל, והמוניטור יודע מאיזה ערוץ הגיע. קישור נפרד לכל ערוץ או קמפיין, למשל וואטסאפ, פייסבוק או קוד QR על פלייר."
      action={canEdit && !form ? <button type="button" className="btn btn--primary" onClick={open}><Plus aria-hidden="true" /> קישור חדש</button> : null} bleed>
      {form && (
        <form className="link-form" onSubmit={save}>
          <label>ערוץ
            <select value={form.channel} onChange={(e) => choose(e.target.value)}>
              {data.channels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label>הקישור
            <span className="link-form__code" dir="ltr">
              <span>{(() => { try { return new URL(siteUrl).host; } catch { return ''; } })()}/l/</span>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })} required maxLength={24} pattern="[a-z0-9][a-z0-9-]*" aria-label="קוד הקישור" />
            </span>
          </label>
          <label>קמפיין (לא חובה)<input value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} maxLength={60} placeholder="למשל: מבצע חגים" /></label>
          <label>סוג הפרסום<select value={form.medium} onChange={e=>setForm({...form,medium:e.target.value})}>{[['link','קישור רגיל'],['social','פרסום אורגני'],['paid_social','פרסום ממומן'],['messaging','הודעה'],['email','דוא״ל'],['qr','קוד QR']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label>עמוד יעד<input dir="ltr" value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} required maxLength={200} /></label>
          <div className="btn-group">
            <button className="btn btn--primary">יצירה</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>ביטול</button>
          </div>
        </form>
      )}
      {error && <p className="status-line is-attention" role="alert">{error}</p>}
      {data.links.length ? <ul className="link-list">{data.links.map((link) => <LinkRow key={link.id} link={link} canEdit={canEdit} onRemove={remove} />)}</ul>
        : !form && <Empty text="עדיין אין קישורים למעקב" />}
      {!form && <div className="link-guide-entry"><LinkGuide siteUrl={siteUrl} /></div>}
    </Panel>
  );
}
