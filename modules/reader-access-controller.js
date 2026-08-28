import {
  createReaderPermission,
  deleteReaderPermission,
  listReaderPermissions,
} from "./google-drive-api.js";
import {
  createReaderConnectionLink,
  parseReaderConnectionLink,
  sanitizeSyncSettings,
} from "./sync-model.js";

export function buildReaderShareMessage({ appLink, connectionLink }) {
  return `Установите M-Flow: ${appLink}\n\n1. Откройте первую ссылку и установите приложение.\n2. В приложении откройте «Настройки синхронизации» в верхней части экрана, затем выберите вкладку «Читатель».\n3. Вставьте вторую ссылку в поле «Ссылка подключения» и нажмите «Подключиться по ссылке»:\n${connectionLink}\n\nДанные загрузятся автоматически.`;
}

export function createReaderAccessController(
  context,
  { isValidEncryptionKey },
) {
  const { elements, state, storage, actions } = context;
  const call = (name, ...args) => actions.call(name, ...args);
  function setStatus(element, message, tone = "") {
    if (!element) return;
    element.textContent = message || "";
    if (tone) element.dataset.state = tone;
    else delete element.dataset.state;
  }
  function getReaderConnectionLink() {
    if (!isValidEncryptionKey(state.cloudEncryptionKey)) return "";
    return createReaderConnectionLink({
      origin: location.origin,
      pathname: location.pathname,
      googleClientId: state.syncSettings.googleClientId,
      googleFileId: state.syncSettings.googleFileId,
      encryptionKey: state.cloudEncryptionKey,
    });
  }
  function consumeCloudConnectionSettings() {
    const url = new URL(location.href);
    const settings = parseReaderConnectionLink(url.toString(), {
      isValidKey: isValidEncryptionKey,
    });
    if (!settings) return null;
    url.searchParams.delete("mf_google_client");
    url.searchParams.delete("mf_google_file");
    url.hash = "";
    window.history.replaceState({}, "", url.toString());
    return settings;
  }
  function refreshReaderConnectionLink({ notify = true } = {}) {
    if (
      state.syncSettings.accessMode !== "writer" ||
      !state.syncSettings.googleFileId
    ) {
      if (notify)
        call(
          "setSyncStatus",
          "Ссылка доступна на устройстве редактора после первой выгрузки.",
        );
      return false;
    }
    const link = getReaderConnectionLink();
    if (!link) {
      if (notify)
        call(
          "setSyncStatus",
          "Сначала укажите пароль-фразу и выгрузите зашифрованный файл.",
        );
      return false;
    }
    if (elements.readerConnectionLink)
      elements.readerConnectionLink.value = link;
    if (elements.readerConnection) elements.readerConnection.hidden = false;
    if (notify) {
      call("setSyncStatus", "Ссылка подключения обновлена.");
      call("showAppNotice", "Ссылка подключения обновлена.");
    }
    return true;
  }
  async function applyReaderConnectionLink() {
    const settings = parseReaderConnectionLink(
      elements.readerLinkInput?.value || "",
      { isValidKey: isValidEncryptionKey },
    );
    if (!settings)
      return call(
        "setSyncStatus",
        "Вставьте корректную ссылку подключения из приложения M-Flow.",
      );
    state.syncSettings = sanitizeSyncSettings({
      ...state.syncSettings,
      googleClientId: settings.googleClientId,
      googleFileId: settings.googleFileId,
      accessMode: "unknown",
      googleAccountEmail: "",
    });
    call("setCloudEncryptionKey", settings.encryptionKey);
    storage.write(storage.keys.syncSettings, state.syncSettings);
    call("renderSyncSettingsForm");
    call("updateCloudAccessUI");
    if (elements.readerLinkInput) elements.readerLinkInput.value = "";
    call(
      "setSyncStatus",
      "Подключение сохранено. Загружаю данные из облака...",
    );
    await call("downloadFromGoogleDrive", { skipReplaceConfirmation: true });
  }
  function renderReaderPermissions() {
    if (!elements.readerAccessList) return;
    elements.readerAccessList.innerHTML = state.readerPermissions.length
      ? state.readerPermissions
          .map(
            (permission) =>
              `<div class="reader-access-item"><span class="reader-access-email">${call("escapeHtml", permission.email)}</span><button type="button" class="btn btn--danger" data-reader-permission-id="${call("escapeHtml", permission.id)}">Удалить доступ</button></div>`,
          )
          .join("")
      : '<div class="empty">Приглашенных читателей нет</div>';
  }
  async function loadReaderPermissions() {
    if (
      !state.syncSettings.googleFileId ||
      state.syncSettings.accessMode !== "writer"
    )
      return setStatus(
        elements.readerAccessStatus,
        "Список читателей доступен на ведущем устройстве после первой выгрузки.",
        "error",
      );
    setStatus(elements.readerAccessStatus, "Загружаю список читателей...");
    try {
      state.readerPermissions = await listReaderPermissions({
        accessToken: await call(
          "getGoogleAccessToken",
          "https://www.googleapis.com/auth/drive.file",
        ),
        fileId: state.syncSettings.googleFileId,
      });
      renderReaderPermissions();
      setStatus(
        elements.readerAccessStatus,
        state.readerPermissions.length
          ? "Список читателей обновлен."
          : "Приглашенных читателей нет.",
        "success",
      );
    } catch (error) {
      setStatus(
        elements.readerAccessStatus,
        `Не удалось загрузить список: ${error?.message || "неизвестная ошибка"}`,
        "error",
      );
    }
  }
  async function inviteReader() {
    const email = String(elements.readerEmailInput?.value || "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      call("setSyncStatus", "Укажите корректный Google e-mail читателя.");
      return setStatus(
        elements.readerInviteStatus,
        "Укажите корректный Gmail-адрес читателя.",
        "error",
      );
    }
    if (
      !state.syncSettings.googleFileId ||
      state.syncSettings.accessMode !== "writer"
    ) {
      call(
        "setSyncStatus",
        "Открыть доступ может только ведущее устройство после первой выгрузки.",
      );
      return setStatus(
        elements.readerInviteStatus,
        "Сначала выполните первую выгрузку из ведущего устройства.",
        "error",
      );
    }
    call("setSyncStatus", "Выдаю читателю доступ к файлу Google Drive...");
    setStatus(elements.readerInviteStatus, "Открываю доступ...");
    try {
      const permission = await createReaderPermission({
        accessToken: await call(
          "getGoogleAccessToken",
          "https://www.googleapis.com/auth/drive.file",
        ),
        fileId: state.syncSettings.googleFileId,
        email,
      });
      if (permission?.id && permission?.emailAddress) {
        state.readerPermissions = state.readerPermissions.filter(
          (item) =>
            item.email.toLowerCase() !==
            String(permission.emailAddress).toLowerCase(),
        );
        state.readerPermissions.push({
          id: String(permission.id),
          email: String(permission.emailAddress),
          displayName: String(permission.displayName || ""),
        });
        renderReaderPermissions();
      }
      if (elements.readerEmailInput) elements.readerEmailInput.value = "";
      call("setSyncStatus", `Доступ на чтение выдан: ${email}.`);
      setStatus(
        elements.readerInviteStatus,
        `Доступ выдан для ${email}. Отправьте ему ссылку подключения ниже.`,
        "success",
      );
    } catch (error) {
      const message = error?.message || "неизвестная ошибка";
      call("setSyncStatus", `Не удалось открыть доступ: ${message}`);
      setStatus(
        elements.readerInviteStatus,
        `Отправка не выполнена: ${message}`,
        "error",
      );
    }
  }
  async function copyText(text) {
    if (navigator.clipboard?.writeText)
      return navigator.clipboard.writeText(text);
    const input = document.createElement("textarea");
    input.value = text;
    input.style.cssText = "position:fixed;opacity:0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("copy_failed");
  }
  async function shareReaderConnection() {
    if (
      !state.syncSettings.googleClientId ||
      !state.syncSettings.googleFileId ||
      state.syncSettings.accessMode !== "writer"
    )
      return setStatus(
        elements.readerConnectionStatus,
        "Ссылка доступна на ведущем устройстве после первой выгрузки.",
        "error",
      );
    const link = getReaderConnectionLink();
    if (!link)
      return setStatus(
        elements.readerConnectionStatus,
        "Обновите ссылку после выгрузки зашифрованного файла.",
        "error",
      );
    const text = buildReaderShareMessage({
      appLink: `${location.origin}${location.pathname}`,
      connectionLink: link,
    });
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "M-Flow: подключение читателя", text });
        setStatus(
          elements.readerConnectionStatus,
          "Ссылка передана читателю.",
          "success",
        );
      } else {
        await copyText(text);
        setStatus(
          elements.readerConnectionStatus,
          "Инструкция и ссылки скопированы в буфер обмена.",
          "success",
        );
      }
    } catch (error) {
      setStatus(
        elements.readerConnectionStatus,
        error?.name === "AbortError"
          ? "Отправка ссылки отменена."
          : "Не удалось отправить ссылку. Попробуйте еще раз.",
        error?.name === "AbortError" ? "" : "error",
      );
    }
  }
  async function deletePermission(permission) {
    if (!window.confirm(`Удалить доступ на чтение для ${permission.email}?`))
      return;
    setStatus(elements.readerAccessStatus, "Удаляю доступ...");
    try {
      await deleteReaderPermission({
        accessToken: await call(
          "getGoogleAccessToken",
          "https://www.googleapis.com/auth/drive.file",
        ),
        fileId: state.syncSettings.googleFileId,
        permissionId: permission.id,
      });
      state.readerPermissions = state.readerPermissions.filter(
        (item) => item.id !== permission.id,
      );
      renderReaderPermissions();
      setStatus(
        elements.readerAccessStatus,
        `Доступ удален: ${permission.email}.`,
        "success",
      );
    } catch (error) {
      setStatus(
        elements.readerAccessStatus,
        `Не удалось удалить доступ: ${error?.message || "неизвестная ошибка"}`,
        "error",
      );
    }
  }
  function bind() {
    elements.readerLinkApplyButton?.addEventListener(
      "click",
      applyReaderConnectionLink,
    );
    elements.readerInviteButton?.addEventListener("click", inviteReader);
    elements.readerConnectionRefreshButton?.addEventListener("click", () =>
      refreshReaderConnectionLink(),
    );
    elements.readerConnectionShareButton?.addEventListener(
      "click",
      shareReaderConnection,
    );
    elements.readerAccessRefreshButton?.addEventListener(
      "click",
      loadReaderPermissions,
    );
    elements.readerAccessList?.addEventListener("click", (event) => {
      const id = event.target.closest("[data-reader-permission-id]")?.dataset
        .readerPermissionId;
      const permission = state.readerPermissions.find((item) => item.id === id);
      if (permission) deletePermission(permission);
    });
  }
  return {
    applyReaderConnectionLink,
    bind,
    consumeCloudConnectionSettings,
    getReaderConnectionLink,
    loadReaderPermissions,
    refreshReaderConnectionLink,
  };
}
