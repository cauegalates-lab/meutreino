const CACHE = "meu-treino-v26-refactor-financial-admin";
const ASSETS = ["./","./index.html","./styles.css","./app.js","./billing.js","./firebase-sync.js","./firebase-config.js","./manifest.webmanifest","./admin/","./admin/index.html","./admin/admin.css","./admin/admin.js","./assets/icon.svg","./assets/icon-192.png","./assets/icon-512.png","./assets/apple-touch-icon.png","./assets/hero-costas.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin) {
    const codeRequest = event.request.mode === "navigate"
      || ["script", "style", "worker"].includes(event.request.destination)
      || url.pathname.endsWith("/firebase-config.js")
      || url.pathname.endsWith("/manifest.webmanifest");

    if (codeRequest) {
      event.respondWith(fetch(event.request).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
        return response;
      }).catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          if (url.pathname.includes("/admin")) return caches.match("./admin/index.html");
          return caches.match("./index.html");
        }
        return Response.error();
      }));
      return;
    }

    event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    })));
    return;
  }

  // Recursos externos (incluindo Firebase Auth/Firestore) ficam totalmente fora
  // do cache do PWA. O próprio navegador gerencia o cache HTTP desses módulos.
});
