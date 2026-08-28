import {
  escapeCsvCell,
  formatCsvOperationDate,
  parseDebitCreditCsv,
} from "./csv-transfer.js";
import {
  compareOperationsChronologicalDescending,
  enrichOperationsWithBalance,
  sanitizeOperations,
  signedAmount,
} from "./operation-core.js";
import { sanitizeCategories } from "./category-core.js";
import { sanitizeSyncSettings } from "./sync-model.js";

export function createDataActionsController(context) {
  const { elements, state, storage, actions } = context;
  let cloudActionInProgress = false;
  const call = (name, ...args) => actions.call(name, ...args);
  function persistPendingCloudChanges() {
    storage.write(storage.keys.pendingCloudChanges, {
      hasChanges: state.hasPendingCloudChanges,
      operationIds: [...state.pendingUploadOperationIds],
    });
  }
  function updatePendingCloudChangesUI() {
    const hasPending =
      state.syncSettings.accessMode !== "reader" &&
      state.hasPendingCloudChanges;
    [elements.cloudUploadTopButton, elements.cloudUploadButton]
      .filter(Boolean)
      .forEach((button) => {
        button.classList.toggle("has-pending-cloud-changes", hasPending);
        button.title = hasPending
          ? "Выгрузить в облако: есть невыгруженные изменения"
          : "Выгрузить в облако";
      });
  }
  function markPendingCloudChanges(operationIds = []) {
    if (state.syncSettings.accessMode === "reader") return;
    state.hasPendingCloudChanges = true;
    operationIds.forEach((value) => {
      const id = String(value || "").trim();
      if (id) state.pendingUploadOperationIds.add(id);
    });
    persistPendingCloudChanges();
    updatePendingCloudChangesUI();
  }
  function clearPendingCloudChanges() {
    state.hasPendingCloudChanges = false;
    state.pendingUploadOperationIds.clear();
    if (state.syncSettings.accessMode === "reader")
      localStorage.removeItem(storage.keys.pendingCloudChanges);
    else persistPendingCloudChanges();
    updatePendingCloudChangesUI();
  }
  function removeOperation(operationId) {
    state.operations = state.operations.filter(
      (operation) => operation.id !== operationId,
    );
    storage.write(storage.keys.operations, state.operations);
    markPendingCloudChanges();
    state.currentPage = 1;
    call("render");
  }
  async function onSyncSave({ announce = true } = {}) {
    const googleClientId = (
      elements.syncGoogleClientIdInput?.value ||
      state.syncSettings.googleClientId ||
      ""
    ).trim();
    const googleFileId = (
      elements.syncGoogleFileIdInput?.value ||
      state.syncSettings.googleFileId ||
      ""
    ).trim();
    const passphrase =
      elements.cloudPassphraseInput?.value ?? state.cloudPassphrase;
    const passphraseChanged = passphrase !== state.cloudPassphrase;
    if (passphraseChanged) {
      state.cloudPassphrase = passphrase;
      localStorage.setItem(storage.keys.cloudPassphrase, passphrase);
      call("resetCloudEncryptionMaterial");
    }
    state.syncSettings = sanitizeSyncSettings({
      googleClientId,
      googleFileId,
      accessMode:
        googleFileId === state.syncSettings.googleFileId
          ? state.syncSettings.accessMode
          : "unknown",
      googleAccountEmail: state.syncSettings.googleAccountEmail,
      lastSuccessfulSyncAt: state.syncSettings.lastSuccessfulSyncAt,
    });
    storage.write(storage.keys.syncSettings, state.syncSettings);
    call("renderSyncSettingsForm");
    call("updateCloudAccessUI");
    if (announce) {
      const message = passphraseChanged
        ? "Пароль-фраза сохранена. Выгрузите данные и отправьте читателям новую ссылку."
        : "Настройки сохранены.";
      call("setSyncStatus", message);
      call(
        "showAppNotice",
        passphraseChanged
          ? "Пароль-фраза сохранена."
          : "Настройки синхронизации сохранены.",
      );
    }
    return true;
  }
  async function onClearLocalData() {
    if (
      !window.confirm(
        "Сбросить приложение: удалить локальные операции, категории и настройки подключения к Google Drive?",
      )
    )
      return;
    state.operations = [];
    state.categories = [];
    state.hasPendingCloudChanges = false;
    state.pendingUploadOperationIds.clear();
    localStorage.removeItem(storage.keys.pendingCloudChanges);
    state.cloudPassphrase = "";
    localStorage.removeItem(storage.keys.cloudPassphrase);
    if (elements.cloudPassphraseInput) elements.cloudPassphraseInput.value = "";
    call("resetCloudEncryptionMaterial");
    state.syncSettings = {
      googleClientId: "",
      googleFileId: "",
      accessMode: "writer",
      googleAccountEmail: "",
      lastSuccessfulSyncAt: "",
    };
    state.searchText = "";
    state.activeTypeFilter = "all";
    state.activeYearFilter = new Set();
    state.activeMonthFilter = new Set();
    state.activeDayFilter = new Set();
    state.activeCategoryFilter = new Set();
    state.dateFrom = "";
    state.dateTo = "";
    state.currentPage = 1;
    state.categorySearchText = "";
    state.categoryCurrentPage = 1;
    [
      elements.categorySelect,
      elements.categoryPickerInput,
      elements.dateFromInput,
      elements.dateToInput,
    ]
      .filter(Boolean)
      .forEach((input) => {
        input.value = "";
      });
    if (elements.dateFromDisplay)
      elements.dateFromDisplay.textContent = "Выбрать дату";
    if (elements.dateToDisplay)
      elements.dateToDisplay.textContent = "Выбрать дату";
    storage.write(storage.keys.operations, state.operations);
    storage.write(storage.keys.categories, state.categories);
    storage.write(storage.keys.syncSettings, state.syncSettings);
    call("renderSyncSettingsForm");
    call("updateCloudAccessUI");
    call("resetQuickAdd");
    call("setQuickAddDate", call("getTodayInputDate"));
    call("renderCategoryOptions");
    call("render");
    call("renderLastSuccessfulSync");
    call("updateSyncSettingsVisibility", false);
    call(
      "setSyncStatus",
      "Приложение сброшено: локальные данные и настройки подключения очищены.",
    );
  }
  function exportToCsvFile() {
    const headers = [
      "Дата",
      "Описание",
      "Категория",
      "Контрагент",
      "Заметки",
      "Счет",
      "Счет-получатель перевода",
      "Сумма",
      "Баланс",
    ];
    const rows = enrichOperationsWithBalance(state.operations, (id) =>
      call("getCategoryName", id),
    )
      .sort(compareOperationsChronologicalDescending)
      .map((operation) => [
        formatCsvOperationDate(operation),
        "---",
        operation.categoryName || call("getCategoryName", operation.categoryId),
        "",
        operation.description || "",
        "M-Flow",
        "",
        signedAmount(operation).toFixed(2),
        Number(operation.balanceAfter || 0).toFixed(2),
      ]);
    const blob = new Blob(
      [
        "\uFEFF",
        [headers, ...rows]
          .map((row) => row.map(escapeCsvCell).join(","))
          .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Debit and Credit.csv";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    call("showAppNotice", "Файл операций выгружен.");
  }
  async function onImportCsvFile(event) {
    const input = event.target;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      const imported = parseDebitCreditCsv(await file.text());
      if (!imported.operations.length)
        throw new Error(
          "Не найдено операций с датой, категорией и ненулевой суммой.",
        );
      if (
        !window.confirm(
          `Загрузить ${imported.operations.length} операций из файла? Все локальные операции и категории будут заменены.`,
        )
      )
        return;
      state.operations = sanitizeOperations(imported.operations);
      state.categories = sanitizeCategories(imported.categories);
      state.activeYearFilter = new Set();
      state.activeMonthFilter = new Set();
      state.activeDayFilter = new Set();
      state.activeCategoryFilter = new Set();
      state.dateFrom = "";
      state.dateTo = "";
      state.currentPage = 1;
      [elements.dateFromInput, elements.dateToInput]
        .filter(Boolean)
        .forEach((field) => {
          field.value = "";
        });
      storage.write(storage.keys.operations, state.operations);
      storage.write(storage.keys.categories, state.categories);
      markPendingCloudChanges(
        state.operations.map((operation) => operation.id),
      );
      call("renderCategoryOptions");
      call("render");
      const message = `Загружено: ${state.operations.length} операций, ${state.categories.length} категорий.`;
      call("setSyncStatus", message);
      call("showAppNotice", message);
    } catch (error) {
      const message = `Не удалось загрузить файл: ${error?.message || "неизвестная ошибка"}`;
      call("setSyncStatus", message);
      call("showAppNotice", message, "error");
    } finally {
      if (input) input.value = "";
    }
  }
  function setCloudActionPending(action, pending) {
    const buttons =
      action === "upload"
        ? [elements.cloudUploadTopButton, elements.cloudUploadButton]
        : [
            elements.cloudDownloadTopButton,
            elements.cloudDownloadButton,
            elements.readerCloudDownloadButton,
          ];
    buttons.filter(Boolean).forEach((button) => {
      if (!button.dataset.idleLabel)
        button.dataset.idleLabel = button.textContent.trim();
      button.disabled = pending;
      button.classList.toggle("is-loading", pending);
      button.textContent = pending
        ? action === "upload"
          ? "Выгружаю..."
          : "Загружаю..."
        : button.dataset.idleLabel;
    });
  }
  async function onCloudAction(action, options = {}) {
    if (cloudActionInProgress) return;
    cloudActionInProgress = true;
    setCloudActionPending(action, true);
    const upload = action === "upload";
    call(
      "setSyncStatus",
      upload
        ? "Подготавливаю выгрузку в облако..."
        : "Подготавливаю загрузку из облака...",
    );
    call(
      "showAppNotice",
      upload
        ? "Подготавливаю выгрузку в облако..."
        : "Подготавливаю загрузку из облака...",
    );
    try {
      await onSyncSave({ announce: false });
      if (
        upload &&
        state.syncSettings.accessMode !== "writer" &&
        state.syncSettings.googleFileId
      ) {
        call("updateSyncSettingsVisibility", true);
        return call(
          "setSyncStatus",
          "Это устройство настроено только для чтения. Выгрузка недоступна.",
        );
      }
      const missing = call("getMissingSyncSettings", state.syncSettings);
      if (missing.length) {
        call("updateSyncSettingsVisibility", true);
        call(
          "setSyncStatus",
          `${upload ? "Выгрузка" : "Загрузка"} не выполнена: заполните ${missing.join(", ")}.`,
        );
        elements.syncGoogleClientIdInput?.focus();
        return;
      }
      await call(
        upload ? "uploadToGoogleDrive" : "downloadFromGoogleDrive",
        options,
      );
    } finally {
      cloudActionInProgress = false;
      setCloudActionPending(action, false);
    }
  }
  function bind() {
    elements.syncSaveButton?.addEventListener("click", onSyncSave);
    elements.clearDataButton?.addEventListener("click", onClearLocalData);
    elements.fileExportButton?.addEventListener("click", exportToCsvFile);
    elements.fileImportButton?.addEventListener("click", () =>
      elements.fileImportInput?.click(),
    );
    elements.fileImportInput?.addEventListener("change", onImportCsvFile);
    [elements.cloudUploadTopButton, elements.cloudUploadButton]
      .filter(Boolean)
      .forEach((button) =>
        button.addEventListener("click", () => onCloudAction("upload")),
      );
    [elements.cloudDownloadTopButton, elements.cloudDownloadButton]
      .filter(Boolean)
      .forEach((button) =>
        button.addEventListener("click", () => onCloudAction("download")),
      );
    elements.readerCloudDownloadButton?.addEventListener("click", () =>
      onCloudAction("download", { skipReplaceConfirmation: true }),
    );
  }
  return {
    bind,
    clearPendingCloudChanges,
    markPendingCloudChanges,
    removeOperation,
    updatePendingCloudChangesUI,
  };
}
