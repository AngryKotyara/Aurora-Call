const CACHE = "aurora-shell-v8";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/aurora-call-icon-192-v2.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (
      (await caches.match(request)) ||
      (fallback ? await caches.match(fallback) : Response.error())
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/index.html"));
    return;
  }

  if (["script", "style"].includes(request.destination)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (["image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const refresh = fetch(request)
          .then(async (response) => {
            if (response.ok) {
              const cache = await caches.open(CACHE);
              await cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached || Response.error());
        return cached || refresh;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {
      title: "Aurora Call",
      body: event.data?.text() || "Новое событие",
    };
  }
  const notification = payload.notification || payload;
  const notificationData = notification.data || payload;
  const title = notification.title || "Aurora Call";
  const options = {
    body: notification.body || "Новое событие",
    tag: notification.tag || `aurora-${Date.now()}`,
    renotify: notificationData.type === "call",
    requireInteraction: notificationData.type === "call",
    icon: notification.icon || "/aurora-call-icon-192-v2.png",
    badge: notification.badge || "/aurora-call-icon-192-v2.png",
    data: {
      url: notification.navigate || notificationData.url || "/",
      type: notificationData.type || "generic",
      call_id: notificationData.call_id || null,
      friend_id: notificationData.friend_id || null,
    },
  };
  const tasks = [self.registration.showNotification(title, options)];
  const appBadge = Number(notification.app_badge);
  if (Number.isFinite(appBadge) && appBadge >= 0) {
    const badgeTask =
      appBadge > 0
        ? self.navigator?.setAppBadge?.(appBadge)
        : self.navigator?.clearAppBadge?.();
    if (badgeTask) tasks.push(Promise.resolve(badgeTask).catch(() => {}));
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        client.postMessage({ type: "aurora-push-open", url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
