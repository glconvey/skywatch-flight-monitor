// SkyWatch Service Worker v1.0
// Handles caching and background sync for flight price monitoring

const CACHE_NAME = 'skywatch-v1';
const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
];

// ── INSTALL ───────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing SkyWatch SW...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.filter(url => !url.startsWith('data:')));
    }).catch(err => console.warn('[SW] Cache install failed:', err))
  );
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating SkyWatch SW...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH — Cache-first for static, network-first for API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache Anthropic API calls
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Google Fonts — network with cache fallback
  if (url.hostname.includes('fonts')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(resp => {
            cache.put(event.request, resp.clone());
            return resp;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // App shell — cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        if (resp.status === 200) {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, respClone));
        }
        return resp;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'Flight price update!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'view', title: '✈ View Prices' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'SkyWatch Alert', options)
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action !== 'dismiss') {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  }
});

// ── BACKGROUND SYNC (future use) ─────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'flight-price-check') {
    console.log('[SW] Background sync: checking flight prices');
    // Background price check would go here in a full deployment
  }
});

console.log('[SW] SkyWatch Service Worker loaded ✓');
