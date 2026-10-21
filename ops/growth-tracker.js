/* Anonymous action counters. Never read field values, names, text or full URLs. */
(() => {
  if (window.__veeGrowthTracker) return;
  window.__veeGrowthTracker = true;
  const script = document.currentScript;
  const prefix = script?.dataset.prefix || '';
  const endpoint = `${prefix}/.well-known/vee-growth-signal`;
  const portfolio = /^(www\.)?lawebs\.co\.il$/.test(location.hostname) && !prefix;
  // Native collectors share this host-wide flag; the monitor also drops flagged requests server-side.
  const internalParam = new URLSearchParams(location.search).get('monitor_internal');
  if (internalParam === '1' || internalParam === '0') {
    document.cookie = `monitor_internal=${internalParam}; Path=/; Max-Age=${internalParam === '1' ? 31536000 : 0}; Secure; SameSite=Lax`;
  }
  const liveSites = { koral: 'https://lawebs.co.il/koralevents', miryam: 'https://miryamzelig.co.il', pinhas: 'https://pinhasratzon.co.il', reuven: 'https://www.dfusreuven.co.il', sos: 'https://sosbaderech.co.il', seder: 'https://lawebs.co.il/seder', pdf: 'https://lawebs.co.il/pdf-studio', pizza: 'https://lawebs.co.il/PizzaManager' };
  const projects = new Set(['koral', 'miryam', 'pinhas', 'reuven', 'sos', 'seder', 'pdf', 'pizza']);
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
  // Core Web Vitals, once per page load, whichever monitor script runs first. Numbers only.
  if (!window.__veeVitals && 'PerformanceObserver' in window && !document.cookie.split(';').some(c => c.trim() === 'monitor_internal=1')) {
    window.__veeVitals = true;
    const vitals = { lcp: null, inp: null, cls: 0, ttfb: null };
    const watch = (type, handle, options = {}) => { try { new PerformanceObserver(list => list.getEntries().forEach(handle)).observe({ type, buffered: true, ...options }); } catch { /* unsupported */ } };
    watch('largest-contentful-paint', entry => { vitals.lcp = entry.startTime; });
    watch('event', entry => { if (entry.interactionId) vitals.inp = Math.max(vitals.inp || 0, entry.duration); }, { durationThreshold: 40 });
    let windowValue = 0, windowStart = 0, windowLast = 0;
    watch('layout-shift', entry => {
      if (entry.hadRecentInput) return;
      if (entry.startTime - windowLast > 1000 || entry.startTime - windowStart > 5000) { windowValue = 0; windowStart = entry.startTime; }
      windowValue += entry.value; windowLast = entry.startTime; vitals.cls = Math.max(vitals.cls, windowValue);
    });
    try { vitals.ttfb = performance.getEntriesByType('navigation')[0]?.responseStart || null; } catch { /* unsupported */ }
    let sent = false;
    const flush = () => {
      if (sent || document.visibilityState !== 'hidden' || vitals.lcp == null) return;
      sent = true;
      const width = innerWidth;
      fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'vitals', event_id: crypto.randomUUID(), path: location.pathname, lcp: vitals.lcp, inp: vitals.inp,
          cls: Math.round(vitals.cls * 1000) / 1000, ttfb: vitals.ttfb, viewport_class: width < 768 ? 'mobile' : width < 1100 ? 'tablet' : 'desktop',
          webdriver: navigator.webdriver === true }) }).catch(() => {});
    };
    addEventListener('visibilitychange', flush);
    addEventListener('pagehide', () => { if (document.visibilityState !== 'hidden') return; flush(); });
  }
  // First real interaction on this page: lets visits from hosting networks (VPNs, offices) count.
  const interactionEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
  const interacted = () => {
    interactionEvents.forEach(type => removeEventListener(type, interacted, true));
    fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'interaction', scope: 'growth', event_id: crypto.randomUUID(), session_id: session, webdriver: navigator.webdriver === true }) }).catch(() => {});
  };
  interactionEvents.forEach(type => addEventListener(type, interacted, { capture: true, passive: true }));
  const started = new WeakSet();
  const last = new Map();
  const validPath = () => (!prefix || location.pathname === prefix || location.pathname.startsWith(prefix + '/'))
    && !/(?:^|\/)(?:admin|login|dashboard|account|checkout)(?:\/|$)/i.test(location.pathname);
  function send(type, label = '', element = null, project = '') {
    if (!validPath()) return;
    if (document.cookie.split(';').some(c => c.trim() === 'monitor_internal=1')) return;
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
