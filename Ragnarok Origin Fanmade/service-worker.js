const CACHE_VERSION = "rooc-push-v1";
const DEFAULT_ICON = "assets/site-icons/rooc-icon-192.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const roomId = payload.roomId || "";
  const notificationUrl = payload.url || `index.html${roomId ? `?chat=${encodeURIComponent(roomId)}` : ""}`;
  event.waitUntil(self.registration.showNotification(payload.title || "ROOC Market", {
    body: payload.body || "คุณมีข้อความใหม่",
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_ICON,
    image: payload.image || undefined,
    tag: roomId ? `market-chat-${roomId}` : CACHE_VERSION,
    renotify: true,
    data: {
      url: notificationUrl,
      roomId
    }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "index.html", self.registration.scope).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
