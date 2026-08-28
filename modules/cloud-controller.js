import {
  base64ToBytes,
  createEncryptionSalt,
  decryptCloudPayload,
  deriveEncryptionKey,
  encryptCloudPayload,
  isExpectedKdf,
  isValidEncryptionKey,
} from "./cloud-crypto.js";
import {
  downloadDriveData,
  findLatestDriveFile,
  getDriveAccessMode,
  getGoogleAccountEmail,
  requestGoogleAccessToken,
  uploadDriveData,
} from "./google-drive-api.js";
import { sanitizeCategories } from "./category-core.js";
import { sanitizeOperations } from "./operation-core.js";

export function createCloudController(context, { createId }) {
  const { elements, state, storage, actions } = context;
  const call = (name, ...args) => actions.call(name, ...args);
  const validKey = (key) => isValidEncryptionKey(key);
  function getStoredCloudEncryptionKey() {
    const key = localStorage.getItem(storage.keys.cloudEncryptionKey) || "";
    return validKey(key) ? key : "";
  }
  function getStoredCloudEncryptionSalt() {
    const salt = localStorage.getItem(storage.keys.cloudEncryptionSalt) || "";
    try {
      return base64ToBytes(salt).byteLength === 16 ? salt : "";
    } catch {
      return "";
    }
  }
  function setCloudEncryptionKey(key) {
    if (!validKey(key)) return false;
    state.cloudEncryptionKey = key;
    localStorage.setItem(storage.keys.cloudEncryptionKey, key);
    return true;
  }
  function resetCloudEncryptionMaterial() {
    state.cloudEncryptionKey = "";
    state.cloudEncryptionSalt = "";
    localStorage.removeItem(storage.keys.cloudEncryptionKey);
    localStorage.removeItem(storage.keys.cloudEncryptionSalt);
  }
  async function ensureEditorEncryptionKey() {
    if (validKey(state.cloudEncryptionKey)) return state.cloudEncryptionKey;
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues)
      throw new Error("Браузер не поддерживает шифрование файла");
    if (!state.cloudEncryptionSalt) {
      state.cloudEncryptionSalt = createEncryptionSalt();
      localStorage.setItem(
        storage.keys.cloudEncryptionSalt,
        state.cloudEncryptionSalt,
      );
    }
    const key = await deriveEncryptionKey(
      state.cloudPassphrase,
      state.cloudEncryptionSalt,
    );
    setCloudEncryptionKey(key);
    return key;
  }
  async function restoreEditorEncryptionKey(encryptedPayload) {
    if (!state.cloudPassphrase || !isExpectedKdf(encryptedPayload?.kdf))
      return "";
    try {
      const salt = String(encryptedPayload.kdf.salt || "");
      if (base64ToBytes(salt).byteLength !== 16) return "";
      const key = await deriveEncryptionKey(state.cloudPassphrase, salt);
      state.cloudEncryptionSalt = salt;
      localStorage.setItem(storage.keys.cloudEncryptionSalt, salt);
      setCloudEncryptionKey(key);
      return key;
    } catch {
      return "";
    }
  }
  async function decryptPayload(payload) {
    if (
      Array.isArray(payload?.operations) &&
      Array.isArray(payload?.categories)
    )
      return payload;
    let key = state.cloudEncryptionKey;
    if (!validKey(key) && state.syncSettings.accessMode !== "reader")
      key = await restoreEditorEncryptionKey(payload);
    if (!validKey(key))
      throw new Error(
        "В приложении нет ключа. Откройте актуальную ссылку подключения от редактора.",
      );
    try {
      return await decryptCloudPayload(payload, key);
    } catch {
      throw new Error(
        "Не удалось расшифровать файл. Откройте актуальную ссылку подключения от редактора.",
      );
    }
  }
  async function getGoogleAccessToken(scope) {
    const token = await requestGoogleAccessToken({
      clientId: state.syncSettings.googleClientId,
      scope,
      accountEmail: state.syncSettings.googleAccountEmail,
    });
    try {
      const email = await getGoogleAccountEmail(token);
      if (email && email !== state.syncSettings.googleAccountEmail) {
        state.syncSettings.googleAccountEmail = email;
        storage.write(storage.keys.syncSettings, state.syncSettings);
      }
    } catch {
      /* Account hint is optional. */
    }
    return token;
  }
  function getPayload() {
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      operations: state.operations,
      categories: state.categories,
    };
  }
  async function uploadToGoogleDrive() {
    call("setSyncStatus", "Открываю вход Google и шифрую полный файл...");
    try {
      const accessToken = await getGoogleAccessToken(
        "https://www.googleapis.com/auth/drive.file",
      );
      const encrypted = await encryptCloudPayload(getPayload(), {
        encryptionKey: await ensureEditorEncryptionKey(),
        salt: state.cloudEncryptionSalt,
      });
      const metadata = await uploadDriveData({
        accessToken,
        fileId: state.syncSettings.googleFileId,
        payload: JSON.stringify(encrypted),
        createId,
      });
      if (!state.syncSettings.googleFileId && metadata?.id) {
        state.syncSettings.googleFileId = metadata.id;
        state.syncSettings.accessMode = "writer";
      }
      state.syncSettings.lastSuccessfulSyncAt = new Date().toISOString();
      storage.write(storage.keys.syncSettings, state.syncSettings);
      call("renderSyncSettingsForm");
      call("updateCloudAccessUI");
      call("renderLastSuccessfulSync");
      call("clearPendingCloudChanges");
      call("refreshReaderConnectionLink", { notify: false });
      call("render");
      call(
        "setSyncStatus",
        "Зашифрованный файл успешно выгружен в Google Drive.",
      );
      call("showAppNotice", "Данные успешно выгружены в облако.");
      return true;
    } catch (error) {
      const message = `Выгрузка неуспешна: ${error?.message || "неизвестная ошибка"}`;
      call("setSyncStatus", message);
      call("showAppNotice", message, "error");
      return false;
    }
  }
  async function downloadFromGoogleDrive({
    skipReplaceConfirmation = false,
  } = {}) {
    call("setSyncStatus", "Открываю вход Google и загружаю файл...");
    try {
      const accessToken = await getGoogleAccessToken(
        "https://www.googleapis.com/auth/drive.readonly",
      );
      if (!state.syncSettings.googleFileId) {
        const file = await findLatestDriveFile({ accessToken });
        if (!file?.id)
          throw new Error(
            "Файл M-Flow не найден. Сначала выгрузите данные в облако.",
          );
        state.syncSettings.googleFileId = file.id;
        state.syncSettings.accessMode = "unknown";
        storage.write(storage.keys.syncSettings, state.syncSettings);
        call("renderSyncSettingsForm");
        call("updateCloudAccessUI");
      }
      if (
        !skipReplaceConfirmation &&
        (state.operations.length || state.categories.length) &&
        !window.confirm(
          "Загрузка из облака полностью заменит локальные операции и категории. Продолжить?",
        )
      )
        return false;
      state.syncSettings.accessMode = await getDriveAccessMode({
        accessToken,
        fileId: state.syncSettings.googleFileId,
      });
      storage.write(storage.keys.syncSettings, state.syncSettings);
      call("updateCloudAccessUI");
      const payload = await decryptPayload(
        await downloadDriveData({
          accessToken,
          fileId: state.syncSettings.googleFileId,
        }),
      );
      if (
        !Array.isArray(payload?.operations) ||
        !Array.isArray(payload?.categories)
      )
        throw new Error("Файл не похож на данные M-Flow");
      state.operations = sanitizeOperations(payload.operations);
      state.categories = sanitizeCategories(payload.categories);
      state.activeCategoryFilter = new Set();
      state.currentPage = 1;
      storage.write(storage.keys.operations, state.operations);
      storage.write(storage.keys.categories, state.categories);
      call("renderCategoryOptions");
      call("render");
      state.syncSettings.lastSuccessfulSyncAt = new Date().toISOString();
      storage.write(storage.keys.syncSettings, state.syncSettings);
      call("renderLastSuccessfulSync");
      call("clearPendingCloudChanges");
      call("refreshReaderConnectionLink", { notify: false });
      call(
        "setSyncStatus",
        "Данные из облака загружены. Локальные операции и категории заменены.",
      );
      call(
        "showAppNotice",
        state.syncSettings.accessMode === "reader"
          ? "Данные синхронизированы."
          : "Данные из облака загружены.",
      );
      return true;
    } catch (error) {
      const message = `Загрузка неуспешна: ${error?.message || "неизвестная ошибка"}`;
      call("setSyncStatus", message);
      call("showAppNotice", message, "error");
      return false;
    }
  }
  return {
    downloadFromGoogleDrive,
    getGoogleAccessToken,
    getStoredCloudEncryptionKey,
    getStoredCloudEncryptionSalt,
    resetCloudEncryptionMaterial,
    setCloudEncryptionKey,
    uploadToGoogleDrive,
  };
}
