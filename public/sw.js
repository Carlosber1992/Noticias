// Muestra las alertas del panel aunque la app esté cerrada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let a = {};
  try { a = e.data.json(); } catch {}
  const alarm = a.level === 'alarma';
  e.waitUntil(self.registration.showNotification(a.title || 'Yasupo', {
    body: a.body || '', icon: '/icon.png', tag: a.id, requireInteraction: alarm,
    vibrate: alarm ? [400, 150, 400, 150, 600] : [200],
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((c) => (c.length ? c[0].focus() : self.clients.openWindow('/'))));
});
