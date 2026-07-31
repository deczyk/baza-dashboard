// Service worker Deczboarda - jedyny cel: odbierać Web Push z serwera i
// pokazywać go jako natywne powiadomienie systemowe, nawet gdy karta/apka
// nie jest aktywna na pierwszym planie. Bez tego telefon (i komputer, gdy
// okno nie jest w fokusie) nigdy by nie zobaczył powiadomienia.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Deczboard', body: 'Masz nowe powiadomienie.' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag || 'deczboard',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // silent: true - bez dźwięku/wibracji (np. subtelne "Debrain odpowiedział"), zamiast
      // traktować każde powiadomienie tak samo alarmująco jak np. przypomnienie o nawykach.
      silent: payload.silent === true,
      data: { url: '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    }),
  );
});
