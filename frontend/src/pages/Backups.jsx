import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react';
import { DataState, Empty, Panel, PageHead, Stat, StatRow } from '../components/AnalyticsParts';
import OpsTabs from '../components/OpsTabs';
import { apiFetch } from '../lib/api';
import { formatAgo, formatDateTime, formatNumber } from '../lib/format';

const bytes = (value) => {
  if (!value) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
};
const certificateTone = (days) => days == null ? 'is-danger' : days < 7 ? 'is-danger' : days < 21 ? 'is-attention' : '';

export default function Backups() {
  const [data, setData] = useState(null);
  const [certs, setCerts] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [backups, certificates] = await Promise.all([apiFetch('/apps/backups'), apiFetch('/apps/certificates').catch(() => null)]);
      setData(backups); setCerts(certificates); setLoadedAt(Date.now()); setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const latest = data?.snapshots?.[0];
  const fresh = latest && loadedAt - Date.parse(latest.created) < 36 * 3600000;
  const certificates = [...(certs?.certificates || [])].sort((a, b) => (a.days_left ?? -1) - (b.days_left ?? -1));

  return (
    <div className="page page--infrastructure page--backups">
      <PageHead title="תפעול" meta={<span className="muted">גיבויים ותעודות</span>}>
        <button type="button" className="icon-btn" onClick={load} aria-label="רענון" title="רענון"><RefreshCw className={loading ? 'is-spinning' : ''} aria-hidden="true" /></button>
      </PageHead>
      <OpsTabs />
      <DataState loading={loading && !data} error={error} onRetry={load}>
        {data?.failure && <div className="banner banner--error" role="alert"><b>התחזוקה הלילית נכשלה</b> <span dir="ltr">{data.failure.error}</span></div>}
        <StatRow label="גיבויים">
          <Stat label="גיבוי מאומת אחרון" value={latest ? formatAgo(latest.created) : '—'} tone={fresh ? 'forest' : 'vermilion'} foot={latest ? `${latest.files} קבצים · ${bytes(latest.bytes)}` : 'אין גיבוי'} />
          <Stat label="הועתק למחשב" value={latest ? (latest.copied_to_pc ? 'כן' : 'עדיין לא') : '—'} hint="המחשב המקומי מאשר כל גיבוי שהעתיק; גיבוי ללא אישור קיים רק בשרת." />
          <Stat label="פונה בלילה האחרון" value={data?.last_run ? bytes(Math.max(0, data.last_run.freed_bytes)) : '—'} foot={data?.last_run ? `${formatNumber(data.last_run.removed)} פריטים` : undefined} />
        </StatRow>
        <div className="grid grid--1-1">
          <Panel title="גיבויים לילים" hint="מסדי נתונים וקבצים שגובו ונבדקו בכל לילה ב־03:00. נשמרים שבעה ימים, ויותר אם לא הועתקו למחשב." bleed>
            {data?.snapshots?.length ? (
              <ul className="backup-list">
                {data.snapshots.map((snapshot) => (
                  <li key={snapshot.name}>
                    <button type="button" aria-expanded={open === snapshot.name} onClick={() => setOpen(open === snapshot.name ? null : snapshot.name)}>
                      <span><b>{formatDateTime(snapshot.created)}</b><small>{snapshot.files} קבצים</small></span>
                      <bdi dir="ltr">{bytes(snapshot.bytes)}</bdi>
                      {snapshot.copied_to_pc
                        ? <CircleCheck className="is-healthy" role="img" aria-label="הועתק למחשב" />
                        : <TriangleAlert className="is-attention" role="img" aria-label="לא הועתק למחשב" />}
                    </button>
                    {open === snapshot.name && (
                      <ul className="backup-files">
                        {snapshot.contents.map((file) => <li key={file.name}><span dir="ltr">{file.name}</span><bdi dir="ltr">{bytes(file.bytes)}</bdi></li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : <Empty text="לא נמצאו גיבויים" />}
          </Panel>
          <Panel title="גיבויים נוספים" hint="גיבויים שהמערכות יוצרות בעצמן, מחוץ לגיבוי הלילי." bleed>
            {data?.other?.length ? (
              <ul className="backup-list">
                {data.other.map((item) => {
                  const stale = !item.latest || loadedAt - Date.parse(item.latest) > 36 * 3600000;
                  return (
                    <li key={item.name}><div className="backup-row">
                      <span><b>{item.name}</b><small>{item.count} קבצים</small></span>
                      <span className={stale ? 'is-attention' : ''}>{item.latest ? formatAgo(item.latest) : '—'}</span>
                      <bdi dir="ltr">{bytes(item.bytes)}</bdi>
                    </div></li>
                  );
                })}
              </ul>
            ) : <Empty text="אין גיבויים נוספים" />}
          </Panel>
        </div>
        <Panel title="תעודות SSL" hint="תוקף תעודת האבטחה של כל כתובת. התעודות מתחדשות אוטומטית; פחות מ־21 יום מסומן לבדיקה. נבדק כל שש שעות." bleed>
          {certificates.length ? (
            <ul className="backup-list">
              {certificates.map((cert) => (
                <li key={cert.host}><div className="backup-row">
                  <span><b dir="ltr">{cert.host}</b><small>{cert.valid ? cert.issuer : `לא תקינה: ${cert.error}`}</small></span>
                  <span className={certificateTone(cert.valid ? cert.days_left : null)}>{cert.days_left == null ? '—' : `${formatNumber(cert.days_left)} ימים`}</span>
                  <span className="muted">{cert.expires ? formatDateTime(cert.expires) : ''}</span>
                </div></li>
              ))}
            </ul>
          ) : <Empty text={certs ? 'אין תעודות לבדיקה' : 'בדיקת התעודות לא נטענה'} />}
          {certs?.checked && <p className="status-line">נבדק {formatDateTime(certs.checked)}</p>}
        </Panel>
      </DataState>
    </div>
  );
}
