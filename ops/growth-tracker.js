/* Anonymous action counters. Never read field values, names, text or full URLs. */
(() => {
  if (window.__veeGrowthTracker) return;
  window.__veeGrowthTracker = true;
  const script = document.currentScript;
  const prefix = script?.dataset.prefix || '';
  const endpoint = `${prefix}/.well-known/vee-growth-signal`;
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
  function send(type, label = '') {
    if (!validPath()) return;
    const signature = `${type}:${label}:${location.pathname}`;
    if (Date.now() - (last.get(signature) || 0) < 1000) return;
    last.set(signature, Date.now());
    fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        kind: 'growth', event_id: random(), visitor_id: visitor, session_id: session,
        path: location.pathname, event_type: type, label, ...attribution,
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
    if (/^tel:/i.test(href)) send('contact_click', 'phone');
    else if (/^mailto:/i.test(href)) send('contact_click', 'email');
    else if (/^(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i.test(href)) send('contact_click', 'whatsapp');
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
