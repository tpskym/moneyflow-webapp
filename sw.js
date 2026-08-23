const CACHE_NAME = "moneyflow-v140";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=140",
  "./app.js?v=140",
  "./manifest.webmanifest?v=140",
  "./icons/moneyflow.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const item of ASSETS) {
        try {
          await cache.add(item);
        } catch {
          // no-op for relative/static mismatch in local file mode
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (requestUrl.origin !== scope.origin) return;

  if (isAppShellRequest(event.request)) {
    event.respondWith(fetchAndCache(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            if (response.ok && response.status === 200 && cloned.url.startsWith("http")) {
              cache.put(event.request, cloned);
            }
          });
          return response;
        })
        .catch(() => {
          return caches.match("./index.html");
        });
    })
  );
});

function isAppShellRequest(request) {
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return false;

  const relativePath = url.pathname.slice(scope.pathname.length);
  return ["", "index.html", "app.js", "styles.css", "manifest.webmanifest"].includes(relativePath);
}

function fetchAndCache(request) {
  return fetch(request)
    .then((response) => {
      const cloned = response.clone();
      if (response.ok && response.status === 200 && cloned.url.startsWith("http")) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
      }
      return response;
    })
    .catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => cached || caches.match("./index.html")));
}
