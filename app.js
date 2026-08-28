import {
  dateToDateOnlyString,
  getOperationDateValue,
  getTodayDate,
  getTodayInputDate,
  normalizeDateForInput,
  operationDateOnlyString,
  parseDateFromInput,
  parseDateFromValue,
} from "./modules/dates.js";
import {
  enrichOperationsWithBalance,
  formatMoney,
  formatOperationDate,
  getFilteredOperations,
  getOperationsByYear,
  getUuid,
  normalizeTextForSearch,
  round2,
  sanitizeOperations,
  signedAmount,
} from "./modules/operation-core.js";
import {
  createCategoryId,
  findCategoryByNormalizedName,
  getAllCategoriesSorted,
  getMatchedCategories,
  normalizeHexColor,
  pickCategoryColor,
  sanitizeCategories,
} from "./modules/category-core.js";
import {
  getMissingSyncSettings,
  sanitizeSyncSettings,
} from "./modules/sync-model.js";
import { createAppContext } from "./modules/app-context.js";
import {
  CATEGORY_COLORS,
  createElements,
  createInitialState,
  CURRENT_YEAR_LOOKBACK,
  DEFAULT_CATEGORIES,
  STORAGE_KEYS,
} from "./modules/app-config.js";
import { createOperationsListController } from "./modules/operations-list.js";
import { createCategoryPickerController } from "./modules/category-picker.js";
import { createQuickAddController } from "./modules/quick-add-controller.js";
import { createFiltersView } from "./modules/filters-view.js";
import { createSyncSettingsView } from "./modules/sync-settings-view.js";
import { createAppUiController } from "./modules/app-ui-controller.js";
import { createFilterController } from "./modules/filter-controller.js";
import { createReceiptShareController } from "./modules/receipt-share-controller.js";
import { createDataActionsController } from "./modules/data-actions-controller.js";
import { createCloudController } from "./modules/cloud-controller.js";
import { createReaderAccessController } from "./modules/reader-access-controller.js";
import { isValidEncryptionKey } from "./modules/cloud-crypto.js";

(() => {
  const elements = createElements();
  const state = createInitialState();
  const context = createAppContext({
    elements,
    state,
    storage: { keys: STORAGE_KEYS, read: readJson, write: writeJson },
  });
  let appNoticeTimer;
  let syncSettingsView;

  const categoryPickerController = createCategoryPickerController({
    state,
    elements,
    categoryColors: CATEGORY_COLORS,
    createCategoryId,
    escapeHtml,
    findCategoryByNormalizedName,
    getMatchedCategories,
    markPendingCloudChanges: (...args) =>
      context.actions.call("markPendingCloudChanges", ...args),
    normalizeHexColor,
    normalizeText: normalizeTextForSearch,
    pickCategoryColor,
    writeCategories: (value) => writeJson(STORAGE_KEYS.categories, value),
  });
  const quickAddController = createQuickAddController({
    state,
    elements,
    closeCategoryPicker: categoryPickerController.close,
    dateToDateOnlyString,
    ensureCategorySelection: categoryPickerController.ensureSelection,
    getAllCategoriesSorted,
    getOperationDateValue,
    getTodayInputDate,
    getUuid,
    markPendingCloudChanges: (...args) =>
      context.actions.call("markPendingCloudChanges", ...args),
    normalizeDateForInput,
    onHideSyncSettings: () =>
      context.actions.call("updateSyncSettingsVisibility", false),
    openDatePicker: (...args) =>
      context.actions.call("openNativeDatePicker", ...args),
    parseDateFromInput,
    parseDateFromValue,
    render: () => context.actions.call("render"),
    renderCategoryOptions: categoryPickerController.renderOptions,
    round2,
    setCategorySelection: categoryPickerController.setSelection,
    setSyncStatus: (...args) => context.actions.call("setSyncStatus", ...args),
    writeAmountsHidden: (value) => writeJson(STORAGE_KEYS.amountsHidden, value),
    writeOperations: (value) => writeJson(STORAGE_KEYS.operations, value),
  });
  const filtersView = createFiltersView({
    state,
    elements,
    currentYearLookback: CURRENT_YEAR_LOOKBACK,
    escapeHtml,
    formatMoney,
    getCategoriesForPicker: categoryPickerController.getCategoriesForPicker,
    getCategoryById,
    getCategoryName,
    loadMoreOperations,
    round2,
  });
  const cloudController = createCloudController(context, { createId: getUuid });
  const readerAccessController = createReaderAccessController(context, {
    isValidEncryptionKey,
  });
  syncSettingsView = createSyncSettingsView({
    state,
    elements,
    getReaderConnectionLink: readerAccessController.getReaderConnectionLink,
    onCloseQuickAdd: () => quickAddController.updateVisibility(false),
  });
  const dataActionsController = createDataActionsController(context);
  const appUiController = createAppUiController(context);
  const filterController = createFilterController(context);
  const receiptShareController = createReceiptShareController(context);
  const operationsListController = createOperationsListController({
    operationsList: elements.operationsList,
    getAccessMode: () => state.syncSettings.accessMode,
    getOperationById: (id) => state.operations.find((item) => item.id === id),
    getPendingOperationIds: () => state.pendingUploadOperationIds,
    getOperationDateValue,
    getTodayDate,
    operationDateOnlyString,
    escapeHtml,
    formatMoney,
    formatOperationDate,
    onDelete: (id) => context.actions.call("removeOperation", id),
    onOpen: (operation, options) => quickAddController.open(operation, options),
  });

  registerActions();

  async function main() {
    enableLiveReload();
    state.operations = sanitizeOperations(
      readJson(STORAGE_KEYS.operations, []),
    );
    state.categories = sanitizeCategories(
      readJson(STORAGE_KEYS.categories, DEFAULT_CATEGORIES),
    );
    state.syncSettings = sanitizeSyncSettings(
      readJson(STORAGE_KEYS.syncSettings, state.syncSettings),
    );
    state.amountsHidden = readJson(STORAGE_KEYS.amountsHidden, false) === true;
    const pending = readJson(STORAGE_KEYS.pendingCloudChanges, {});
    state.pendingUploadOperationIds = new Set(
      Array.isArray(pending?.operationIds)
        ? pending.operationIds
            .map((id) => String(id || "").trim())
            .filter(Boolean)
        : [],
    );
    state.hasPendingCloudChanges =
      pending?.hasChanges === true || state.pendingUploadOperationIds.size > 0;
    state.cloudPassphrase =
      localStorage.getItem(STORAGE_KEYS.cloudPassphrase) || "";
    state.cloudEncryptionKey = cloudController.getStoredCloudEncryptionKey();
    state.cloudEncryptionSalt = cloudController.getStoredCloudEncryptionSalt();
    if (elements.cloudPassphraseInput)
      elements.cloudPassphraseInput.value = state.cloudPassphrase;
    quickAddController.applyAmountsVisibility();
    const connection = readerAccessController.consumeCloudConnectionSettings();
    if (connection) {
      cloudController.setCloudEncryptionKey(connection.encryptionKey);
      state.syncSettings = sanitizeSyncSettings({
        ...state.syncSettings,
        ...connection,
        accessMode: "unknown",
      });
      writeJson(STORAGE_KEYS.syncSettings, state.syncSettings);
      syncSettingsView.setActiveTab("reader");
    }
    renderSyncSettingsForm();
    syncSettingsView.updateCloudAccessUI();
    renderLastSuccessfulSync();
    if (connection)
      setSyncStatus(
        "Подключение читателя сохранено. Нажмите «Синхронизировать».",
      );
    quickAddController.applyType();
    syncSettingsView.updateSyncSettingsVisibility(false);
    syncSettingsView.updateInstructionsVisibility(false);
    quickAddController.updateVisibility(false);
    filtersView.updateSearchVisibility(false);
    quickAddController.setDate(getTodayInputDate());
    categoryPickerController.renderOptions();
    filtersView.renderYearFilters();
    filtersView.renderCategoryFilters();
    bindEvents();
    await receiptShareController.receiveFromShareTarget();
    render();
    registerServiceWorker();
  }

  function registerActions() {
    const { actions } = context;
    actions.register("render", render);
    actions.register("setSyncStatus", setSyncStatus);
    actions.register("showAppNotice", showAppNotice);
    actions.register("escapeHtml", escapeHtml);
    actions.register("formatMoney", formatMoney);
    actions.register("formatOperationDate", formatOperationDate);
    actions.register("getCategoryName", getCategoryName);
    actions.register("getTodayInputDate", getTodayInputDate);
    actions.register("normalizeDateForInput", normalizeDateForInput);
    actions.register("renderSyncSettingsForm", renderSyncSettingsForm);
    actions.register("renderLastSuccessfulSync", renderLastSuccessfulSync);
    actions.register(
      "renderCategoryOptions",
      categoryPickerController.renderOptions,
    );
    actions.register("closeCategoryPicker", categoryPickerController.close);
    actions.register(
      "setCategorySelection",
      categoryPickerController.setSelection,
    );
    actions.register("applyQuickAddType", quickAddController.applyType);
    actions.register("setQuickAddAmount", quickAddController.setAmount);
    actions.register("setQuickAddDate", quickAddController.setDate);
    actions.register("setQuickAddMode", quickAddController.setMode);
    actions.register(
      "updateQuickAddVisibility",
      quickAddController.updateVisibility,
    );
    actions.register("resetQuickAdd", quickAddController.dismiss);
    actions.register(
      "updateSearchVisibility",
      filtersView.updateSearchVisibility,
    );
    actions.register("updateSyncSettingsVisibility", (...args) =>
      syncSettingsView.updateSyncSettingsVisibility(...args),
    );
    actions.register(
      "updateInstructionsVisibility",
      syncSettingsView.updateInstructionsVisibility,
    );
    actions.register(
      "updateCloudAccessUI",
      syncSettingsView.updateCloudAccessUI,
    );
    actions.register(
      "openNativeDatePicker",
      appUiController.openNativeDatePicker,
    );
    actions.register("getMissingSyncSettings", getMissingSyncSettings);
    actions.register(
      "markPendingCloudChanges",
      dataActionsController.markPendingCloudChanges,
    );
    actions.register(
      "clearPendingCloudChanges",
      dataActionsController.clearPendingCloudChanges,
    );
    actions.register("removeOperation", dataActionsController.removeOperation);
    actions.register(
      "getGoogleAccessToken",
      cloudController.getGoogleAccessToken,
    );
    actions.register(
      "setCloudEncryptionKey",
      cloudController.setCloudEncryptionKey,
    );
    actions.register(
      "resetCloudEncryptionMaterial",
      cloudController.resetCloudEncryptionMaterial,
    );
    actions.register(
      "uploadToGoogleDrive",
      cloudController.uploadToGoogleDrive,
    );
    actions.register(
      "downloadFromGoogleDrive",
      cloudController.downloadFromGoogleDrive,
    );
    actions.register(
      "getReaderConnectionLink",
      readerAccessController.getReaderConnectionLink,
    );
    actions.register(
      "refreshReaderConnectionLink",
      readerAccessController.refreshReaderConnectionLink,
    );
  }

  function bindEvents() {
    quickAddController.bind();
    categoryPickerController.bind();
    syncSettingsView.bind();
    appUiController.bind();
    filterController.bind();
    dataActionsController.bind();
    readerAccessController.bind();
    receiptShareController.bind();
    operationsListController.bind();
  }

  function render() {
    dataActionsController.updatePendingCloudChangesUI();
    const enriched = enrichOperationsWithBalance(
      state.operations,
      getCategoryName,
    );
    const filtered = getFilteredOperations(
      getOperationsByYear(enriched, state),
      state,
    );
    const pages = Math.ceil(filtered.length / state.pageSize);
    if (state.currentPage > Math.max(pages, 1)) state.currentPage = 1;
    const visible = filtered.slice(0, state.currentPage * state.pageSize);
    filtersView.updateBalances(
      filtered.reduce((sum, operation) => sum + signedAmount(operation), 0),
    );
    filtersView.renderPeriodFilters();
    filtersView.renderCategoryCharts(filtered);
    filtersView.renderYearFilters();
    filtersView.renderCategoryFilters();
    categoryPickerController.renderOptions();
    operationsListController.render(visible);
    filtersView.updatePager(filtered.length, pages);
  }

  function getCategoryName(categoryId) {
    return (
      state.categories.find((category) => category.id === categoryId)?.name ||
      "Без категории"
    );
  }
  function getCategoryById(categoryId) {
    return (
      state.categories.find((category) => category.id === categoryId) || null
    );
  }
  function loadMoreOperations() {
    const total = getFilteredOperations(
      getOperationsByYear(
        enrichOperationsWithBalance(state.operations, getCategoryName),
        state,
      ),
      state,
    ).length;
    if (state.currentPage < Math.ceil(total / state.pageSize)) {
      state.currentPage += 1;
      render();
    }
  }
  function renderSyncSettingsForm() {
    if (elements.syncGoogleClientIdInput)
      elements.syncGoogleClientIdInput.value =
        state.syncSettings.googleClientId;
    if (elements.syncGoogleFileIdInput)
      elements.syncGoogleFileIdInput.value = state.syncSettings.googleFileId;
  }
  function setSyncStatus(message) {
    if (elements.syncStatus) elements.syncStatus.textContent = message || "";
  }
  function showAppNotice(message, tone = "success") {
    if (!elements.appNotice) return;
    clearTimeout(appNoticeTimer);
    elements.appNotice.textContent = message;
    elements.appNotice.dataset.tone = tone;
    elements.appNotice.hidden = false;
    appNoticeTimer = setTimeout(() => {
      elements.appNotice.hidden = true;
      delete elements.appNotice.dataset.tone;
    }, 4500);
  }
  function renderLastSuccessfulSync() {
    if (!elements.lastSuccessfulSync) return;
    const time = Date.parse(state.syncSettings.lastSuccessfulSyncAt || "");
    elements.lastSuccessfulSync.textContent = Number.isFinite(time)
      ? "· " +
        new Date(time).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "· ещё не было";
  }
  function enableLiveReload() {
    if (typeof EventSource === "undefined" || location.protocol === "file:")
      return;
    try {
      const source = new EventSource("/__reload");
      source.onmessage = () => window.location.reload();
      source.onerror = () => source.close();
    } catch {
      /* Local reload is optional. */
    }
  }
  function registerServiceWorker() {
    if (
      ["localhost", "127.0.0.1", "::1"].includes(location.hostname) ||
      !("serviceWorker" in navigator)
    )
      return;
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });
    navigator.serviceWorker
      .register("sw.js?v=172", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {});
  }
  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  main();
})();


