const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_AUTH_CHECK_URL =
  "https://accounts.google.com/.well-known/openid-configuration";
const GOOGLE_AUTH_TIMEOUT_MS = 7000;
const GOOGLE_TOKEN_TIMEOUT_MS = 15000;
const GOOGLE_DRIVE_TIMEOUT_MS = 30000;
const GOOGLE_AUTH_UNAVAILABLE_MESSAGE =
  "Сервер авторизации Google недоступен. Проверьте подключение к интернету.";
const GOOGLE_DRIVE_TIMEOUT_MESSAGE =
  "Google Drive не ответил вовремя. Проверьте подключение к интернету.";

function waitWithTimeout(
  promise,
  timeoutMs,
  message,
  { setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout } = {},
) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimer(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimer(timerId));
}

export async function assertGoogleAuthAvailable({
  fetchFn = globalThis.fetch,
  online = globalThis.navigator?.onLine,
  timeoutMs = GOOGLE_AUTH_TIMEOUT_MS,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  if (online === false || typeof fetchFn !== "function")
    throw new Error(GOOGLE_AUTH_UNAVAILABLE_MESSAGE);
  try {
    const response = await waitWithTimeout(
      Promise.resolve().then(() =>
        fetchFn(GOOGLE_AUTH_CHECK_URL, {
          method: "GET",
          cache: "no-store",
        }),
      ),
      timeoutMs,
      GOOGLE_AUTH_UNAVAILABLE_MESSAGE,
      { setTimer, clearTimer },
    );
    if (!response?.ok) throw new Error(GOOGLE_AUTH_UNAVAILABLE_MESSAGE);
  } catch {
    throw new Error(GOOGLE_AUTH_UNAVAILABLE_MESSAGE);
  }
  return true;
}

export async function requestGoogleAccessToken({
  clientId,
  scope,
  accountEmail = "",
  googleApi = globalThis.google,
  fetchFn = globalThis.fetch,
  online = globalThis.navigator?.onLine,
  authCheckTimeoutMs = GOOGLE_AUTH_TIMEOUT_MS,
  tokenTimeoutMs = GOOGLE_TOKEN_TIMEOUT_MS,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}) {
  await assertGoogleAuthAvailable({
    fetchFn,
    online,
    timeoutMs: authCheckTimeoutMs,
    setTimer,
    clearTimer,
  });
  if (!googleApi?.accounts?.oauth2) throw new Error("Сервис авторизации Google ещё загружается. Повторите попытку через несколько секунд.");
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimer(timerId);
      handler(value);
    };
    const timerId = setTimer(
      () => finish(reject, new Error(GOOGLE_AUTH_UNAVAILABLE_MESSAGE)),
      tokenTimeoutMs,
    );
    try {
      const client = googleApi.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope,
        login_hint: accountEmail || undefined,
        callback: (response) =>
          response?.error
            ? finish(
                reject,
                new Error(response.error_description || response.error),
              )
            : finish(resolve, response.access_token),
      });
      client.requestAccessToken({ prompt: "" });
    } catch (error) {
      finish(reject, error);
    }
  });
}

export async function getGoogleAccountEmail(accessToken, { fetchFn = fetch } = {}) {
  const response = await fetchFn(`${DRIVE_API}/about?fields=user(emailAddress)`, { headers: authHeaders(accessToken) });
  if (!response.ok) return "";
  const payload = await response.json();
  return String(payload?.user?.emailAddress || "").trim();
}

export async function uploadDriveData({
  accessToken,
  fileId = "",
  payload,
  createId,
  fetchFn = fetch,
  timeoutMs = GOOGLE_DRIVE_TIMEOUT_MS,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}) {
  const headers = { ...authHeaders(accessToken), "Content-Type": "application/json" };
  let response;
  if (fileId) {
    response = await waitWithTimeout(
      fetchFn(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media`, { method: "PATCH", headers, body: payload }),
      timeoutMs,
      GOOGLE_DRIVE_TIMEOUT_MESSAGE,
      { setTimer, clearTimer },
    );
  } else {
    const boundary = `moneyflow-${createId()}`;
    response = await waitWithTimeout(
      fetchFn(`${DRIVE_UPLOAD_API}/files?uploadType=multipart`, {
        method: "POST",
        headers: { ...authHeaders(accessToken), "Content-Type": `multipart/related; boundary=${boundary}` },
        body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: "moneyflow-data.json", mimeType: "application/json" })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--`,
      }),
      timeoutMs,
      GOOGLE_DRIVE_TIMEOUT_MESSAGE,
      { setTimer, clearTimer },
    );
  }
  if (!response.ok) throw new Error(`Google Drive: ${response.status}`);
  return response.json();
}

export async function findLatestDriveFile({ accessToken, fetchFn = fetch }) {
  const query = encodeURIComponent("name = 'moneyflow-data.json' and trashed = false");
  const response = await fetchFn(`${DRIVE_API}/files?q=${query}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)`, { headers: authHeaders(accessToken), cache: "no-store" });
  if (!response.ok) throw new Error(`Google Drive: ${response.status}`);
  const payload = await response.json();
  return payload?.files?.[0] || null;
}

export async function getDriveAccessMode({ accessToken, fileId, fetchFn = fetch }) {
  const response = await fetchFn(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=capabilities(canEdit)`, { headers: authHeaders(accessToken), cache: "no-store" });
  if (!response.ok) throw createDriveAccessError(response.status, "файлу");
  const payload = await response.json();
  return payload?.capabilities?.canEdit ? "writer" : "reader";
}

export async function downloadDriveData({ accessToken, fileId, fetchFn = fetch }) {
  const response = await fetchFn(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: authHeaders(accessToken), cache: "no-store" });
  if (!response.ok) throw createDriveAccessError(response.status, "данным");
  return response.json();
}

export async function createReaderPermission({ accessToken, fileId, email, fetchFn = fetch }) {
  const response = await fetchFn(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }),
  });
  if (!response.ok) throw new Error(`Google Drive: ${response.status}`);
  return response.json();
}

export async function listReaderPermissions({ accessToken, fileId, fetchFn = fetch }) {
  const response = await fetchFn(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,emailAddress,displayName,role,type,deleted)&pageSize=100&supportsAllDrives=true`, { headers: authHeaders(accessToken) });
  if (!response.ok) throw new Error(`Google Drive: ${response.status}`);
  const payload = await response.json();
  return (Array.isArray(payload?.permissions) ? payload.permissions : [])
    .filter((item) => item?.type === "user" && item?.role === "reader" && item?.emailAddress && !item?.deleted)
    .map((item) => ({ id: String(item.id), email: String(item.emailAddress), displayName: String(item.displayName || "") }));
}

export async function deleteReaderPermission({ accessToken, fileId, permissionId, fetchFn = fetch }) {
  const response = await fetchFn(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?supportsAllDrives=true`, { method: "DELETE", headers: authHeaders(accessToken) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || `Google Drive: ${response.status}`);
  }
}

function authHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

function createDriveAccessError(status, target) {
  if (status === 404) return new Error(`Нет доступа к ${target}. Войдите под Gmail, которому редактор выдал доступ.`);
  return new Error(`Google Drive: ${status}`);
}
