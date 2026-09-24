const CACHE_NAME = "caborca-access-control-v170";
const NAVIGATION_TIMEOUT_MS = 8000;

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
  "./icon-shield-master.png",
  "./apple-touch-icon-180.png",
  "./icon-app-192.png",
  "./icon-app-512.png"
];

function fetchWithTimeout(request, timeoutMs = NAVIGATION_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("network-timeout")), timeoutMs);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// 🚀 INSTALL
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        STATIC_ASSETS.map((asset) => cache.add(asset))
      )
    )
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
      fetchWithTimeout(req)
        .then((res) => {
          if (!res || !res.ok) throw new Error("navigation-response-not-ok");
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

  // Scripts locales: red primero con respaldo en cache. Las librerias CDN
  // mantienen su propio cache HTTP y no deben impedir instalar la PWA.
  if (new URL(req.url).origin === self.location.origin && new URL(req.url).pathname.endsWith(".js")) {
    event.respondWith(
      fetchWithTimeout(req)
        .then((res) => {
          if (!res || !res.ok) throw new Error("script-response-not-ok");
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, res.clone());
            return res;
          });
        })
        .catch(() => caches.match(req, { ignoreSearch:true }))
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
