const CACHE_NAME = "caborca-access-control-v144";

// Archivos base que siempre quieres offline
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./kiosko-common.js",
  "./kiosko-proveedores.html",
  "./kiosko-visitantes.html",
  "./kiosko-vales.html",
  "./kiosko-vales-personal.html",
  "./kiosko-vales-activos.html",
  "./manifest.json",
  "./icon-192-cobre.png",
  "./icon-512-cobre.png",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://unpkg.com/html5-qrcode",
  "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js",
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"
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
  if (req.mode === "navigate" || req.url.endsWith(".js")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, res.clone());
            return res;
          });
        })
        .catch(() =>
          caches.match(req, { ignoreSearch:true }).then((cached) =>
            cached || caches.match("./index.html")
          )
        )
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







