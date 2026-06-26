// MSL Service Worker - Push notifications only, NO caching
// This SW does NOT intercept any fetch requests - all network goes directly

self.addEventListener('push', function(event) {
  var data = { title: '新通知', body: '', url: '/' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/logo-192.png',
      badge: data.badge || '/logo-64.png',
      data: { url: data.url || '/' },
      tag: data.tag || 'msl-push',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = event.notification.data && event.notification.data.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.includes(self.registration.scope) && 'focus' in clients[i]) {
          clients[i].navigate(url);
          return clients[i].focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
