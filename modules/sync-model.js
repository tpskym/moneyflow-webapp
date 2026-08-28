export function sanitizeSyncSettings(settings) {
  return {
    googleClientId: String(settings?.googleClientId || "").trim(),
    googleFileId: String(settings?.googleFileId || "").trim(),
    accessMode: ["writer", "reader", "unknown"].includes(settings?.accessMode) ? settings.accessMode : "writer",
    googleAccountEmail: String(settings?.googleAccountEmail || "").trim(),
    lastSuccessfulSyncAt: String(settings?.lastSuccessfulSyncAt || "").trim(),
  };
}

export function getMissingSyncSettings(settings, { needsFileId = false } = {}) {
  const missing = [];
  if (!settings?.googleClientId) missing.push("OAuth Client ID");
  if (needsFileId && !settings?.googleFileId) missing.push("ID файла Google Drive");
  return missing;
}

export function parseReaderConnectionLink(value, { isValidKey = () => true } = {}) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return null;
  }
  const googleClientId = url.searchParams.get("mf_google_client") || "";
  const googleFileId = url.searchParams.get("mf_google_file") || "";
  const encryptionKey = new URLSearchParams(url.hash.slice(1)).get("mf_key") || "";
  return googleClientId && googleFileId && isValidKey(encryptionKey) ? { googleClientId, googleFileId, encryptionKey } : null;
}

export function createReaderConnectionLink({ origin, pathname, googleClientId, googleFileId, encryptionKey }) {
  if (!googleClientId || !googleFileId || !encryptionKey) return "";
  const url = new URL(String(pathname || "/"), origin);
  url.searchParams.set("mf_google_client", googleClientId);
  url.searchParams.set("mf_google_file", googleFileId);
  url.hash = `mf_key=${encodeURIComponent(encryptionKey)}`;
  return url.toString();
}
