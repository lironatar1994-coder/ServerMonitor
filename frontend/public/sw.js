/* Push notifications only: no fetch handler and no caching, so every screen always loads fresh. */
const BASE = '/serve-monitor/';

self.addEventListener('push', (event) => {
  let data;
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const url = typeof data.url === 'string' && data.url.startsWith(BASE) ? data.url : `${BASE}infrastructure`;
  event.waitUntil(self.registration.showNotification(data.title || 'Server Monitor', {
    body: data.body || '', icon: `${BASE}icon-192.png`, badge: `${BASE}icon-192.png`,
    lang: 'he', dir: 'rtl', tag: 'server-monitor-alert', renotify: true, data: { url }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || BASE, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((client) => client.url.startsWith(self.location.origin + BASE));
    if (open) return open.navigate(url).then((client) => (client || open).focus());
    return self.clients.openWindow(url);
  }));
});
