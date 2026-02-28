/**
 * Spark AI - Web Push Notification Handler
 * Imported by the main service worker via importScripts.
 */

// Handle incoming push events from the server
self.addEventListener('push', function(event) {
  if (!event.data) return;

  var payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {
      title: 'Spark AI',
      body: event.data.text(),
      icon: '/pwa-192x192.png',
    };
  }

  var options = {
    body: payload.body || '',
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-64x64.png',
    tag: payload.tag || 'spark-notification',
    renotify: true,
    vibrate: [200, 100, 200],
    data: payload.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Spark AI', options)
  );
});

// Handle notification click — open app to correct page
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  var targetUrl = (event.notification.data && event.notification.data.url) || '/';
  var fullUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // If app is already open, focus and navigate
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          client.focus();
          if ('navigate' in client) {
            client.navigate(fullUrl);
          }
          return;
        }
      }
      // Otherwise open a new window
      return clients.openWindow(fullUrl);
    })
  );
});

// Handle push subscription change (browser rotates keys)
self.addEventListener('pushsubscriptionchange', function(event) {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true })
      .then(function(newSubscription) {
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: newSubscription.toJSON(),
            user_agent: '',
          }),
        });
      })
      .catch(function(err) {
        console.error('[SW] Failed to re-subscribe:', err);
      })
  );
});
