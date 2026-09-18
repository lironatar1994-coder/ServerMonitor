/* Anonymous navigation only. No forms, query strings, document contents or secrets. */
(() => {
  const script = document.currentScript;
  const prefix = script?.dataset.prefix || '';
  const endpoint = `${prefix}/.well-known/vee-visitor-signal`;
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
