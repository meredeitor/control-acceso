const CACHE_NAME = "proveedores-v35";

// Archivos base que siempre quieres offline
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-192-cobre.png",
  "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://unpkg.com/html5-qrcode",
  "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js"
];

// ðŸš€ INSTALL
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ðŸ”„ ACTIVATE (limpia versiones viejas)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// ðŸŒ FETCH (estrategia hÃ­brida)
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // ðŸ”¥ API / Firebase â†’ siempre red primero
  if (req.url.includes("firestore") || req.url.includes("googleapis")) {
    event.respondWith(fetch(req));
    return;
  }

  // ðŸ”¥ HTML â†’ network first
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, res.clone());
            return res;
          });
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // ðŸ”¥ JS / CSS / imÃ¡genes â†’ cache first
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req).then((res) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, res.clone());
            return res;
          });
        })
      );
    })
  );
});







