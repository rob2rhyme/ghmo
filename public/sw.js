/*
 * GHMO service worker (plan §11). Deliberately small and conservative:
 *  - Pages and API responses are NEVER cached. Admin pages and decrypted data must not end up in a
 *    cache on someone's device, so every page load goes to the network.
 *  - Only build assets (/_next/static, content-hashed and immutable) and the app icons are cached,
 *    so the installed app starts quickly.
 *  - When a page can't load because the device is offline, a static offline page is shown instead.
 * Bump VERSION when this file's caching rules change; old caches are deleted on activate.
 */
const VERSION = "v1";
const STATIC_CACHE = `ghmo-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("ghmo-") && key !== STATIC_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isCacheableAsset(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"));
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    // Network only; fall back to the offline page when there is no connection.
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(request).then(
          cached =>
            cached ||
            fetch(request).then(response => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
        )
      )
    );
  }
  // Everything else (API calls, Firebase, images, third-party) goes straight to the network untouched.
});
