/*
 * GHMO service worker (plan §11). Deliberately small and conservative:
 *  - Pages and API responses are NEVER cached. Admin pages and decrypted data must not end up in a
 *    cache on someone's device, so every page load goes to the network.
 *  - Only build assets (/_next/static, content-hashed and immutable) and the app icons are cached,
 *    so the installed app starts quickly.
 *  - Optimised public images (/_next/image, same origin) are served from a small cache and refreshed in
 *    the background (stale-while-revalidate), at most IMAGE_CACHE_LIMIT entries.
 *  - When a page can't load because the device is offline, a static offline page is shown instead.
 *  - Navigation preload is on: the browser starts the page request while the worker is still starting, so a
 *    return visit doesn't wait for the worker before the network. The preloaded answer is used as-is.
 *  - Push notifications (plan §18) are shown and tapped here. A push carries only a title, one fixed line, a tag and a
 *    path on this site; nothing from the community is in it, and a tap can only open a page of this site.
 * Bump VERSION when this file's caching rules change; old caches are deleted on activate.
 */
const VERSION = "v2";
const STATIC_CACHE = `ghmo-static-${VERSION}`;
const IMAGE_CACHE = `ghmo-images-${VERSION}`;
const IMAGE_CACHE_LIMIT = 50;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  const preload = self.registration.navigationPreload ? self.registration.navigationPreload.enable().catch(() => undefined) : Promise.resolve();
  const cleanup = caches
    .keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith("ghmo-") && key !== STATIC_CACHE && key !== IMAGE_CACHE).map(key => caches.delete(key))));
  event.waitUntil(Promise.all([preload, cleanup]).then(() => self.clients.claim()));
});

/** Pages: the navigation-preload answer when there is one, else the network; never a cache. Offline page on failure. */
async function navigationResponse(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

function isCacheableAsset(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"));
}

function isOptimisedImage(url) {
  return url.origin === self.location.origin && url.pathname === "/_next/image";
}

/** Keep the image cache small: drop the oldest entries past the limit. */
async function trimImageCache(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - IMAGE_CACHE_LIMIT)).map(key => cache.delete(key)));
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    // Network only (via navigation preload); fall back to the offline page when there is no connection.
    event.respondWith(navigationResponse(event));
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

  if (isOptimisedImage(url)) {
    // Stale-while-revalidate: answer from the cache at once and refresh it in the background.
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache =>
        cache.match(request).then(cached => {
          const refresh = fetch(request)
            .then(response => {
              if (response.ok) {
                cache.put(request, response.clone()).then(() => trimImageCache(cache));
              }
              return response;
            })
            .catch(() => cached ?? Response.error());
          return cached || refresh;
        })
      )
    );
  }
  // Everything else (API calls, Firebase, third-party) goes straight to the network untouched.
});

/** Push: show a content-free notification. A push that can't be read still shows a plain one (browsers require it). */
const NOTIFICATION_ICON = "/icons/icon-192.png";

function readPush(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") {
      const text = (value, fallback, max) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback);
      return {
        title: text(data.title, "GHMO", 80),
        body: text(data.body, "There is something new in the admin area.", 160),
        tag: text(data.tag, "ghmo", 64),
        url: typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url.slice(0, 200) : "/admin"
      };
    }
  } catch {
    // fall through to the plain notification
  }
  return { title: "GHMO", body: "There is something new in the admin area.", tag: "ghmo", url: "/admin" };
}

self.addEventListener("push", event => {
  const note = readPush(event);
  event.waitUntil(
    self.registration.showNotification(note.title, {
      body: note.body,
      tag: note.tag,
      // A newer push of the same kind replaces the older one in the tray and still alerts once.
      renotify: true,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      data: { url: note.url }
    })
  );
});

/** Tap: focus a window of this site and open the page, or open a new one. Only paths on this origin are ever opened. */
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const raw = event.notification.data && typeof event.notification.data.url === "string" ? event.notification.data.url : "/admin";
  let target = new URL("/admin", self.location.origin);
  try {
    const candidate = new URL(raw, self.location.origin);
    if (candidate.origin === self.location.origin) target = candidate;
  } catch {
    // keep /admin
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async windows => {
      const open = windows.find(client => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) {
          try {
            await open.navigate(target.href);
          } catch {
            // the page stays where it was
          }
        }
        return;
      }
      await self.clients.openWindow(target.href);
    })
  );
});
