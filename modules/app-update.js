export function extractAppVersion(html) {
  const match = String(html || "").match(/class="app-version">v(\d+)</);
  return match ? Number(match[1]) : 0;
}

export function createAppUpdateController({
  currentVersion,
  fetchImpl = (...args) => globalThis.fetch(...args),
  locationRef = globalThis.location,
  navigatorRef = globalThis.navigator,
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  now = Date.now,
} = {}) {
  let checking = false;
  let reloading = false;

  async function check() {
    if (checking || reloading || navigatorRef?.onLine === false) return false;
    checking = true;
    try {
      const versionUrl = new URL("./index.html", locationRef.href);
      versionUrl.searchParams.set("update-check", String(now()));
      const response = await fetchImpl(versionUrl.href, { cache: "no-store" });
      if (!response?.ok) return false;
      const remoteVersion = extractAppVersion(await response.text());
      if (!remoteVersion || remoteVersion <= Number(currentVersion)) return false;
      reloading = true;
      const reloadUrl = new URL(locationRef.href);
      reloadUrl.searchParams.set("refresh", String(now()));
      locationRef.replace(reloadUrl.href);
      return true;
    } catch {
      return false;
    } finally {
      checking = false;
    }
  }

  function bind() {
    windowRef?.addEventListener?.("pageshow", check);
    documentRef?.addEventListener?.("visibilitychange", () => {
      if (documentRef.visibilityState === "visible") check();
    });
    windowRef?.setInterval?.(check, 5 * 60 * 1000);
    check();
  }

  return { bind, check };
}
