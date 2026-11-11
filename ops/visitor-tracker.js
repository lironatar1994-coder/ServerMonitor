/* Anonymous navigation, page-speed numbers and script error counts only. No forms, query strings, document contents or secrets. */
(() => {
  const script = document.currentScript;
  const prefix = script?.dataset.prefix || '';
  // A page family outside one folder (Alenu's /miluim*) is its own site: own endpoint and identity.
  const scope = /^[a-z0-9-]{1,32}$/.test(script?.dataset.scope || '') ? script.dataset.scope : '';
  const trackerKey = `monitor.navigation:${scope || prefix || '/'}`;
  window.__monitorNavigationTrackers ||= new Set();
  if (window.__monitorNavigationTrackers.has(trackerKey)) return;
  window.__monitorNavigationTrackers.add(trackerKey);
  const endpoint = /^\/\.well-known\/vee-visitor-signal(?:-[a-z0-9-]{1,32})?$/.test(script?.dataset.endpoint || '')
    ? script.dataset.endpoint : `${prefix}/.well-known/vee-visitor-signal`;
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
  // Uncaught errors in this site's own scripts: at most three per page, name and message only (no stack).
  if (!window.__veeErrors) {
    window.__veeErrors = true;
    const reported = new Set();
    const report = (name, message, source, line) => {
      const key = `${name}|${message}|${source}|${line}`;
      if (!message || reported.size >= 3 || reported.has(key)) return;
      reported.add(key);
      fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'error', event_id: crypto.randomUUID(), path: location.pathname, name, message: String(message).slice(0, 300),
          source, line, webdriver: navigator.webdriver === true }) }).catch(() => {});
    };
    addEventListener('error', (event) => {
      if (!(event instanceof ErrorEvent)) return;
      let file;
      try { file = new URL(event.filename || location.href, location.href); } catch { return; }
      if (file.origin !== location.origin) return; // other origins only say "Script error."
      report(event.error?.name || 'Error', event.message, file.pathname.split('/').pop(), event.lineno || null);
    });
    addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      report(reason?.name || 'UnhandledRejection', reason?.message || (typeof reason === 'string' ? reason : ''), '', null);
    });
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
  const key = trackerKey;
  const random = () => crypto.randomUUID();
  function identifier(storageName, name, ttl) {
    try {
      const storage = window[storageName];
      const previous = JSON.parse(storage.getItem(name) || 'null');
      if (previous?.id && previous.expires > Date.now()) return previous.id;
      const value = { id: random(), expires: Date.now() + ttl };
      storage.setItem(name, JSON.stringify(value));
      return value.id;
    } catch { return random(); }
  }
  const visitor = identifier('localStorage', `${key}:visitor`, 30 * 86400000);
  const session = identifier('sessionStorage', `${key}:session`, 86400000);
  window.__monitorNavigationIdentity = () => ({ visitor, session });
  // First real interaction on this page: lets visits from hosting networks (VPNs, offices) count.
  const interactionEvents = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
  let lastInteraction = 0;
  const interacted = (event) => {
    if (!event.isTrusted || document.visibilityState !== 'visible') return;
    if (Date.now() - lastInteraction < 60000) return;
    lastInteraction = Date.now();
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
  if (script?.dataset.engagement === '1') {
    const start = () => engagement();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  /* Opt-in engagement (data-engagement="1"): active seconds, deepest scroll, seconds each page
     section was on screen, and coarse 12x12 click cells. Sent as 15-second deltas for this page
     visit. Never text, form values, recordings or element contents; sections are named by their id. */
  function engagement() {
    let last = performance.now(), activeUntil = last + 30000, dwell = 0, depth = 0;
    let wasVisible = document.visibilityState === 'visible';
    const clicks = new Map(), cells = new Map(), views = new Map(), visible = new Set();
    const named = el => /^[A-Za-z0-9_-]{1,40}$/.test(el?.id || '') ? el.id : '';
    const sections = [...document.querySelectorAll('header, footer, main section[id], body > section[id]')].slice(0, 24);
    const sectionName = el => el.tagName === 'HEADER' ? 'header' : el.tagName === 'FOOTER' ? 'footer' : named(el);
    const zoneAt = target => {
      const section = target?.closest?.('header, footer, section[id]');
      return section ? sectionName(section) || 'content' : 'content';
    };
    function tick() {
      const now = performance.now();
      const elapsed = wasVisible ? Math.max(0, Math.min(now, activeUntil) - last) : 0;
      dwell += elapsed;
      for (const zone of visible) {
        const row = views.get(zone) || { zone, views: 1, dwell_ms: 0 };
        row.dwell_ms += elapsed; views.set(zone, row);
      }
      last = now;
      wasVisible = document.visibilityState === 'visible';
    }
    const activity = () => { tick(); activeUntil = performance.now() + 30000; };
    function scrolled() {
      activity();
      const available = document.documentElement.scrollHeight - innerHeight;
      depth = Math.max(depth, available > 0 ? Math.min(100, Math.round(scrollY / available * 100)) : 100);
    }
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        tick();
        for (const entry of entries) {
          const zone = sectionName(entry.target);
          if (!zone) continue;
          if (entry.isIntersecting) visible.add(zone); else visible.delete(zone);
        }
      }, { threshold: 0.35 });
      sections.forEach(el => { if (sectionName(el)) observer.observe(el); });
    }
    addEventListener('scroll', scrolled, { passive: true });
    for (const type of ['pointerdown', 'keydown', 'touchstart']) addEventListener(type, activity, { passive: true });
    document.addEventListener('click', event => {
      if (!event.isTrusted || event.target.closest?.('input,textarea,select,[contenteditable]')) return;
      const link = event.target.closest?.('a[href]')?.getAttribute('href') || '';
      const kind = /^tel:/i.test(link) ? 'phone:' : /wa\.me|whatsapp\.com/i.test(link) ? 'whatsapp:' : '';
      const zone = (kind + zoneAt(event.target)).slice(0, 64);
      if (clicks.size < 30 || clicks.has(zone)) clicks.set(zone, Math.min(500, (clicks.get(zone) || 0) + 1));
      if (event.detail && cells.size < 60) {
        const x = Math.max(0, Math.min(11, Math.floor(event.clientX / innerWidth * 12)));
        const y = Math.max(0, Math.min(11, Math.floor(event.clientY / innerHeight * 12)));
        const cell = `${x}:${y}`, row = cells.get(cell) || { x, y, taps: 0 };
        row.taps = Math.min(500, row.taps + 1); cells.set(cell, row);
      }
    }, true);
    function flush() {
      tick();
      if (dwell < 1000 && !clicks.size) return;
      if (document.cookie.split(';').some(c => c.trim() === 'monitor_internal=1')) return;
      const body = { kind: 'engagement', event_id: random(), visitor_id: visitor, session_id: session,
        path: location.pathname, scroll_depth: depth, dwell_ms: Math.round(dwell),
        viewport_width: innerWidth, viewport_class: innerWidth < 768 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop',
        webdriver: navigator.webdriver === true, zones: [...clicks].map(([zone, taps]) => ({ zone, taps })),
        views: [...views.values()].slice(0, 24).map(row => ({ ...row, dwell_ms: Math.round(row.dwell_ms) })), heatmap: [...cells.values()] };
      dwell = 0; clicks.clear(); cells.clear(); views.clear();
      fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    }
    setInterval(flush, 15000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
      else { last = performance.now(); activeUntil = last + 30000; wasVisible = true; }
    });
    addEventListener('pagehide', flush);
    scrolled();
  }
})();
