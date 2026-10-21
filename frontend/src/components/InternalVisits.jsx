import { useEffect, useState } from 'react';
import { EyeOff, Eye } from 'lucide-react';
import { Panel, Empty } from './AnalyticsParts';
import { apiFetch } from '../lib/api';
import { safeSiteUrl } from '../lib/siteLinks';

// One row per public domain: the flag is a per-domain cookie in this browser only.
const domainsOf = (apps) => {
  const domains = new Map();
  for (const app of apps) {
    const safe = app.analytics_enabled ? safeSiteUrl(app.url) : null;
    if (!safe) continue;
    const url = new URL(safe);
    const host = url.hostname.replace(/^www\./, '');
    const entry = domains.get(host) || { host, origin: url.origin, root: null, names: [] };
    entry.names.push(app.name);
    if (url.pathname === '/') entry.root = url.origin;
    domains.set(host, entry);
  }
  return [...domains.values()].sort((a, b) => b.names.length - a.names.length || a.host.localeCompare(b.host));
};

const open = (origin, value) => window.open(`${origin}/?monitor_internal=${value}`, '_blank', 'noopener,noreferrer');

export default function InternalVisits() {
  const [domains, setDomains] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiFetch('/apps').then(apps => setDomains(domainsOf(apps))).catch(e => setError(e.message));
  }, []);
  return (
    <Panel title="ביקורים פנימיים" hint="סימון פותח את האתר פעם אחת ושומר בדפדפן הזה סימון לשנה. ביקורים מהדפדפן המסומן לא נספרים, גם לא ביומן השרת. אפשר לבטל בכל רגע. קישורי 'פתיחת האתר' במוניטור כבר מסמנים אוטומטית.">
      {error && <div className="banner banner--error" role="alert">{error}</div>}
      {domains && !domains.length && <Empty text="אין אתרים במדידה" />}
      {domains?.length > 0 && (
        <ul className="internal-domains">
          {domains.map(item => (
            <li key={item.host}>
              <span>
                <b dir="ltr">{item.host}</b>
                <small>{item.names.join(' · ')}</small>
              </span>
              <span className="btn-group">
                <button type="button" className="btn" onClick={() => open(item.root || item.origin, 1)} aria-label={`סימון הדפדפן כפנימי ב־${item.host}`}><EyeOff aria-hidden="true" /> סימון</button>
                <button type="button" className="btn" onClick={() => open(item.root || item.origin, 0)} aria-label={`ביטול הסימון ב־${item.host}`}><Eye aria-hidden="true" /> ביטול</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
