/* Anonymous navigation and page-speed numbers only. No forms, query strings, document contents or secrets. */
(() => {
  const script = document.currentScript;
  const prefix = script?.dataset.prefix || '';
  const endpoint = `${prefix}/.well-known/vee-visitor-signal`;
  // ?monitor_internal=1 marks this browser internal for the whole host; =0 clears it.
  const internal = new URLSearchParams(location.search).get('monitor_internal');
  if (internal === '1' || internal === '0') {
    document.cookie = `monitor_internal=${internal}; Path=/; Max-Age=${internal === '1' ? 31536000 : 0}; Secure; SameSite=Lax`;
  }
  if (document.cookie.split(';').some(c => c.trim() === 'monitor_internal=1')) return;
  if (script?.dataset.nativeRewrite === '1') {
    // The legacy Libi preview bundle hard-codes the root API. Keep its existing
    // IDs/navigation logic, but route only this telemetry request to its own site.
    const original = window.fetch;
    window.fetch = function (input, options) {
      if (typeof input === 'string' && input === '/api/visit-signal') input = endpoint;
      return original.call(this, input, options);
    };
    return;
  }
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
  const key = `monitor.navigation:${prefix || '/'}`;
  const random = () => crypto.randomUUID();
  function identifier(storage, name, ttl) {
    try {
      const previous = JSON.parse(storage.getItem(name) || 'null');
      if (previous?.id && previous.expires > Date.now()) return previous.id;
      const value = { id: random(), expires: Date.now() + ttl };
      storage.setItem(name, JSON.stringify(value));
      return value.id;
    } catch { return random(); }
  }
  const visitor = identifier(localStorage, `${key}:visitor`, 30 * 86400000);
  const session = identifier(sessionStorage, `${key}:session`, 86400000);
  // First real interaction on this page: lets visits from hosting networks (VPNs, offices) count.
  const interactionEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
  const interacted = () => {
    interactionEvents.forEach(type => removeEventListener(type, interacted, true));
    fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'interaction', event_id: crypto.randomUUID(), session_id: session, webdriver: navigator.webdriver === true }) }).catch(() => {});
  };
  interactionEvents.forEach(type => addEventListener(type, interacted, { capture: true, passive: true }));
  let lastPath = '';
  function navigation() {
    const path = location.pathname;
    if (prefix && path !== prefix && !path.startsWith(prefix + '/')) return;
    if (path === lastPath) return;
    lastPath = path;
    fetch(endpoint, {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: random(), visitor_id: visitor, session_id: session, path, webdriver: navigator.webdriver === true })
    }).catch(() => {});
  }
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      queueMicrotask(navigation);
      return result;
    };
  }
  addEventListener('popstate', navigation);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', navigation, { once: true });
  else navigation();
})();
