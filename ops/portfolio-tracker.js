/* LA webs only: bounded anonymous engagement, never text, forms or recordings. */
(() => {
  if (!/^(www\.)?lawebs\.co\.il$/.test(location.hostname) || !/^\/(?:work\/(?:koral|miryam|pinhas|libi|reuven|sos|seder|pdf)\/?)?$/.test(location.pathname)) return;
  if (document.cookie.split(';').some(c => c.trim() === 'monitor_internal=1')) return;
  if (window.__portfolioEngagement) return;
  window.__portfolioEngagement = true;
  const id = () => crypto.randomUUID();
  const stored = name => { try { return JSON.parse(sessionStorage.getItem(name) || 'null')?.id; } catch { return null; } };
  const session = stored('monitor.navigation:/:session') || id();
  const visitor = id();
  let last = performance.now(), activeUntil = last + 30000, dwell = 0, depth = 0;
  let wasVisible = document.visibilityState === 'visible';
  const zones = new Map(), cells = new Map(), views = new Map(), visible = new Set();
  const areas = [['hero', '.hero'], ['work', '#work'], ['studio', '#studio'], ['contact', '#contact'], ['project', '.case'], ['more', '#more']];
  const zoneAt = el => el?.closest('.wa-float') ? 'floating-contact' : el?.closest('header') ? 'header' : el?.closest('footer') ? 'footer' : areas.find(([, selector]) => el?.closest(selector))?.[0] || 'content';
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
  function activity() { tick(); activeUntil = performance.now() + 30000; }
  function scroll() {
    activity();
    const available = document.documentElement.scrollHeight - innerHeight;
    depth = Math.max(depth, available > 0 ? Math.min(100, Math.round(scrollY / available * 100)) : 100);
  }
  const observer = new IntersectionObserver(entries => {
    tick();
    for (const entry of entries) {
      const zone = areas.find(([, selector]) => entry.target.matches(selector))?.[0];
      if (!zone) continue;
      if (entry.isIntersecting) visible.add(zone); else visible.delete(zone);
    }
  });
  for (const [, selector] of areas) { const el = document.querySelector(selector); if (el) observer.observe(el); }
  addEventListener('scroll', scroll, { passive: true });
  for (const type of ['pointerdown', 'keydown', 'touchstart']) addEventListener(type, activity, { passive: true });
  document.addEventListener('click', event => {
    if (event.target.closest('input,textarea,select,[contenteditable]')) return;
    const zone = zoneAt(event.target);
    zones.set(zone, Math.min(500, (zones.get(zone) || 0) + 1));
    if (event.detail && cells.size < 60) {
      const x = Math.max(0, Math.min(11, Math.floor(event.clientX / innerWidth * 12)));
      const y = Math.max(0, Math.min(11, Math.floor(event.clientY / innerHeight * 12)));
      const key = `${x}:${y}`, row = cells.get(key) || { x, y, taps: 0 };
      row.taps = Math.min(500, row.taps + 1); cells.set(key, row);
    }
  }, true);
  function flush() {
    tick();
    if (dwell < 1000 && !zones.size) return;
    const body = { kind: 'engagement', event_id: id(), visitor_id: visitor, session_id: session,
      path: location.pathname, scroll_depth: depth, dwell_ms: Math.round(dwell),
      viewport_width: innerWidth, viewport_class: innerWidth < 768 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop',
      webdriver: navigator.webdriver === true, zones: [...zones].map(([zone, taps]) => ({ zone, taps })),
      views: [...views.values()].map(row => ({ ...row, dwell_ms: Math.round(row.dwell_ms) })), heatmap: [...cells.values()] };
    dwell = 0; zones.clear(); cells.clear(); views.clear();
    fetch('/.well-known/vee-visitor-signal', { method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  }
  setInterval(flush, 15000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); else { last = performance.now(); activeUntil = last + 30000; } });
  addEventListener('pagehide', flush);
  scroll();
})();
