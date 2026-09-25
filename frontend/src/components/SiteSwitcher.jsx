import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { rangeSearch } from '../lib/dailyCheck';

export default function SiteSwitcher({ currentId, range }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const [sites, setSites] = useState(null), [error, setError] = useState('');
  const container = useRef(null), trigger = useRef(null), input = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/apps', { signal: controller.signal }).then(rows => setSites(rows.filter(s => s.analytics_enabled))).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = e => { if (!container.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className="site-switcher" ref={container} onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } }}>
    <button className="icon-btn" ref={trigger} aria-label="החלפת אתר" title="החלפת אתר" aria-expanded={open} onClick={() => setOpen(!open)}><ArrowLeftRight aria-hidden="true" /></button>
    {open && <div className="site-switcher__menu"><input ref={input} aria-label="חיפוש אתר להחלפה" placeholder="חיפוש אתר" value={search} onChange={e => setSearch(e.target.value)} />
      {error ? <p role="alert">{error}</p> : !sites ? <p role="status">טוען אתרים…</p> : <ul>{sites.filter(s => `${s.name} ${s.url}`.toLowerCase().includes(search.toLowerCase())).map(site => <li key={site.id}><Link aria-current={String(site.id) === currentId ? 'page' : undefined} to={`/visitors/${site.id}${rangeSearch(range)}`} onClick={() => { setOpen(false); setSearch(''); }}>{site.name}</Link></li>)}</ul>}
      {sites && !sites.some(s => `${s.name} ${s.url}`.toLowerCase().includes(search.toLowerCase())) && <p>אין אתר תואם</p>}
    </div>}
  </div>;
}
