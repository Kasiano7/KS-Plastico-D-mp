/**
 * Service worker minimal — sa seule raison d'être est de recevoir les
 * notifications Web Push (§ server/notifications/push-provider.ts). Pas de
 * cache, pas de mode hors-ligne : ce n'est pas son rôle ici.
 */

self.addEventListener('push', (event) => {
  let payload = { title: 'KS Plastico Demo', body: '' };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    payload.body = event.data ? event.data.text() : '';
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'KS Plastico Demo', {
      body: payload.body,
      icon: '/icon.svg',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
