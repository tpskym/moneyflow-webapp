const CACHE_NAME = "moneyflow-v178";
const SHARED_RECEIPTS_DB = "moneyflow-shared-receipts-v1";
const SHARED_RECEIPTS_STORE = "receipts";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=178",
  "./vendor/jsqr/jsQR.js?v=178",
  "./app.js?v=178",
  "./modules/receipt-parser.js",
  "./modules/receipt-scanner.js",
  "./modules/dates.js",
  "./modules/csv-transfer.js",
  "./modules/operation-core.js",
  "./modules/category-core.js",
  "./modules/cloud-crypto.js",
  "./modules/google-drive-api.js",
  "./modules/sync-model.js",
  "./modules/operations-list.js",
  "./modules/category-picker.js",
  "./modules/quick-add-controller.js",
  "./modules/filters-view.js",
  "./modules/sync-settings-view.js",
  "./modules/app-context.js",
  "./modules/app-config.js",
  "./modules/app-ui-controller.js",
  "./modules/filter-controller.js",
  "./modules/receipt-share-controller.js",
  "./modules/data-actions-controller.js",
  "./modules/cloud-controller.js",
  "./modules/reader-access-controller.js",
  "./manifest.webmanifest?v=178",
  "./icons/moneyflow.svg",
  "./vendor/pdfjs/pdf.min.mjs",
  "./vendor/pdfjs/pdf.worker.min.mjs",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(
        ASSETS.map((item) =>
          new Request(new URL(item, self.registration.scope), { cache: "reload" }),
        ),
      ),
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (isReceiptShareRequest(event.request)) {
    const response = handleReceiptShare(event.request);
    event.respondWith(response);
    event.waitUntil(
      response
        .then(() => focusReceiptAppClient(event.resultingClientId))
        .catch(() => {}),
    );
    return;
  }
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

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "moneyflow:get-shared-receipts") {
    const port = event.ports?.[0];
    event.waitUntil(
      getSharedReceipts()
        .then((receipts) => port?.postMessage({ receipts }))
        .catch((error) => port?.postMessage({ error: error?.message || "не удалось получить чеки" })),
    );
  }
  if (data.type === "moneyflow:clear-shared-receipts") {
    event.waitUntil(removeSharedReceipts(data.ids));
  }
});

function isReceiptShareRequest(request) {
  if (request.method !== "POST") return false;
  const scope = new URL(self.registration.scope);
  const url = new URL(request.url);
  return url.origin === scope.origin && [scope.pathname, new URL("receive-check/", scope).pathname].includes(url.pathname);
}

async function handleReceiptShare(request) {
  const formData = await request.formData();
  const receipts = formData.getAll("receipts").filter((item) => item && typeof item.arrayBuffer === "function");
  const launchUrl = new URL("./", self.registration.scope);
  launchUrl.searchParams.set("shared-checks", "1");
  launchUrl.searchParams.set("share-event", String(Date.now()));
  if (receipts.length) {
    await saveSharedReceipts(receipts);
  }
  return Response.redirect(launchUrl.href, 303);
}

async function notifySharedReceiptsAvailable() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: "moneyflow:shared-receipts-ready" }));
}

async function focusReceiptAppClient(resultingClientId) {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const scope = new URL(self.registration.scope);
  const launchUrl = new URL("./", scope);
  launchUrl.searchParams.set("shared-checks", "1");
  launchUrl.searchParams.set("share-event", String(Date.now()));
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const appClients = clients.filter((client) => {
    try {
      return new URL(client.url).href.startsWith(scope.href);
    } catch {
      return false;
    }
  });
  const target =
    appClients.find((client) => client.id !== resultingClientId) ||
    appClients.find((client) => client.id === resultingClientId) ||
    appClients[0];
  if (!target) {
    await self.clients.openWindow?.(launchUrl.href);
    return;
  }
  let navigatedTarget = target;
  try {
    navigatedTarget = (await target.navigate?.(launchUrl.href)) || target;
  } catch {
    // The queued files are still available to the existing page.
  }
  navigatedTarget.postMessage({ type: "moneyflow:shared-receipts-ready" });
  try {
    await navigatedTarget.focus?.();
  } catch {
    // Android may reject focus, but navigate still delivers the launch URL.
  }
}

async function saveSharedReceipts(files) {
  const db = await openSharedReceiptsDb();
  try {
    const transaction = db.transaction(SHARED_RECEIPTS_STORE, "readwrite");
    const store = transaction.objectStore(SHARED_RECEIPTS_STORE);
    for (const file of files) {
      store.add({ name: file.name || "Чек", type: file.type || "image/*", file, receivedAt: Date.now() });
    }
    await completeTransaction(transaction);
  } finally {
    db.close();
  }
}

async function getSharedReceipts() {
  const db = await openSharedReceiptsDb();
  try {
    const transaction = db.transaction(SHARED_RECEIPTS_STORE, "readonly");
    const request = transaction.objectStore(SHARED_RECEIPTS_STORE).getAll();
    return await requestResult(request);
  } finally {
    db.close();
  }
}

async function removeSharedReceipts(ids) {
  const values = Array.isArray(ids) ? ids : [];
  if (!values.length) return;
  const db = await openSharedReceiptsDb();
  try {
    const transaction = db.transaction(SHARED_RECEIPTS_STORE, "readwrite");
    const store = transaction.objectStore(SHARED_RECEIPTS_STORE);
    values.forEach((id) => store.delete(id));
    await completeTransaction(transaction);
  } finally {
    db.close();
  }
}

function openSharedReceiptsDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARED_RECEIPTS_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SHARED_RECEIPTS_STORE)) {
        request.result.createObjectStore(SHARED_RECEIPTS_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("не удалось открыть хранилище чеков"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("не удалось прочитать чеки"));
  });
}

function completeTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("не удалось сохранить чеки"));
    transaction.onabort = () => reject(transaction.error || new Error("операция с чеками отменена"));
  });
}

function isAppShellRequest(request) {
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return false;

  const relativePath = url.pathname.slice(scope.pathname.length);
  return ["", "index.html", "app.js", "styles.css", "manifest.webmanifest"].includes(relativePath)
    || relativePath.startsWith("modules/")
    || relativePath.startsWith("vendor/");
}

function fetchAndCache(request) {
  return fetch(new Request(request, { cache: "no-cache" }))
    .then((response) => {
      const cloned = response.clone();
      if (response.ok && response.status === 200 && cloned.url.startsWith("http")) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
      }
      return response;
    })
    .catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => cached || caches.match("./index.html")));
}


