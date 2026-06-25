import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkOnly, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any[] };

import { skipWaiting, clientsClaim } from 'workbox-core';
skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute((handler: any) => handler.createHandlerBoundToURL('index.html')));

registerRoute(/^https?:\/\/.*\/api\/auth/, new NetworkOnly(), 'GET');
registerRoute(/^https?:\/\/.*\/api\/stores\/.*\/payroll/, new NetworkOnly(), 'GET');
registerRoute(/^https?:\/\/.*\/api\/stores\/.*\/dividends/, new NetworkOnly(), 'GET');
registerRoute(/^https?:\/\/.*\/api\/stores\/.*\/staff/, new NetworkOnly(), 'GET');
registerRoute(
  /^https?:\/\/.*\/api\//,
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 })],
  }),
  'GET'
);

// Push notification handlers
self.addEventListener('push', (event: any) => {
  let data = { title: '新通知', body: '', url: '/' };
  try {
    if (event.data) data = event.data.json();
  } catch {}

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

self.addEventListener('notificationclick', (event: any) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients: any[]) => {
      for (const client of clients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});