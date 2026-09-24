/* Anonymous action counters. Never read field values, names, text or full URLs. */
(() => {
  if (window.__veeGrowthTracker) return;
  window.__veeGrowthTracker = true;
  const script = document.currentScript;
  const prefix = script?.dataset.prefix || '';
  const endpoint = `${prefix}/.well-known/vee-growth-signal`;
  const portfolio = /^(www\.)?lawebs\.co\.il$/.test(location.hostname) && !prefix;
  const liveSites = { koral: 'https://lawebs.co.il/koralevents', miryam: 'https://miryamzelig.co.il', pinhas: 'https://pinhasratzon.co.il', libi: 'https://www.libidiamonds.co.il', reuven: 'https://www.dfusreuven.co.il', sos: 'https://sosbaderech.co.il', seder: 'https://lawebs.co.il/seder', pdf: 'https://vee-app.co.il/pdf-studio' };
  const projects = new Set(['koral', 'miryam', 'pinhas', 'libi', 'reuven', 'sos', 'seder', 'pdf']);
  const projectAt = path => { const name = path.match(/^\/work\/([^/]+)\/?$/)?.[1]; return projects.has(name) ? name : ''; };
  const placementAt = el => el?.closest('.wa-float') ? 'floating' : el?.closest('header') ? 'header' : el?.closest('footer') ? 'footer' : el?.closest('#contact') ? 'contact' : el?.closest('.hero') ? 'hero' : 'content';
  const storageKey = `vee.growth:${prefix || '/'}`;
  const random = () => crypto.randomUUID();
  const safeTag = value => /^[\p{L}\p{N}_. -]{1,80}$/u.test(value || '') ? value : '';
  let session, visitor, attribution;
  try {
    const previous = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    session = previous?.expires > Date.now() ? previous.session : random();
    visitor = session;
    const query = new URLSearchParams(location.search);
    attribution = previous?.session === session ? previous.attribution : null;
    if (!attribution) {
      let referrer = '';
      try { const ref = new URL(document.referrer); if (ref.hostname !== location.hostname) referrer = ref.hostname; } catch { /* no referrer */ }
      attribution = { source: safeTag(query.get('utm_source')) || safeTag(referrer),
        medium: safeTag(query.get('utm_medium')), campaign: safeTag(query.get('utm_campaign')) };
    }
    sessionStorage.setItem(storageKey, JSON.stringify({ session, attribution, expires: Date.now() + 30 * 60000 }));
  } catch { session = visitor = random(); attribution = {}; }
  const started = new WeakSet();
  const last = new Map();
  const validPath = () => (!prefix || location.pathname === prefix || location.pathname.startsWith(prefix + '/'))
    && !/(?:^|\/)(?:admin|login|dashboard|account|checkout)(?:\/|$)/i.test(location.pathname);
  function send(type, label = '', element = null, project = '') {
    if (!validPath()) return;
    if (portfolio && document.cookie.split(';').some(c => c.trim() === 'monitor_internal=1')) return;
    const placement = portfolio ? placementAt(element) : '';
    const signature = `${type}:${label}:${location.pathname}:${placement}:${project}`;
    if (Date.now() - (last.get(signature) || 0) < 1000) return;
    last.set(signature, Date.now());
    fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        kind: 'growth', event_id: random(), visitor_id: visitor, session_id: session,
        path: location.pathname, event_type: type, label, ...attribution,
        placement, project: portfolio ? project || projectAt(location.pathname) : '',
        device: innerWidth < 768 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop', webdriver: navigator.webdriver === true
      }) }).catch(() => {});
  }
  function contactForm(element) {
    const form = element?.closest?.('form');
    if (!form || form.querySelector('input[type="password"]')) return null;
    return form.querySelector('input[type="tel"],input[type="email"],textarea') ? form : null;
  }
  document.addEventListener('focusin', event => {
    const form = contactForm(event.target);
    if (form && !started.has(form)) { started.add(form); send('form_start', 'form'); }
  }, true);
  document.addEventListener('submit', event => { if (contactForm(event.target)) send('form_submit', 'form'); }, true);
  document.addEventListener('invalid', event => { if (contactForm(event.target)) send('form_error', 'form'); }, true);
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (/^tel:/i.test(href)) send('contact_click', 'phone', link);
    else if (/^mailto:/i.test(href)) send('contact_click', 'email', link);
    else if (/^(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i.test(href)) send('contact_click', 'whatsapp', link);
    else if (portfolio) {
      try {
        const url = new URL(href, location.href);
        if (url.origin === location.origin && projectAt(url.pathname)) send('project_open', 'link', link, projectAt(url.pathname));
        else if ((url.origin + url.pathname).replace(/\/$/, '').toLowerCase() === liveSites[projectAt(location.pathname)]?.toLowerCase()) send('outbound_click', 'link', link);
      } catch { /* not a navigation URL */ }
    }
  }, true);
  // An app may explicitly report a visible success, but this never verifies a lead.
  addEventListener('vee:form-success', () => send('form_success_observed', 'form'));
  let path = '';
  function navigation() { if (path !== location.pathname) { path = location.pathname; send('page_view'); } }
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) { const result = original.apply(this, args); queueMicrotask(navigation); return result; };
  }
  addEventListener('popstate', navigation);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', navigation, { once: true });
  else navigation();
})();
