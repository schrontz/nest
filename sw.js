// Minimaler Service Worker: aktuell nur für Web Push zuständig,
// kein Offline-Caching (das wäre ein eigener, größerer Schritt).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Nest', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Nest';
  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    // Eigenes, einfarbiges Icon mit echter Transparenz für die Statusleiste:
    // Android baut daraus eine Silhouette (nur der Alpha-Kanal zählt), das
    // normale bunte App-Icon dafür sieht dort meist wie ein schwarzer
    // Klecks aus.
    badge: 'icon-badge-96.png',
    data: { url: data.url || './' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
