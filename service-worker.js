const CACHE_NAME = "proveedores-v1";

// Archivos base que siempre quieres offline
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://unpkg.com/html5-qrcode",
  "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js"
];

// 🚀 INSTALL
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 🔄 ACTIVATE (limpia versiones viejas)
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

// 🌐 FETCH (estrategia híbrida)
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // 🔥 API / Firebase → siempre red primero
  if (req.url.includes("firestore") || req.url.includes("googleapis")) {
    event.respondWith(fetch(req));
    return;
  }

  // 🔥 HTML → network first
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

  // 🔥 JS / CSS / imágenes → cache first
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