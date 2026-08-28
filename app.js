import {
  createQrDetector as createReceiptQrDetector,
  decodeReceiptQrFromFile,
  detectQrFromSource as detectReceiptQrFromSource,
  parseReceiptQr as parseReceiptQrFromValue,
} from "./modules/receipt-parser.js";
import { createReceiptScanner } from "./modules/receipt-scanner.js";
import {
  dateToDateOnlyString,
  getOperationDateValue,
  getTodayDate,
  getTodayInputDate,
  isValidTimestamp,
  normalizeDateForInput,
  operationDateOnlyString,
  parseDateFromInput,
  parseDateFromValue,
  parseDateToDateOnlyString,
  parseOperationDate,
} from "./modules/dates.js";
import { escapeCsvCell, formatCsvOperationDate, parseDebitCreditCsv } from "./modules/csv-transfer.js";
import { compareOperationsChronologicalAscending, compareOperationsChronologicalDescending, enrichOperationsWithBalance, formatAmountForCancellation, formatDate, formatMoney, formatOperationDate, formatOperationDateTime, getDisplayOperationId, getFilteredOperations, getOperationYear, getOperationsByYear, getUuid, mergeOperations, normalizeAmountForSearch, normalizeTextForSearch, prepareOperationsForSync, prepareRemoteOperationForSync, round2, signedAmount } from "./modules/operation-core.js";
import { createCategoryId as getCategoryId, findCategoryByNormalizedName, getAllCategoriesSorted, getMatchedCategories, mergeCategories, normalizeHexColor, pickCategoryColor, sanitizeCategories } from "./modules/category-core.js";
import { base64ToBytes, bytesToBase64, createEncryptionSalt, decryptCloudPayload as decryptCloudPayloadValue, deriveEncryptionKey, encryptCloudPayload as encryptCloudPayloadValue, isExpectedKdf, isValidEncryptionKey } from "./modules/cloud-crypto.js";
import { createReaderPermission, deleteReaderPermission as deleteDriveReaderPermission, downloadDriveData, findLatestDriveFile, getDriveAccessMode, getGoogleAccountEmail, listReaderPermissions, requestGoogleAccessToken, uploadDriveData } from "./modules/google-drive-api.js";
import { createReaderConnectionLink, getMissingSyncSettings, parseReaderConnectionLink, sanitizeSyncSettings } from "./modules/sync-model.js";

(() => {
  const STORAGE_KEYS = {
    operations: "moneyflow-operations-v1",
    categories: "moneyflow-categories-v1",
    syncSettings: "moneyflow-sync-settings-v1",
    amountsHidden: "moneyflow-amounts-hidden-v1",
    pendingCloudChanges: "moneyflow-pending-cloud-changes-v1",
    cloudPassphrase: "moneyflow-cloud-passphrase-v1",
    cloudEncryptionKey: "moneyflow-cloud-encryption-key-v1",
    cloudEncryptionSalt: "moneyflow-cloud-encryption-salt-v1",
  };

  const DEFAULT_CATEGORIES = [];

  const CATEGORY_COLORS = [
    "#EF4444", "#F97316", "#EAB308", "#84CC16", "#22C55E", "#14B8A6",
    "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899",
  ];
  const CATEGORY_PAGE_SIZE = 20;
  const CATEGORY_SEARCH_SIMILARITY_THRESHOLD = 0.48;
  const CURRENT_YEAR_LOOKBACK = 5;
  const SYNC_CREATED_AT_OFFSET_MS = 5 * 60 * 1000;

  const elements = {
    form: document.getElementById("operation-form"),
    typeInput: document.getElementById("operation-type"),
    typeToggle: document.getElementById("operation-type-toggle"),
    categorySelect: document.getElementById("operation-category"),
    categoryPicker: document.getElementById("category-picker"),
    categoryPickerInput: document.getElementById("operation-category-input"),
    categoryPickerToggle: document.getElementById("category-picker-toggle"),
    categoryPickerPopover: document.getElementById("category-picker-popover"),
    categoryPickerList: document.getElementById("category-picker-list"),
    categoryCreateToggleButton: document.getElementById("category-create-toggle"),
    categoryCreateNameInput: document.getElementById("category-create-name"),
    categoryCreateSaveButton: document.getElementById("category-create-save"),
    categoryCreateCancelButton: document.getElementById("category-create-cancel"),
    categoryCreateForm: document.getElementById("category-create-form"),
    amountInput: document.getElementById("operation-amount"),
    amountDisplay: document.getElementById("operation-amount-display"),
    amountKeypad: document.getElementById("amount-keypad"),
    popularCategories: document.getElementById("popular-categories"),
    descriptionInput: document.getElementById("operation-description"),
    operationDateInput: document.getElementById("operation-date"),
    operationDateDisplay: document.getElementById("operation-date-display"),
    operationDatePickerInput: document.getElementById("operation-date-picker"),
    operationDatePickerButton: document.getElementById("operation-date-picker-button"),
    balanceCurrent: document.getElementById("balance-current"),
    lastSuccessfulSync: document.getElementById("last-successful-sync"),
    chartsToggleButton: document.getElementById("charts-toggle"),
    categoryCharts: document.getElementById("category-charts"),
    incomeCategoryChart: document.getElementById("income-category-chart"),
    expenseCategoryChart: document.getElementById("expense-category-chart"),
    searchSection: document.getElementById("search-section"),
    searchToggleButton: document.getElementById("search-toggle"),
    searchField: document.getElementById("search-field"),
    searchFilters: document.getElementById("search-filters"),
    searchInput: document.getElementById("search-input"),
    operationsList: document.getElementById("operations-list"),
    chipContainer: document.querySelector(".chips"),
    balanceTitle: document.getElementById("balance-title"),
    operationsLoadSentinel: document.getElementById("operations-load-sentinel"),
    yearFilterContainer: document.getElementById("year-filters"),
    monthFilterContainer: document.getElementById("month-filters"),
    dayFilterContainer: document.getElementById("day-filters"),
    dateFromInput: document.getElementById("date-from"),
    dateToInput: document.getElementById("date-to"),
    dateFromDisplay: document.getElementById("date-from-display"),
    dateToDisplay: document.getElementById("date-to-display"),
    dateFromPickerInput: document.getElementById("date-from-picker"),
    dateToPickerInput: document.getElementById("date-to-picker"),
    categoryFilterContainer: document.getElementById("category-filters"),
    syncToggleButton: document.getElementById("sync-settings-toggle"),
    syncSettingsCard: document.getElementById("sync-settings-section"),
    syncGoogleClientIdField: document.getElementById("google-client-id-field"),
    instructionsToggleButton: document.getElementById("instructions-toggle"),
    instructionsCard: document.getElementById("instructions-section"),
    instructionsCloseButton: document.getElementById("instructions-close"),
    amountsVisibilityToggleButton: document.getElementById("amounts-visibility-toggle"),
    cloudPassphraseInput: document.getElementById("cloud-encryption-passphrase"),
    syncGoogleClientIdInput: document.getElementById("google-client-id"),
    syncGoogleFileIdInput: document.getElementById("google-file-id"),
    syncTabs: document.getElementById("sync-tabs"),
    syncEditorTabButton: document.getElementById("sync-tab-editor"),
    syncReaderTabButton: document.getElementById("sync-tab-reader"),
    syncEditorPanel: document.getElementById("sync-editor-panel"),
    syncReaderPanel: document.getElementById("sync-reader-panel"),
    readerLinkConnect: document.getElementById("reader-link-connect"),
    readerLinkInput: document.getElementById("reader-link-input"),
    readerLinkApplyButton: document.getElementById("reader-link-apply"),
    syncSaveButton: document.getElementById("cloud-save"),
    cloudUploadTopButton: document.getElementById("cloud-upload-top"),
    cloudDownloadTopButton: document.getElementById("cloud-download-top"),
    cloudUploadButton: document.getElementById("cloud-upload"),
    cloudDownloadButton: document.getElementById("cloud-download"),
    readerCloudDownloadButton: document.getElementById("reader-cloud-download"),
    readerInvite: document.getElementById("reader-invite"),
    readerEmailInput: document.getElementById("reader-email"),
    readerInviteButton: document.getElementById("reader-invite-button"),
    readerInviteStatus: document.getElementById("reader-invite-status"),
    readerConnection: document.getElementById("reader-connection"),
    readerConnectionLink: document.getElementById("reader-connection-link"),
    readerConnectionRefreshButton: document.getElementById("reader-connection-refresh"),
    readerConnectionShareButton: document.getElementById("reader-connection-share"),
    readerConnectionStatus: document.getElementById("reader-connection-status"),
    readerAccessManagement: document.getElementById("reader-access-management"),
    readerAccessRefreshButton: document.getElementById("reader-access-refresh"),
    readerAccessList: document.getElementById("reader-access-list"),
    readerAccessStatus: document.getElementById("reader-access-status"),
    syncStatus: document.getElementById("cloud-status"),
    appNotice: document.getElementById("app-notice"),
    fileExportButton: document.getElementById("file-export"),
    fileImportButton: document.getElementById("file-import"),
    fileImportInput: document.getElementById("file-import-input"),
    clearDataButton: document.getElementById("cloud-clear-data"),
    quickAddToggleButton: document.getElementById("quick-add-toggle"),
    quickAddCard: document.getElementById("quick-add-card"),
    quickAddTitle: document.getElementById("quick-add-title"),
    operationSubmitButton: document.getElementById("operation-submit"),
    quickAddDismissButton: document.getElementById("quick-add-dismiss"),
    sharedReceiptsCard: document.getElementById("shared-receipts-card"),
    sharedReceiptsCount: document.getElementById("shared-receipts-count"),
    sharedReceiptsList: document.getElementById("shared-receipts-list"),
    receiptScanToggleButton: document.getElementById("receipt-scan-toggle"),
    receiptScannerCard: document.getElementById("receipt-scanner-card"),
    receiptScannerVideo: document.getElementById("receipt-scanner-video"),
    receiptScannerCloseButton: document.getElementById("receipt-scanner-close"),
    receiptScannerStatus: document.getElementById("receipt-scanner-status"),
  };

  const state = {
    operations: [],
    categories: [...DEFAULT_CATEGORIES],
    syncSettings: {
      googleClientId: "",
      googleFileId: "",
      accessMode: "writer",
      googleAccountEmail: "",
      lastSuccessfulSyncAt: "",
    },
    amountsHidden: false,
    cloudPassphrase: "",
    cloudEncryptionKey: "",
    cloudEncryptionSalt: "",
    hasPendingCloudChanges: false,
    pendingUploadOperationIds: new Set(),
    searchText: "",
    activeTypeFilter: "all",
    activeYearFilter: new Set(),
    activeMonthFilter: new Set(),
    activeDayFilter: new Set(),
    dateFrom: "",
    dateTo: "",
    activeCategoryFilter: new Set(),
    operationType: "income",
    currentPage: 1,
    pageSize: 20,
    categorySearchText: "",
    categoryCurrentPage: 1,
    categorySearchEditing: false,
    quickAddMode: "add",
    quickAddSourceOperationId: "",
    readerPermissions: [],
    sharedReceiptDrafts: [],
  };

  let searchDebounce;
  let categoryPickerDebounce;
  let operationLongPressTimer;
  let longPressHandledOperationId = null;
  let activeSyncTab = "editor";
  let appNoticeTimer;
  let chartsOpen = false;
  let periodDrag = null;
  let ignorePeriodClick = false;
  let operationsLoadObserver = null;
  let cloudActionInProgress = false;
  let sharedReceiptReceiveInProgress = false;
  let receiptScanner = null;

  async function main() {
    enableLiveReload();
    const persistedOperations = readJson(STORAGE_KEYS.operations, []);
    state.operations = sanitizeOperations(persistedOperations);
    state.categories = sanitizeCategories(readJson(STORAGE_KEYS.categories, DEFAULT_CATEGORIES));
    state.syncSettings = sanitizeSyncSettings(readJson(STORAGE_KEYS.syncSettings, state.syncSettings));
    state.amountsHidden = readJson(STORAGE_KEYS.amountsHidden, false) === true;
    const pendingCloudChanges = readJson(STORAGE_KEYS.pendingCloudChanges, {});
    state.pendingUploadOperationIds = new Set(
      Array.isArray(pendingCloudChanges?.operationIds)
        ? pendingCloudChanges.operationIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
    );
    state.hasPendingCloudChanges = pendingCloudChanges?.hasChanges === true || state.pendingUploadOperationIds.size > 0;
    state.cloudPassphrase = localStorage.getItem(STORAGE_KEYS.cloudPassphrase) || "";
    state.cloudEncryptionKey = getStoredCloudEncryptionKey();
    state.cloudEncryptionSalt = getStoredCloudEncryptionSalt();
    if (elements.cloudPassphraseInput) elements.cloudPassphraseInput.value = state.cloudPassphrase;
    applyAmountsVisibility();
    const connectionSettings = consumeCloudConnectionSettings();
    if (connectionSettings) {
      setCloudEncryptionKey(connectionSettings.encryptionKey);
      state.syncSettings = sanitizeSyncSettings({ ...state.syncSettings, ...connectionSettings, accessMode: "unknown" });
      await persistSyncSettings();
      activeSyncTab = "reader";
    }

    renderSyncSettingsForm();
    updateCloudAccessUI();
    renderLastSuccessfulSync();
    if (connectionSettings) {
      setSyncStatus("Подключение читателя сохранено. Нажмите «Синхронизировать».");
    }
    syncApplyTypeFromState();
    updateSyncSettingsVisibility(false);
    updateInstructionsVisibility(false);
    updateQuickAddVisibility(false);
    updateSearchVisibility(false);
    setQuickAddDate(getTodayInputDate());
    renderCategoryOptions();
    renderYearFilters();
    renderCategoryFilters();
    bindEvents();
    await receiveSharedReceiptsFromShareTarget();
    render();
    registerServiceWorker();
  }

  function enableLiveReload() {
    if (typeof EventSource === "undefined" || location.protocol === "file:") return;
    try {
      const es = new EventSource("/__reload");
      es.onmessage = () => {
        window.location.reload();
      };
      es.onerror = () => {
        es.close();
      };
    } catch {
      // no-op
    }
  }

  function registerServiceWorker() {
    const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
    if (isLocalHost) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js?v=151").then((registration) => registration.update()).catch(() => {});
  }

  async function receiveSharedReceiptsFromShareTarget() {
    if (sharedReceiptReceiveInProgress) return;
    const pageUrl = new URL(window.location.href);
    const isSharedLaunch = pageUrl.searchParams.get("shared-checks") === "1";

    if (isSharedLaunch) {
      pageUrl.searchParams.delete("shared-checks");
      window.history.replaceState({}, "", `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`);
    }

    if (!("serviceWorker" in navigator)) {
      if (isSharedLaunch) showAppNotice("Приём чеков недоступен: браузер не поддерживает PWA.", "error");
      return;
    }

    sharedReceiptReceiveInProgress = true;
    try {
      const registration = await navigator.serviceWorker.ready;
      const worker = navigator.serviceWorker.controller || registration.active;
      if (!worker) throw new Error("не удалось получить файлы из системного меню");

      const sharedReceipts = await requestSharedReceipts(worker);
      if (!sharedReceipts.length) {
        if (isSharedLaunch) throw new Error("картинки чеков не найдены");
        return;
      }

      state.sharedReceiptDrafts = await Promise.all(
        sharedReceipts.map((receipt, index) => createSharedReceiptDraft(receipt, index)),
      );
      worker.postMessage({ type: "moneyflow:clear-shared-receipts", ids: sharedReceipts.map((receipt) => receipt.id) });
      renderSharedReceiptQueue();

      const recognizedCount = state.sharedReceiptDrafts.filter((receipt) => receipt.status === "ready").length;
      const message = recognizedCount
        ? `Получено чеков: ${sharedReceipts.length}. QR распознано: ${recognizedCount}.`
        : "Картинки получены, но QR-коды распознать не удалось.";
      showAppNotice(message, recognizedCount ? "success" : "error");
    } catch (error) {
      showAppNotice(`Не удалось обработать переданные чеки: ${error?.message || "неизвестная ошибка"}`, "error");
    } finally {
      sharedReceiptReceiveInProgress = false;
    }
  }

  function requestSharedReceipts(worker) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => reject(new Error("истекло время ожидания файлов")), 8000);
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        const payload = event.data || {};
        if (payload.error) {
          reject(new Error(payload.error));
          return;
        }
        resolve(Array.isArray(payload.receipts) ? payload.receipts : []);
      };
      worker.postMessage({ type: "moneyflow:get-shared-receipts" }, [channel.port2]);
    });
  }

  async function createSharedReceiptDraft(receipt, index) {
    const fallbackId = `shared-${Date.now()}-${index}`;
    const name = String(receipt?.name || `Чек ${index + 1}`);
    try {
      const rawQr = await decodeReceiptQrFromFile(receipt?.file, name);
      const parsedReceipt = parseReceiptQrFromValue(rawQr);
      return {
        id: String(receipt?.id || fallbackId),
        name,
        status: "ready",
        amount: parsedReceipt.amount,
        operationDate: parsedReceipt.operationDate,
        fiscalNumber: parsedReceipt.fiscalNumber,
        fiscalDocument: parsedReceipt.fiscalDocument,
      };
    } catch (error) {
      return {
        id: String(receipt?.id || fallbackId),
        name,
        status: "error",
        error: error?.message || "не удалось распознать QR-код",
      };
    }
  }

  function renderSharedReceiptQueue() {
    if (!elements.sharedReceiptsCard || !elements.sharedReceiptsList) return;
    const drafts = state.sharedReceiptDrafts;
    elements.sharedReceiptsCard.hidden = drafts.length === 0;
    if (elements.sharedReceiptsCount) elements.sharedReceiptsCount.textContent = String(drafts.length);
    if (!drafts.length) {
      elements.sharedReceiptsList.innerHTML = "";
      return;
    }

    elements.sharedReceiptsList.innerHTML = drafts.map((receipt) => {
      if (receipt.status !== "ready") {
        return `<article class="shared-receipt shared-receipt--error" data-shared-receipt-id="${escapeHtml(receipt.id)}"><div><strong>${escapeHtml(receipt.name)}</strong><p>${escapeHtml(receipt.error)}</p></div><button type="button" class="btn btn--secondary" data-shared-receipt-action="dismiss">Убрать</button></article>`;
      }
      const fiscalDetails = [receipt.fiscalNumber ? `ФН ${receipt.fiscalNumber}` : "", receipt.fiscalDocument ? `ФД ${receipt.fiscalDocument}` : ""].filter(Boolean).join(" · ");
      return `<article class="shared-receipt" data-shared-receipt-id="${escapeHtml(receipt.id)}"><div><strong>${escapeHtml(receipt.name)}</strong><p>${escapeHtml(formatOperationDate({ operationDate: receipt.operationDate }))} · <b>${escapeHtml(formatMoney(receipt.amount))} ₽</b></p>${fiscalDetails ? `<small>${escapeHtml(fiscalDetails)}</small>` : ""}</div><div class="shared-receipt-actions"><button type="button" class="btn" data-shared-receipt-action="fill">Открыть операцию</button><button type="button" class="btn btn--secondary" data-shared-receipt-action="dismiss" aria-label="Убрать чек">×</button></div></article>`;
    }).join("");
  }

  function onSharedReceiptQueueClick(event) {
    const actionButton = event.target.closest("[data-shared-receipt-action]");
    if (!actionButton) return;
    const row = actionButton.closest("[data-shared-receipt-id]");
    const receiptId = row?.getAttribute("data-shared-receipt-id");
    const receipt = state.sharedReceiptDrafts.find((item) => item.id === receiptId);
    if (!receipt) return;

    if (actionButton.dataset.sharedReceiptAction === "dismiss") {
      state.sharedReceiptDrafts = state.sharedReceiptDrafts.filter((item) => item.id !== receipt.id);
      renderSharedReceiptQueue();
      return;
    }

    if (receipt.status !== "ready") return;
    if (state.syncSettings.accessMode === "reader") {
      showAppNotice("На устройстве читателя операции добавлять нельзя.", "error");
      return;
    }

    updateSyncSettingsVisibility(false);
    updateQuickAddVisibility(true);
    closeCategoryPicker();
    setQuickAddMode("add");
    state.operationType = "expense";
    syncApplyTypeFromState();
    setAmountValue(String(receipt.amount));
    if (elements.categorySelect) elements.categorySelect.value = "";
    if (elements.categoryPickerInput) elements.categoryPickerInput.value = "";
    if (elements.descriptionInput) elements.descriptionInput.value = "";
    setQuickAddDate(normalizeDateForInput(receipt.operationDate));
    elements.form?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function getReceiptScanner() {
    if (receiptScanner) return receiptScanner;
    receiptScanner = createReceiptScanner({
      elements: {
        card: elements.receiptScannerCard,
        status: elements.receiptScannerStatus,
        video: elements.receiptScannerVideo,
      },
      isReadOnly: () => state.syncSettings.accessMode === "reader",
      createDetector: createReceiptQrDetector,
      detectQr: detectReceiptQrFromSource,
      parseReceipt: parseReceiptQrFromValue,
      onReceiptRecognized: (parsedReceipt) => {
        state.sharedReceiptDrafts.unshift({
          id: `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: "Сканированный чек",
          status: "ready",
          ...parsedReceipt,
        });
        renderSharedReceiptQueue();
        elements.sharedReceiptsCard?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      },
    });
    return receiptScanner;
  }

  function onReceiptScanToggle() {
    return getReceiptScanner().toggle();
  }

  function closeReceiptScanner() {
    receiptScanner?.close();
  }

  function bindEvents() {
    elements.form.addEventListener("submit", onAddOperation);
    elements.quickAddDismissButton?.addEventListener("click", onQuickAddDismiss);
    elements.amountKeypad?.addEventListener("click", onAmountKeypadClick);
    if (elements.typeToggle) {
      elements.typeToggle.addEventListener("click", onTypeToggleClick);
    }
    elements.categoryPickerInput.addEventListener("focus", openCategoryPicker);
    elements.categoryPickerInput.addEventListener("click", openCategoryPicker);
    elements.categoryPickerInput.addEventListener("keydown", onCategoryInputKeydown);
    elements.categoryPickerInput.addEventListener("input", onCategoryInputChange);
    elements.categoryPickerToggle.addEventListener("click", toggleCategoryPicker);
    elements.categoryCreateToggleButton?.addEventListener("click", openCategoryCreator);
    elements.categoryCreateSaveButton?.addEventListener("click", onCreateCategory);
    elements.categoryCreateCancelButton?.addEventListener("click", closeCategoryCreator);
    elements.categoryPickerList.addEventListener("click", onCategoryPickerSelect);
    elements.popularCategories?.addEventListener("click", onPopularCategoryClick);
    elements.searchToggleButton?.addEventListener("click", onSearchToggle);
    elements.searchInput.addEventListener("input", onSearchInput);
    elements.yearFilterContainer?.addEventListener("click", onYearFilterClick);
    elements.monthFilterContainer?.addEventListener("click", onPeriodFilterClick);
    elements.dayFilterContainer?.addEventListener("click", onPeriodFilterClick);
    [elements.monthFilterContainer, elements.dayFilterContainer].forEach((container) => {
      container?.addEventListener("pointerdown", onPeriodPointerDown);
      container?.addEventListener("pointermove", onPeriodPointerMove);
      container?.addEventListener("pointerup", onPeriodPointerUp);
      container?.addEventListener("pointercancel", onPeriodPointerUp);
    });
    elements.dateFromPickerInput?.addEventListener("change", onDateRangePickerChange);
    elements.dateToPickerInput?.addEventListener("change", onDateRangePickerChange);
    elements.dateFromPickerInput?.addEventListener("input", onDateRangePickerChange);
    elements.dateToPickerInput?.addEventListener("input", onDateRangePickerChange);
    elements.chartsToggleButton?.addEventListener("click", onChartsToggle);
    elements.categoryFilterContainer?.addEventListener("click", onCategoryFilterClick);
    elements.readerLinkApplyButton?.addEventListener("click", onApplyReaderConnectionLink);
    elements.syncEditorTabButton?.addEventListener("click", () => setActiveSyncTab("editor"));
    elements.syncReaderTabButton?.addEventListener("click", () => setActiveSyncTab("reader"));
    elements.syncSaveButton?.addEventListener("click", onSyncSave);
    elements.fileExportButton?.addEventListener("click", exportToCsvFile);
    elements.fileImportButton?.addEventListener("click", () => elements.fileImportInput?.click());
    elements.fileImportInput?.addEventListener("change", onImportCsvFile);
    elements.clearDataButton?.addEventListener("click", onClearLocalData);
    elements.cloudUploadTopButton?.addEventListener("click", onCloudUpload);
    elements.cloudDownloadTopButton?.addEventListener("click", onCloudDownload);
    elements.cloudUploadButton?.addEventListener("click", onCloudUpload);
    elements.cloudDownloadButton?.addEventListener("click", onCloudDownload);
    elements.readerCloudDownloadButton?.addEventListener("click", onReaderCloudDownload);
    elements.readerInviteButton?.addEventListener("click", onInviteReader);
    elements.readerConnectionRefreshButton?.addEventListener("click", onRefreshReaderConnectionLink);
    elements.readerConnectionShareButton?.addEventListener("click", onShareReaderConnection);
    elements.readerAccessRefreshButton?.addEventListener("click", loadReaderPermissions);
    elements.readerAccessList?.addEventListener("click", onReaderAccessListClick);
    elements.syncToggleButton?.addEventListener("click", onSyncToggle);
    elements.instructionsToggleButton?.addEventListener("click", onInstructionsToggle);
    elements.instructionsCloseButton?.addEventListener("click", () => updateInstructionsVisibility(false));
    elements.amountsVisibilityToggleButton?.addEventListener("click", onAmountsVisibilityToggle);
    elements.quickAddToggleButton?.addEventListener("click", onQuickAddToggle);
    elements.sharedReceiptsList?.addEventListener("click", onSharedReceiptQueueClick);
    elements.receiptScanToggleButton?.addEventListener("click", onReceiptScanToggle);
    elements.receiptScannerCloseButton?.addEventListener("click", closeReceiptScanner);
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.type === "moneyflow:shared-receipts-ready") receiveSharedReceiptsFromShareTarget();
    });
    window.addEventListener("focus", () => receiveSharedReceiptsFromShareTarget());
    window.addEventListener("pageshow", () => receiveSharedReceiptsFromShareTarget());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") receiveSharedReceiptsFromShareTarget();
    });
    elements.operationDatePickerInput?.addEventListener("change", onOperationDatePickerChange);
    elements.operationDatePickerInput?.addEventListener("input", onOperationDatePickerChange);
    elements.operationDatePickerButton?.addEventListener("click", () => openNativeDatePicker(elements.operationDatePickerInput));
    document.getElementById("date-from-picker-button")?.addEventListener("click", () => openNativeDatePicker(elements.dateFromPickerInput));
    document.getElementById("date-to-picker-button")?.addEventListener("click", () => openNativeDatePicker(elements.dateToPickerInput));
    elements.operationsList.addEventListener("pointerdown", onOperationsListPointerDown);
    elements.operationsList.addEventListener("pointerup", onOperationsListPointerUp);
    elements.operationsList.addEventListener("pointercancel", onOperationsListPointerCancel);
    elements.operationsList.addEventListener("pointerleave", onOperationsListPointerCancel);
    elements.operationsList.addEventListener("lostpointercapture", onOperationsListPointerCancel);
    elements.operationsList.addEventListener("contextmenu", (event) => {
      if (event.target.closest("[data-operation-id]")) event.preventDefault();
    });
    elements.operationsList.addEventListener("click", onOperationsListClick);
    document.addEventListener("click", onOutsideOperationMenuClick);
    elements.chipContainer.addEventListener("click", (event) => {
      const button = event.target.closest("[data-type]");
      if (!button) return;

      state.activeTypeFilter = button.getAttribute("data-type");
      state.currentPage = 1;

      [...elements.chipContainer.querySelectorAll(".chip")].forEach((chip) => {
      chip.classList.toggle("active", chip === button);
      });
      render();
    });

    document.addEventListener("click", onOutsideCategoryPickerClick);
  }

  function onSearchInput(event) {
    if (searchDebounce) clearTimeout(searchDebounce);
    const value = event.target.value;
    searchDebounce = setTimeout(() => {
      state.searchText = value;
      state.currentPage = 1;
      render();
    }, 280);
  }

  function onSearchToggle() {
    const shouldOpen = Boolean(elements.searchField?.hidden);
    updateSearchVisibility(shouldOpen);
  }

  function onYearFilterClick(event) {
    const button = event.target.closest("[data-year]");
    if (!button) return;

    const yearValue = button.dataset.year;
    if (yearValue === "all") {
      state.activeYearFilter = new Set();
    } else {
      const selectedYears = new Set(state.activeYearFilter);
      const targetYear = Number(yearValue);
      if (selectedYears.has(targetYear)) {
        selectedYears.delete(targetYear);
      } else {
        selectedYears.add(targetYear);
      }
      state.activeYearFilter = selectedYears;
    }
    state.currentPage = 1;
    render();
  }

  function onPeriodFilterClick(event) {
    if (ignorePeriodClick) {
      ignorePeriodClick = false;
      return;
    }
    const button = event.target.closest("[data-period-kind][data-period-value]");
    if (!button) return;
    const kind = button.dataset.periodKind;
    const value = Number(button.dataset.periodValue);
    if (!Number.isInteger(value)) return;
    togglePeriodValue(kind, value);
    state.currentPage = 1;
    render();
  }

  function onPeriodPointerDown(event) {
    const button = event.target.closest("[data-period-kind][data-period-value]");
    if (!button || event.pointerType === "mouse" && event.button !== 0) return;
    const kind = button.dataset.periodKind;
    const value = Number(button.dataset.periodValue);
    if (!Number.isInteger(value)) return;
    periodDrag = {
      kind,
      value,
      mode: isPeriodValueSelected(kind, value) ? "remove" : "add",
      visited: new Set([value]),
      didDrag: false,
    };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function onPeriodPointerMove(event) {
    if (!periodDrag) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-period-kind][data-period-value]");
    if (!target || target.dataset.periodKind !== periodDrag.kind) return;
    const value = Number(target.dataset.periodValue);
    if (!Number.isInteger(value) || periodDrag.visited.has(value)) return;
    if (!periodDrag.didDrag) {
      periodDrag.didDrag = true;
      applyPeriodValue(periodDrag.kind, periodDrag.value, periodDrag.mode);
    }
    periodDrag.visited.add(value);
    applyPeriodValue(periodDrag.kind, value, periodDrag.mode);
  }

  function onPeriodPointerUp(event) {
    if (!periodDrag) return;
    const wasDragging = periodDrag.didDrag;
    periodDrag = null;
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
    if (!wasDragging) return;
    state.currentPage = 1;
    ignorePeriodClick = true;
    render();
    setTimeout(() => { ignorePeriodClick = false; }, 250);
  }

  function togglePeriodValue(kind, value) {
    const values = kind === "month" ? state.activeMonthFilter : state.activeDayFilter;
    if (values.has(value)) values.delete(value);
    else values.add(value);
    normalizePeriodSelection();
  }

  function applyPeriodValue(kind, value, mode) {
    const values = kind === "month" ? state.activeMonthFilter : state.activeDayFilter;
    if (mode === "add") values.add(value);
    else values.delete(value);
    normalizePeriodSelection();
  }

  function isPeriodValueSelected(kind, value) {
    return (kind === "month" ? state.activeMonthFilter : state.activeDayFilter).has(value);
  }

  function normalizePeriodSelection() {
    if (state.activeYearFilter.size !== 1) {
      state.activeMonthFilter.clear();
      state.activeDayFilter.clear();
      return;
    }
    if (state.activeMonthFilter.size !== 1) state.activeDayFilter.clear();
  }

  function onDateRangeInput(event) {
    onOperationDateInput(event);
    state.dateFrom = elements.dateFromInput?.value || "";
    state.dateTo = elements.dateToInput?.value || "";
    state.currentPage = 1;
    render();
  }

  function onDateRangeBlur(event) {
    const target = event?.target;
    if (target instanceof HTMLInputElement && target.value.trim()) {
      const parsedDate = parseDateFromInput(target.value);
      target.value = Number.isNaN(parsedDate.getTime()) ? "" : normalizeDateForInput(parsedDate);
    }
    onDateRangeInput();
  }

  function onDateRangePickerChange(event) {
    const target = event?.target;
    if (!(target instanceof HTMLInputElement)) return;
    const isFrom = target === elements.dateFromPickerInput;
    const selectedDate = target.value ? parseDateFromValue(target.value) : new Date(NaN);
    const value = Number.isNaN(selectedDate.getTime()) ? "" : normalizeDateForInput(selectedDate);
    const dateInput = isFrom ? elements.dateFromInput : elements.dateToInput;
    const dateDisplay = isFrom ? elements.dateFromDisplay : elements.dateToDisplay;
    if (dateInput) dateInput.value = value;
    if (dateDisplay) dateDisplay.textContent = value || "Выбрать дату";
    if (isFrom) state.dateFrom = value;
    else state.dateTo = value;
    state.currentPage = 1;
    render();
  }

  function onChartsToggle() {
    chartsOpen = !chartsOpen;
    updateChartsVisibility();
  }

  function updateChartsVisibility() {
    if (elements.categoryCharts) elements.categoryCharts.hidden = !chartsOpen;
    if (elements.chartsToggleButton) {
      elements.chartsToggleButton.setAttribute("aria-expanded", String(chartsOpen));
      elements.chartsToggleButton.textContent = chartsOpen ? "Скрыть диаграммы" : "Диаграммы";
    }
  }

  function onCategoryFilterClick(event) {
    const button = event.target.closest("[data-category-filter]");
    if (!button) return;

    const categoryId = button.dataset.categoryFilter;
    if (categoryId === "all") {
      state.activeCategoryFilter = new Set();
    } else {
      const selectedCategories = new Set(state.activeCategoryFilter);
      if (selectedCategories.has(categoryId)) {
        selectedCategories.delete(categoryId);
      } else {
        selectedCategories.add(categoryId);
      }
      state.activeCategoryFilter = selectedCategories;
    }
    state.currentPage = 1;
    render();
  }

  function onTypeToggleClick(event) {
    const button = event.target.closest("[data-type]");
    if (!button) return;

    state.operationType = button.dataset.type;
    syncApplyTypeFromState();
  }

  function onSyncToggle() {
    const shouldOpen = Boolean(elements.syncSettingsCard?.hidden);
    updateInstructionsVisibility(false);
    updateSyncSettingsVisibility(shouldOpen);
  }

  function onInstructionsToggle() {
    const shouldOpen = Boolean(elements.instructionsCard?.hidden);
    updateSyncSettingsVisibility(false);
    updateQuickAddVisibility(false);
    updateInstructionsVisibility(shouldOpen);
  }

  function onQuickAddToggle() {
    if (state.syncSettings.accessMode !== "writer" && state.syncSettings.googleFileId) {
      setSyncStatus("На этом устройстве доступно только чтение. Нажмите «Синхронизировать» для загрузки данных.");
      return;
    }
    const shouldOpen = Boolean(elements.quickAddCard?.hidden);
    updateSyncSettingsVisibility(false);
    updateQuickAddVisibility(shouldOpen);
    if (shouldOpen) {
      setQuickAddMode("add");
      const currentCategory = elements.categorySelect?.value;
      if (currentCategory) {
        setCategorySelection(currentCategory);
      }
      if (!elements.operationDateInput?.value) {
        setQuickAddDate(getTodayInputDate());
      }
      if (elements.form) {
        elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  async function onSyncSave({ close = false, announce = true } = {}) {
    const googleClientId = (elements.syncGoogleClientIdInput?.value || state.syncSettings.googleClientId || "").trim();
    const googleFileId = (elements.syncGoogleFileIdInput?.value || state.syncSettings.googleFileId || "").trim();
    const cloudPassphrase = elements.cloudPassphraseInput?.value ?? state.cloudPassphrase;
    const passphraseChanged = cloudPassphrase !== state.cloudPassphrase;
    if (passphraseChanged) {
      state.cloudPassphrase = cloudPassphrase;
      localStorage.setItem(STORAGE_KEYS.cloudPassphrase, state.cloudPassphrase);
      resetCloudEncryptionMaterial();
    }
    state.syncSettings = sanitizeSyncSettings({
      googleClientId,
      googleFileId,
      accessMode: googleFileId === state.syncSettings.googleFileId ? state.syncSettings.accessMode : "unknown",
      googleAccountEmail: state.syncSettings.googleAccountEmail,
    });
    await persistSyncSettings();
    updateCloudAccessUI();
    if (announce) {
      setSyncStatus(passphraseChanged ? "Пароль-фраза сохранена. Выгрузите данные и отправьте читателям новую ссылку." : "Настройки сохранены.");
      showAppNotice(passphraseChanged ? "Пароль-фраза сохранена." : "Настройки синхронизации сохранены.");
    }
    if (close) {
      updateSyncSettingsVisibility(false);
    }
    return true;
  }

  async function onClearLocalData() {
    const confirmed = window.confirm("Сбросить приложение: удалить локальные операции, категории и настройки подключения к Google Drive?");
    if (!confirmed) return;

    state.operations = [];
    state.categories = [];
    state.hasPendingCloudChanges = false;
    state.pendingUploadOperationIds.clear();
    localStorage.removeItem(STORAGE_KEYS.pendingCloudChanges);
    state.cloudPassphrase = "";
    localStorage.removeItem(STORAGE_KEYS.cloudPassphrase);
    if (elements.cloudPassphraseInput) elements.cloudPassphraseInput.value = "";
    resetCloudEncryptionMaterial();
    state.syncSettings = {
      googleClientId: "",
      googleFileId: "",
      accessMode: "writer",
      googleAccountEmail: "",
      lastSuccessfulSyncAt: "",
    };
    state.searchText = "";
    state.activeTypeFilter = "all";
    state.activeCategoryFilter = new Set();
    state.currentPage = 1;
    state.categorySearchText = "";
    state.categoryCurrentPage = 1;
    if (elements.categorySelect) {
      elements.categorySelect.value = "";
    }
    if (elements.categoryPickerInput) {
      elements.categoryPickerInput.value = "";
    }
    writeJson(STORAGE_KEYS.operations, state.operations);
    writeJson(STORAGE_KEYS.categories, state.categories);
    try {
      await persistSyncSettings();
    } catch {
      setSyncStatus("Не удалось безопасно сохранить настройки синхронизации.");
    }

    renderSyncSettingsForm();
    updateCloudAccessUI();

    if (elements.form) {
      elements.form.reset();
    }
    if (elements.quickAddCard && !elements.quickAddCard.hidden) {
      resetQuickAddFormToDefaults();
    }
    setQuickAddDate(getTodayInputDate());
    render();
    renderCategoryOptions();
    setSyncStatus("Приложение сброшено: локальные данные и настройки подключения очищены.");
    updateSyncSettingsVisibility(false);
    renderLastSuccessfulSync();
  }

  function exportToCsvFile() {
    const headers = ["Дата", "Описание", "Категория", "Контрагент", "Заметки", "Счет", "Счет-получатель перевода", "Сумма", "Баланс"];
    const rows = enrichOperationsWithBalance(state.operations, getCategoryName)
      .sort((left, right) => compareOperationsChronologicalDescending(left, right))
      .map((operation) => [
        formatCsvOperationDate(operation),
        "---",
        operation.categoryName || getCategoryName(operation.categoryId),
        "",
        operation.description || "",
        "MoneyFlow",
        "",
        signedAmount(operation).toFixed(2),
        Number(operation.balanceAfter || 0).toFixed(2),
      ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Debit and Credit.csv";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showAppNotice("Файл операций выгружен.");
  }

  async function onImportCsvFile(event) {
    const input = event.target;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      const imported = parseDebitCreditCsv(await file.text());
      if (!imported.operations.length) throw new Error("Не найдено операций с датой, категорией и ненулевой суммой.");
      if (!window.confirm(`Загрузить ${imported.operations.length} операций из файла? Все локальные операции и категории будут заменены.`)) return;
      state.operations = sanitizeOperations(imported.operations);
      state.categories = sanitizeCategories(imported.categories);
      state.activeYearFilter = new Set();
      state.activeMonthFilter = new Set();
      state.activeDayFilter = new Set();
      state.activeCategoryFilter = new Set();
      state.dateFrom = "";
      state.dateTo = "";
      state.currentPage = 1;
      if (elements.dateFromInput) elements.dateFromInput.value = "";
      if (elements.dateToInput) elements.dateToInput.value = "";
      writeJson(STORAGE_KEYS.operations, state.operations);
      writeJson(STORAGE_KEYS.categories, state.categories);
      markPendingCloudChanges(state.operations.map((operation) => operation.id));
      renderCategoryOptions();
      render();
      const message = `Загружено: ${state.operations.length} операций, ${state.categories.length} категорий.`;
      setSyncStatus(message);
      showAppNotice(message);
    } catch (error) {
      const message = `Не удалось загрузить файл: ${error?.message || "неизвестная ошибка"}`;
      setSyncStatus(message);
      showAppNotice(message, "error");
    } finally {
      if (input) input.value = "";
    }
  }

  async function onCloudUpload() {
    if (cloudActionInProgress) return;
    cloudActionInProgress = true;
    setCloudActionPending("upload", true);
    setSyncStatus("Подготавливаю выгрузку в облако...");
    showAppNotice("Подготавливаю выгрузку в облако...");
    try {
      const saved = await onSyncSave({ close: false, announce: false });
      if (!saved) {
        updateSyncSettingsVisibility(true);
        return;
      }
      if (state.syncSettings.accessMode !== "writer" && state.syncSettings.googleFileId) {
        updateSyncSettingsVisibility(true);
        setSyncStatus("Это устройство настроено только для чтения. Выгрузка недоступна.");
        return;
      }
      const missingSyncSettings = getMissingSyncSettings(state.syncSettings);
      if (missingSyncSettings.length > 0) {
        updateSyncSettingsVisibility(true);
        setSyncStatus(`Выгрузка не выполнена: заполните ${missingSyncSettings.join(", ")}.`);
        const firstMissingInput = elements.syncGoogleClientIdInput;
        firstMissingInput?.focus();
        return;
      }
      await uploadToGoogleDrive();
    } finally {
      cloudActionInProgress = false;
      setCloudActionPending("upload", false);
    }
  }

  async function onCloudDownload({ skipReplaceConfirmation = state.syncSettings.accessMode === "reader" } = {}) {
    if (cloudActionInProgress) return;
    cloudActionInProgress = true;
    setCloudActionPending("download", true);
    setSyncStatus("Подготавливаю загрузку из облака...");
    showAppNotice("Подготавливаю загрузку из облака...");
    try {
      const saved = await onSyncSave({ close: false, announce: false });
      if (!saved) {
        updateSyncSettingsVisibility(true);
        return;
      }
      const missingSyncSettings = getMissingSyncSettings(state.syncSettings);
      if (missingSyncSettings.length > 0) {
        updateSyncSettingsVisibility(true);
        setSyncStatus(`Загрузка не выполнена: заполните ${missingSyncSettings.join(", ")}.`);
        elements.syncGoogleClientIdInput?.focus();
        return;
      }
      await downloadFromGoogleDrive({ skipReplaceConfirmation });
    } finally {
      cloudActionInProgress = false;
      setCloudActionPending("download", false);
    }
  }

  function setCloudActionPending(action, pending) {
    const buttons = action === "upload"
      ? [elements.cloudUploadTopButton, elements.cloudUploadButton]
      : [elements.cloudDownloadTopButton, elements.cloudDownloadButton, elements.readerCloudDownloadButton];
    const pendingLabel = action === "upload" ? "Выгружаю..." : "Загружаю...";

    buttons.filter(Boolean).forEach((button) => {
      if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent.trim();
      button.disabled = pending;
      button.classList.toggle("is-loading", pending);
      button.textContent = pending ? pendingLabel : button.dataset.idleLabel;
    });
  }

  async function onReaderCloudDownload() {
    await onCloudDownload({ skipReplaceConfirmation: true });
  }

  function onAmountKeypadClick(event) {
    if (state.quickAddMode === "view") return;
    const button = event.target.closest("[data-amount-key], [data-amount-action]");
    if (!button || !elements.amountInput) return;

    const action = button.dataset.amountAction;
    const currentValue = elements.amountInput.value || "";
    if (button.dataset.amountKey !== undefined && typeof navigator.vibrate === "function") {
      navigator.vibrate(8);
    }
    if (action === "clear") {
      setAmountValue("");
      return;
    }
    if (action === "backspace") {
      setAmountValue(currentValue.slice(0, -1));
      return;
    }

    const key = button.dataset.amountKey;
    if (!key || !/^\d$|^\.$/.test(key)) return;
    if (key === ".") {
      if (currentValue.includes(".")) return;
      setAmountValue(currentValue ? `${currentValue}.` : "0.");
      return;
    }

    const decimalPart = currentValue.split(".")[1] || "";
    if (currentValue.includes(".") && decimalPart.length >= 2) return;
    setAmountValue(`${currentValue}${key}`);
  }

  function shouldHideQuickAddAmount() {
    return state.amountsHidden && !["copy", "edit"].includes(state.quickAddMode);
  }

  function onAmountsVisibilityToggle() {
    state.amountsHidden = !state.amountsHidden;
    writeJson(STORAGE_KEYS.amountsHidden, state.amountsHidden);
    applyAmountsVisibility();
  }

  function applyAmountsVisibility() {
    document.body.classList.toggle("amounts-hidden", state.amountsHidden);
    updateAmountsVisibilityToggle();
    setAmountValue(elements.amountInput?.value || "");
  }

  function updateAmountsVisibilityToggle() {
    const button = elements.amountsVisibilityToggleButton;
    if (!button) return;
    const label = state.amountsHidden ? "Показать суммы" : "Скрыть суммы";
    const icon = state.amountsHidden
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3.1 3.9"></path><path d="M6.6 6.6C3.8 8.5 2 12 2 12s3.5 7 10 7c1.1 0 2.1-.2 3-.5"></path></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>';
    button.setAttribute("aria-pressed", String(state.amountsHidden));
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.classList.toggle("is-active", state.amountsHidden);
    button.innerHTML = `${icon}<span class="sr-only">${label}</span>`;
  }

  function setAmountValue(value) {
    const rawValue = String(value || "");
    if (elements.amountInput) {
      elements.amountInput.value = rawValue;
    }
    if (elements.amountDisplay) {
      elements.amountDisplay.textContent = shouldHideQuickAddAmount()
        ? "•••••"
        : (rawValue ? rawValue.replace(".", ",") : "0");
    }
  }

  function onCategoryInputChange(event) {
    if (elements.form && elements.form.classList.contains("is-readonly")) {
      return;
    }
    const value = event?.target?.value ?? elements.categoryPickerInput.value ?? "";
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      if (categoryPickerDebounce) {
        clearTimeout(categoryPickerDebounce);
        categoryPickerDebounce = undefined;
      }
      elements.categorySelect.value = "";
      state.categorySearchText = "";
      state.categoryCurrentPage = 1;
      renderCategoryOptions();
      return;
    }

    const selectedCategory = state.categories.find((category) => category.id === elements.categorySelect.value);
    if (!selectedCategory || normalizeTextForSearch(selectedCategory.name) !== normalizeTextForSearch(trimmedValue)) {
      elements.categorySelect.value = "";
    }

    if (categoryPickerDebounce) {
      clearTimeout(categoryPickerDebounce);
    }
    const scheduledSearchValue = trimmedValue;
    categoryPickerDebounce = setTimeout(() => {
      const currentSearchValue = (elements.categoryPickerInput?.value || "").trim();
      if (normalizeTextForSearch(currentSearchValue) !== normalizeTextForSearch(scheduledSearchValue)) {
        return;
      }
      state.categorySearchText = scheduledSearchValue;
      state.categoryCurrentPage = 1;
      renderCategoryOptions();
    }, 220);
  }

  function onAddOperation(event) {
    event.preventDefault();
    if (state.quickAddMode === "view") {
      return;
    }
    if (state.syncSettings.accessMode !== "writer" && state.syncSettings.googleFileId) {
      setSyncStatus("На этом устройстве доступно только чтение.");
      return;
    }

    const operationFromForm = getOperationFromForm();
    if (!operationFromForm) return;

    let persistedOperationId = operationFromForm.id;
    if (state.quickAddMode === "edit" && state.quickAddSourceOperationId) {
      const sourceIndex = state.operations.findIndex((item) => item.id === state.quickAddSourceOperationId);
      if (sourceIndex >= 0) {
        const sourceOperation = state.operations[sourceIndex];
        state.operations[sourceIndex] = {
          ...operationFromForm,
          id: sourceOperation.id,
          createdAt: sourceOperation.createdAt,
          localAddedAt: sourceOperation.localAddedAt,
        };
        persistedOperationId = sourceOperation.id;
      } else {
        state.operations.push(operationFromForm);
      }
    } else {
      state.operations.push(operationFromForm);
    }
    writeJson(STORAGE_KEYS.operations, state.operations);
    markPendingCloudChanges([persistedOperationId]);

    resetQuickAddFormToDefaults();
    setQuickAddDate(getTodayInputDate());
    setQuickAddMode("add");
    syncApplyTypeFromState();
    updateQuickAddVisibility(false);
    renderCategoryOptions();
    state.currentPage = 1;
    render();
  }

  function onQuickAddDismiss() {
    closeCategoryPicker();
    resetQuickAddFormToDefaults();
    setQuickAddDate(getTodayInputDate());
    syncApplyTypeFromState();
    updateQuickAddVisibility(false);
  }

  function onCategoryInputKeydown(event) {
    if (elements.form && elements.form.classList.contains("is-readonly")) {
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();

    const query = normalizeTextForSearch(elements.categoryPickerInput.value);
    const matches = getMatchedCategories(state.categories, query);
    if (matches.length > 0) {
      return;
    }

    addCategoryFromPickerSearch();
  }

  function onOperationsListClick(event) {
    const menuTrigger = event.target.closest("[data-operation-menu-trigger]");
    if (menuTrigger) {
      event.stopPropagation();
      event.preventDefault();
      const row = menuTrigger.closest("[data-operation-id]");
      if (!row) return;
      toggleOperationMenu(row);
      return;
    }

    const actionButton = event.target.closest("[data-operation-action]");
    if (actionButton) {
      event.stopPropagation();
      event.preventDefault();
      const action = actionButton.getAttribute("data-operation-action");
      const row = actionButton.closest("[data-operation-id]");
      if (!row) return;

      const operationId = row.getAttribute("data-operation-id");
      const operation = state.operations.find((item) => item.id === operationId);
      if (!operation) return;

      if (state.syncSettings.accessMode === "reader" && action !== "view") {
        closeAllOperationMenus();
        openQuickAddWithOperation(operation, { mode: "view", date: getOperationDateValue(operation) });
        return;
      }

      if (action === "copy") {
        closeAllOperationMenus();
        openQuickAddWithOperation(operation, { mode: "copy", date: operationDateOnlyString(getTodayDate()) });
      } else if (action === "edit") {
        closeAllOperationMenus();
        openQuickAddWithOperation(operation, { mode: "edit", date: getOperationDateValue(operation), sourceOperationId: operation.id });
      } else if (action === "view") {
        closeAllOperationMenus();
        openQuickAddWithOperation(operation, { mode: "view", date: getOperationDateValue(operation) });
      } else if (action === "delete") {
        closeAllOperationMenus();
        removeOperation(operation.id);
      }

      return;
    }

    const row = event.target.closest("[data-operation-id]");
    const operationIdFromRow = row ? row.getAttribute("data-operation-id") : null;

    if (longPressHandledOperationId && operationIdFromRow === longPressHandledOperationId) {
      longPressHandledOperationId = null;
      return;
    }

    if (!row) return;
    const operationId = row.getAttribute("data-operation-id");
    const baseOperation = state.operations.find((operation) => operation.id === operationId);
    if (!baseOperation) return;

    closeAllOperationMenus();
    openQuickAddWithOperation(baseOperation, { mode: "view", date: getOperationDateValue(baseOperation) });
  }

  function onOperationsListPointerDown(event) {
    const actionButton = event.target.closest("[data-operation-action], [data-operation-menu-trigger]");
    if (actionButton) return;

    const row = event.target.closest("[data-operation-id]");
    if (!row) return;

    const operationId = row.getAttribute("data-operation-id");
    if (!operationId) return;

    const operation = state.operations.find((item) => item.id === operationId);
    if (!operation) return;

    longPressHandledOperationId = null;

    if (operationLongPressTimer) {
      clearTimeout(operationLongPressTimer);
      operationLongPressTimer = null;
    }

    operationLongPressTimer = setTimeout(() => {
      longPressHandledOperationId = operationId;
      openQuickAddWithOperation(operation, { mode: "copy", date: operationDateOnlyString(getTodayDate()) });
    }, 520);
  }

  function onOperationsListPointerUp() {
    if (operationLongPressTimer) {
      clearTimeout(operationLongPressTimer);
      operationLongPressTimer = null;
    }
  }

  function onOperationsListPointerCancel() {
    if (operationLongPressTimer) {
      clearTimeout(operationLongPressTimer);
      operationLongPressTimer = null;
    }
  }

  function onOutsideOperationMenuClick(event) {
    const isInsideMenuControl = event.target.closest("[data-operation-action], [data-operation-menu-trigger]");
    if (isInsideMenuControl) return;
    closeAllOperationMenus();
  }

  function openQuickAddWithOperation(operation, options = {}) {
    if (!operation) return;

    updateSyncSettingsVisibility(false);
    updateQuickAddVisibility(true);
    closeCategoryPicker();
    const requestedMode = options.mode || "add";
    const mode = state.syncSettings.accessMode === "reader" ? "view" : requestedMode;
    const sourceOperationId = options.sourceOperationId || "";
    setQuickAddMode(mode, sourceOperationId);
    state.operationType = operation.type || "income";
    syncApplyTypeFromState();

    setAmountValue(String(round2(Number(operation.amount) || 0)));
    setOperationCategoryForQuickAdd(operation.categoryId, operation.categoryName);
    elements.descriptionInput.value = operation.description || "";
    setQuickAddDate(normalizeDateForInput(options.date || getOperationDateValue(operation)));
    if (elements.form) {
      elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (state.quickAddMode === "view") {
      return;
    }

  }

  function setQuickAddMode(mode, sourceOperationId = "") {
    const normalizedMode = mode === "edit" || mode === "copy" || mode === "view" ? mode : "add";
    state.quickAddMode = normalizedMode;
    state.quickAddSourceOperationId = normalizedMode === "edit" ? sourceOperationId : "";

    const isViewMode = normalizedMode === "view";
    if (elements.quickAddTitle) {
      const titles = {
        add: "Быстрое добавление",
        edit: "Изменение",
        copy: "Копирование",
        view: "Просмотр",
      };
      elements.quickAddTitle.textContent = titles[normalizedMode] || titles.add;
    }

    if (elements.operationSubmitButton) {
      elements.operationSubmitButton.hidden = isViewMode;
      elements.operationSubmitButton.textContent = normalizedMode === "edit" ? "Сохранить изменения" : "Добавить";
    }

    if (elements.quickAddDismissButton) {
      elements.quickAddDismissButton.textContent = isViewMode ? "Закрыть" : "Отменить";
    }

    const readOnlyInputs = [
      elements.operationDateInput,
      elements.descriptionInput,
    ];
    readOnlyInputs.forEach((element) => {
      if (element) {
        element.readOnly = isViewMode;
      }
    });
    if (elements.operationDatePickerInput) {
      elements.operationDatePickerInput.disabled = isViewMode;
    }

    if (elements.categoryPickerToggle) {
      elements.categoryPickerToggle.disabled = isViewMode;
    }

    if (elements.categoryPickerInput) {
      elements.categoryPickerInput.readOnly = isViewMode || !state.categorySearchEditing;
    }

    if (elements.amountKeypad) {
      elements.amountKeypad.hidden = isViewMode;
      [...elements.amountKeypad.querySelectorAll("button")].forEach((button) => {
        button.disabled = isViewMode;
      });
    }

    if (elements.popularCategories) {
      [...elements.popularCategories.querySelectorAll("button")].forEach((button) => {
        button.disabled = isViewMode;
      });
    }

    if (elements.typeToggle) {
      [...elements.typeToggle.querySelectorAll("[data-type]")].forEach((chip) => {
        chip.disabled = isViewMode;
      });
    }

    if (elements.form) {
      elements.form.classList.toggle("is-readonly", isViewMode);
    }
  }

  function toggleOperationMenu(row) {
    if (!row) return;

    const isOpen = row.classList.contains("menu-open");
    closeAllOperationMenus();
    if (!isOpen) {
      row.classList.add("menu-open");
    }
  }

  function closeAllOperationMenus() {
    if (!elements.operationsList) return;
    [...elements.operationsList.querySelectorAll(".operation")].forEach((row) => {
      row.classList.remove("menu-open");
    });
  }

  function resetQuickAddFormToDefaults() {
    if (!elements.form) return;

    elements.form.reset();
    setAmountValue("");
    elements.form.classList.remove("is-readonly");
    setQuickAddMode("add");
    const fallbackCategory = elements.categorySelect?.value ? getCategoryById(elements.categorySelect.value) : null;
    if (fallbackCategory) {
      setCategorySelection(fallbackCategory.id);
    } else {
      const firstCategory = getAllCategoriesSorted(state.categories)[0];
      if (firstCategory) {
        setCategorySelection(firstCategory.id);
      }
    }
  }

  function getOperationFromForm() {
    const rawAmount = elements.amountInput.value.trim().replace(",", ".");
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const selectedType = state.operationType || elements.typeInput?.value || "income";
    const selectedCategory = ensureCategorySelection();
    const description = elements.descriptionInput.value.trim();
    if (!selectedCategory) return null;
    const rawOperationDate = String(elements.operationDateInput?.value || "").trim();
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(rawOperationDate)) {
      elements.operationDateInput?.focus();
      return null;
    }

    const operationDate = parseDateFromInput(rawOperationDate);
    if (Number.isNaN(operationDate.getTime()) || normalizeDateForInput(operationDate) !== rawOperationDate) {
      elements.operationDateInput?.focus();
      return null;
    }
    const operationDateValue = dateToDateOnlyString(operationDate);

    return {
      id: getUuid(),
      operationDate: operationDateValue,
      createdAt: new Date().toISOString(),
      localAddedAt: new Date().toISOString(),
      type: selectedType,
      amount: round2(amount),
      categoryId: selectedCategory,
      description,
    };
  }

  function removeOperation(operationId) {
    state.operations = state.operations.filter((operation) => operation.id !== operationId);
    writeJson(STORAGE_KEYS.operations, state.operations);
    markPendingCloudChanges();
    state.currentPage = 1;
    render();
  }

  function markPendingCloudChanges(operationIds = []) {
    if (state.syncSettings.accessMode === "reader") return;
    state.hasPendingCloudChanges = true;
    for (const operationId of operationIds) {
      const normalizedId = String(operationId || "").trim();
      if (normalizedId) state.pendingUploadOperationIds.add(normalizedId);
    }
    persistPendingCloudChanges();
    updatePendingCloudChangesUI();
  }

  function clearPendingCloudChanges() {
    state.hasPendingCloudChanges = false;
    state.pendingUploadOperationIds.clear();
    if (state.syncSettings.accessMode === "reader") {
      localStorage.removeItem(STORAGE_KEYS.pendingCloudChanges);
    } else {
      persistPendingCloudChanges();
    }
    updatePendingCloudChangesUI();
  }

  function persistPendingCloudChanges() {
    writeJson(STORAGE_KEYS.pendingCloudChanges, {
      hasChanges: state.hasPendingCloudChanges,
      operationIds: [...state.pendingUploadOperationIds],
    });
  }

  function updatePendingCloudChangesUI() {
    const hasPendingChanges = state.syncSettings.accessMode !== "reader" && state.hasPendingCloudChanges;
    [elements.cloudUploadTopButton, elements.cloudUploadButton].filter(Boolean).forEach((button) => {
      button.classList.toggle("has-pending-cloud-changes", hasPendingChanges);
      button.title = hasPendingChanges
        ? "Выгрузить в облако: есть невыгруженные изменения"
        : "Выгрузить в облако";
    });
  }

  function setOperationCategoryForQuickAdd(categoryId, fallbackName) {
    const selectedCategory = state.categories.find((item) => item.id === categoryId);
    if (!selectedCategory) {
      elements.categorySelect.value = "";
      elements.categoryPickerInput.value = fallbackName || "";
      return;
    }

    setCategorySelection(selectedCategory.id);
  }

  function setQuickAddDate(value) {
    if (!elements.operationDateInput) return;
    const inputValue = value || getTodayInputDate();
    elements.operationDateInput.value = inputValue;
    if (elements.operationDateDisplay) elements.operationDateDisplay.textContent = inputValue;
    const parsedDate = parseDateFromInput(inputValue);
    if (elements.operationDatePickerInput) {
      elements.operationDatePickerInput.value = Number.isNaN(parsedDate?.getTime()) ? "" : dateToDateOnlyString(parsedDate);
    }
  }

  function onOperationDateInput(event) {
    if (!event?.target) return;

    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const digits = target.value.replace(/[^\d]/g, "");
    if (!digits) {
      target.value = "";
      return;
    }

    let formatted = digits.slice(0, 2);
    if (digits.length > 2) {
      formatted += `.${digits.slice(2, 4)}`;
    }
    if (digits.length > 4) {
      formatted += `.${digits.slice(4, 8)}`;
    }
    target.value = formatted;
  }

  function onOperationDateInputBlur(event) {
    if (!event?.target) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const parsedDate = parseDateFromInput(target.value);
    if (!parsedDate) {
      target.value = normalizeDateForInput(operationDateOnlyString(new Date()));
      return;
    }

    target.value = normalizeDateForInput(parsedDate);
  }

  function onOperationDatePickerChange(event) {
    const target = event?.target;
    if (!(target instanceof HTMLInputElement) || !target.value) return;
    const selectedDate = parseDateFromValue(target.value);
    if (Number.isNaN(selectedDate.getTime())) return;
    setQuickAddDate(normalizeDateForInput(selectedDate));
  }

  function openNativeDatePicker(input) {
    if (!(input instanceof HTMLInputElement) || input.disabled) return;
    try {
      input.showPicker?.();
    } catch {
      input.focus({ preventScroll: true });
      input.click();
    }
  }

  function render() {
    updatePendingCloudChangesUI();
    const enrichedOps = enrichOperationsWithBalance(state.operations, getCategoryName);
    const yearFiltered = getOperationsByYear(enrichedOps, state);
    const filtered = getFilteredOperations(yearFiltered, state);
    const visibleOperations = filtered;
    const totalPages = Math.ceil(visibleOperations.length / state.pageSize);
    const safeTotalPages = Math.max(totalPages, 0);
    if (state.currentPage > Math.max(safeTotalPages, 1)) state.currentPage = 1;

    const pageItems = visibleOperations.slice(0, state.currentPage * state.pageSize);
    const filteredBalance = filtered.reduce((sum, operation) => sum + signedAmount(operation), 0);

    updateBalances(filteredBalance);
    renderPeriodFilters();
    renderCategoryCharts(filtered);
    renderYearFilters();
    renderCategoryFilters();
    renderCategoryOptions();
    renderOperationsList(pageItems);
    updatePager(visibleOperations.length, safeTotalPages);
  }

  function renderCategoryFilters() {
    if (!elements.categoryFilterContainer) return;

    const selectedCategories = state.activeCategoryFilter instanceof Set ? state.activeCategoryFilter : new Set();
    const categories = getCategoriesForPicker();
    const allButton = `<button type="button" class="chip ${selectedCategories.size === 0 ? "active" : ""}" data-category-filter="all">Все категории</button>`;
    const categoryButtons = categories
      .map((category) => {
        const selected = selectedCategories.has(category.id);
        const dotStyle = `background:${category.color || "#64748b"}`;
        return `<button type="button" class="chip category-filter-chip ${selected ? "active" : ""}" data-category-filter="${escapeHtml(category.id)}"><span class="category-dot" style="${dotStyle}"></span>${escapeHtml(category.name)}</button>`;
      })
      .join("");

    elements.categoryFilterContainer.innerHTML = `${allButton}${categoryButtons}`;
  }

  function renderYearFilters() {
    if (!elements.yearFilterContainer) return;

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: CURRENT_YEAR_LOOKBACK + 1 }, (_, offset) => currentYear - offset);
    const selectedYears = state.activeYearFilter instanceof Set ? state.activeYearFilter : new Set();
    const hasSpecificYears = selectedYears.size > 0;

    const buttons = [
      { value: "all", label: "Все" },
      ...years.map((year) => ({ value: String(year), label: String(year) })),
    ];

    const hasCurrentYear = selectedYears.size === 0 || [...selectedYears].some((year) => buttons.some((item) => item.value === String(year)));
    if (!hasCurrentYear) {
      state.activeYearFilter = new Set();
    }

    elements.yearFilterContainer.innerHTML = buttons
      .map((year) => {
        const isActive = year.value === "all" ? selectedYears.size === 0 : selectedYears.has(Number(year.value));
        return `<button type="button" class="chip ${isActive ? "active" : ""}" data-year="${year.value}">${year.label}</button>`;
      })
      .join("");

    if (!elements.yearFilterContainer.querySelector(".chip.active")) {
      const allChip = elements.yearFilterContainer.querySelector('[data-year="all"]');
      if (allChip) allChip.classList.add("active");
      state.activeYearFilter = new Set();
    }
  }

  function renderPeriodFilters() {
    const selectedYears = state.activeYearFilter instanceof Set ? [...state.activeYearFilter] : [];
    if (selectedYears.length !== 1) {
      state.activeMonthFilter.clear();
      state.activeDayFilter.clear();
      if (elements.monthFilterContainer) elements.monthFilterContainer.hidden = true;
      if (elements.dayFilterContainer) elements.dayFilterContainer.hidden = true;
      return;
    }

    const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
    if (elements.monthFilterContainer) {
      elements.monthFilterContainer.hidden = false;
      elements.monthFilterContainer.innerHTML = `<span class="period-filter-label">Месяцы</span>${monthNames.map((name, index) => `<button type="button" class="chip ${state.activeMonthFilter.has(index + 1) ? "active" : ""}" data-period-kind="month" data-period-value="${index + 1}">${name}</button>`).join("")}`;
    }

    if (state.activeMonthFilter.size !== 1) {
      state.activeDayFilter.clear();
      if (elements.dayFilterContainer) elements.dayFilterContainer.hidden = true;
      return;
    }

    const month = [...state.activeMonthFilter][0];
    const daysInMonth = new Date(selectedYears[0], month, 0).getDate();
    if (elements.dayFilterContainer) {
      elements.dayFilterContainer.hidden = false;
      elements.dayFilterContainer.innerHTML = `<span class="period-filter-label">Дни</span>${Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => `<button type="button" class="chip ${state.activeDayFilter.has(day) ? "active" : ""}" data-period-kind="day" data-period-value="${day}">${day}</button>`).join("")}`;
    }
  }

  function renderCategoryCharts(operations) {
    renderCategoryChart(elements.incomeCategoryChart, operations, "income");
    renderCategoryChart(elements.expenseCategoryChart, operations, "expense");
  }

  function renderCategoryChart(container, operations, type) {
    if (!container) return;
    const totals = new Map();
    operations.filter((operation) => operation.type === type).forEach((operation) => {
      const key = operation.categoryId || "uncategorized";
      totals.set(key, round2((totals.get(key) || 0) + Math.abs(Number(operation.amount) || 0)));
    });
    const entries = [...totals.entries()]
      .map(([categoryId, amount]) => ({
        categoryId,
        amount,
        category: getCategoryById(categoryId),
        name: getCategoryName(categoryId),
      }))
      .filter((entry) => entry.amount > 0)
      .sort((left, right) => right.amount - left.amount);
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    if (!total) {
      container.innerHTML = `<div class="chart-empty">Нет операций</div>`;
      return;
    }

    let cursor = 0;
    const segments = entries.map((entry) => {
      const next = cursor + (entry.amount / total) * 360;
      const color = entry.category?.color || "#64748b";
      const segment = `${color} ${cursor.toFixed(2)}deg ${next.toFixed(2)}deg`;
      cursor = next;
      return segment;
    });
    const legend = entries.map((entry) => {
      const color = entry.category?.color || "#64748b";
      const percent = Math.round((entry.amount / total) * 100);
      const summary = `${formatMoney(entry.amount)} ₽ · ${percent}%`;
      return `<div class="chart-legend-item"><span class="chart-dot" style="background:${color}"></span><span>${escapeHtml(entry.name)}</span><strong>${summary}</strong></div>`;
    }).join("");
    const chartTotal = `${formatMoney(total)} ₽`;
    container.innerHTML = `<div class="chart-donut" style="background:conic-gradient(${segments.join(",")})"><span>${chartTotal}</span></div><div class="chart-legend">${legend}</div>`;
  }

  function syncApplyTypeFromState() {
    const normalizedType = state.operationType === "expense" ? "expense" : "income";
    state.operationType = normalizedType;
    if (elements.typeInput) {
      elements.typeInput.value = normalizedType;
    }
    if (!elements.typeToggle) return;

    [...elements.typeToggle.querySelectorAll("[data-type]")].forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.type === normalizedType);
    });
  }

  function updateBalances(filteredBalance) {
    if (elements.balanceTitle) {
      const selectedYears = getActiveYearFilterLabel();
      elements.balanceTitle.textContent = selectedYears ? `Текущий остаток (${selectedYears})` : "Текущий остаток";
    }
    elements.balanceCurrent.textContent = `${formatMoney(filteredBalance)} ₽`;
  }

  function getActiveYearFilterLabel() {
    const selectedYears = state.activeYearFilter instanceof Set ? [...state.activeYearFilter] : [];
    if (!selectedYears.length) return "";
    return selectedYears.sort((left, right) => right - left).join(", ");
  }

  function updateSyncSettingsVisibility(open) {
    if (!elements.syncSettingsCard || !elements.syncToggleButton) return;

    elements.syncSettingsCard.hidden = !open;
    elements.syncToggleButton.classList.toggle("is-open", open);
    const hiddenLabel = open ? "Скрыть настройки синхронизации" : "Настройки синхронизации";
    elements.syncToggleButton.setAttribute("aria-label", hiddenLabel);
    elements.syncToggleButton.setAttribute("title", hiddenLabel);
    if (open) renderSyncTabs();
  }

  function setActiveSyncTab(tab) {
    activeSyncTab = tab === "reader" ? "reader" : "editor";
    renderSyncTabs();
  }

  function renderSyncTabs() {
    const isReaderTab = activeSyncTab === "reader";
    elements.syncEditorTabButton?.classList.toggle("is-active", !isReaderTab);
    elements.syncReaderTabButton?.classList.toggle("is-active", isReaderTab);
    elements.syncEditorTabButton?.setAttribute("aria-selected", String(!isReaderTab));
    elements.syncReaderTabButton?.setAttribute("aria-selected", String(isReaderTab));
    if (elements.syncEditorPanel) elements.syncEditorPanel.hidden = isReaderTab;
    if (elements.syncReaderPanel) elements.syncReaderPanel.hidden = !isReaderTab;
  }

  function updateCloudAccessUI() {
    const hasClientId = Boolean(state.syncSettings.googleClientId);
    const hasFileId = Boolean(state.syncSettings.googleFileId);
    const isReadOnly = hasFileId && state.syncSettings.accessMode === "reader";
    const isWriter = hasFileId && state.syncSettings.accessMode === "writer";
    const isNotWriter = hasFileId && state.syncSettings.accessMode !== "writer";
    const canUpload = hasClientId && (!hasFileId || !isNotWriter);
    const canSync = hasClientId;

    if (elements.syncEditorTabButton) elements.syncEditorTabButton.hidden = isReadOnly;
    if (elements.syncReaderTabButton) elements.syncReaderTabButton.hidden = isWriter;
    if (elements.syncTabs) elements.syncTabs.hidden = isReadOnly || isWriter;
    if (isReadOnly) activeSyncTab = "reader";
    if (isWriter) activeSyncTab = "editor";
    renderSyncTabs();

    if (elements.readerLinkConnect) elements.readerLinkConnect.hidden = false;
    if (elements.fileExportButton) elements.fileExportButton.hidden = false;
    if (elements.fileImportButton) elements.fileImportButton.hidden = isReadOnly;

    [elements.cloudUploadTopButton, elements.cloudUploadButton].forEach((button) => {
      if (button) button.hidden = !canUpload;
    });
    if (elements.cloudDownloadTopButton) elements.cloudDownloadTopButton.hidden = !isReadOnly;
    if (elements.cloudDownloadButton) {
      elements.cloudDownloadButton.hidden = !canSync;
      elements.cloudDownloadButton.textContent = isReadOnly ? "Синхронизировать" : "Загрузить из облака";
    }
    if (elements.quickAddToggleButton) {
      elements.quickAddToggleButton.hidden = isNotWriter;
    }
    if (elements.syncGoogleClientIdField) {
      elements.syncGoogleClientIdField.hidden = hasFileId;
    }
    if (elements.readerInvite) {
      elements.readerInvite.hidden = !(hasClientId && hasFileId && state.syncSettings.accessMode === "writer");
    }
    if (elements.readerConnection) {
      elements.readerConnection.hidden = !(hasClientId && hasFileId && state.syncSettings.accessMode === "writer");
    }
    if (elements.readerConnectionLink) {
      elements.readerConnectionLink.value = hasClientId && hasFileId && state.syncSettings.accessMode === "writer"
        ? getReaderConnectionLink()
        : "";
    }
    if (elements.readerAccessManagement) {
      elements.readerAccessManagement.hidden = !(hasClientId && hasFileId && state.syncSettings.accessMode === "writer");
    }
    const syncActions = elements.cloudDownloadTopButton?.closest(".sync-actions");
    syncActions?.classList.toggle("is-readonly", isReadOnly);
    syncActions?.classList.toggle("has-single-cloud-action", (canUpload ? 1 : 0) + (isReadOnly ? 1 : 0) === 1);
    if (isNotWriter) updateQuickAddVisibility(false);
  }

  function updateInstructionsVisibility(open) {
    if (!elements.instructionsCard || !elements.instructionsToggleButton) return;

    elements.instructionsCard.hidden = !open;
    elements.instructionsToggleButton.classList.toggle("is-open", open);
    const label = open ? "Скрыть инструкцию" : "Как начать";
    elements.instructionsToggleButton.setAttribute("aria-label", label);
    elements.instructionsToggleButton.setAttribute("title", label);
  }

  function updateQuickAddVisibility(open) {
    if (!elements.quickAddCard || !elements.quickAddToggleButton) return;

    elements.quickAddCard.hidden = !open;
    const label = open ? "Скрыть быстрое добавление" : "Открыть быстрое добавление";
    elements.quickAddToggleButton.setAttribute("aria-label", label);
    elements.quickAddToggleButton.setAttribute("title", label);
    elements.quickAddToggleButton.classList.toggle("is-open", open);
  }

  function updateSearchVisibility(open, { focus = false } = {}) {
    if (!elements.searchField || !elements.searchToggleButton) return;

    elements.searchField.hidden = !open;
    if (elements.searchFilters) {
      elements.searchFilters.hidden = !open;
    }
    elements.searchSection?.classList.toggle("is-open", open);
    elements.searchToggleButton.setAttribute("aria-expanded", String(open));
    elements.searchToggleButton.classList.toggle("is-open", open);
    const label = open ? "Скрыть поиск" : "Открыть поиск";
    elements.searchToggleButton.setAttribute("aria-label", label);
    elements.searchToggleButton.setAttribute("title", label);
    if (focus) {
      elements.searchInput?.focus();
    }
  }

  function updatePager(totalItems, totalPages) {
    const sentinel = elements.operationsLoadSentinel;
    if (!sentinel) return;
    const canLoadMore = totalItems > 0 && state.currentPage < totalPages;
    sentinel.hidden = !canLoadMore;
    operationsLoadObserver?.disconnect();
    operationsLoadObserver = null;
    if (!canLoadMore || !("IntersectionObserver" in window)) return;
    operationsLoadObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      operationsLoadObserver?.disconnect();
      operationsLoadObserver = null;
      loadMoreOperations();
    }, { rootMargin: "0px" });
    operationsLoadObserver.observe(sentinel);
  }

  function renderOperationsList(operations) {
    if (!operations.length) {
      elements.operationsList.innerHTML = `<div class="empty">Нет операций по выбранному фильтру</div>`;
      return;
    }

    let lastDay = "";
    const rows = [];

    for (const operation of operations) {
      const dayLabel = formatOperationDate(operation);
      const amountClass = operation.type;
      const signChar = operation.type === "income" ? "+" : "-";
      const visibleAmount = Math.abs(operation.amount);
      const category = operation.categoryName || "Без категории";
      const description = operation.description || "";
      const menuActionLabel = `Действия для операции "${escapeHtml(category)}"`;
      const isReaderDevice = state.syncSettings.accessMode === "reader";
      const isPendingUpload = !isReaderDevice && state.pendingUploadOperationIds.has(operation.id);

      if (dayLabel !== lastDay) {
        rows.push(`<div class="operation-day">${escapeHtml(dayLabel)}</div>`);
        lastDay = dayLabel;
      }

      rows.push(`
        <article class="operation" data-operation-id="${escapeHtml(operation.id)}">
          ${isReaderDevice ? `
            <button type="button" class="operation-view-trigger" title="Просмотреть" aria-label="Просмотреть операцию &quot;${escapeHtml(category)}&quot;">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>
            </button>
          ` : `
            <button
              type="button"
              class="operation-menu-trigger"
              data-operation-menu-trigger="${operation.id}"
              title="Действия"
              aria-label="${menuActionLabel}"
            >
              ⋯
            </button>
            <div class="operation-menu" role="menu" aria-label="Меню операции">
              <button type="button" class="operation-menu-item" data-operation-action="copy" role="menuitem">Копировать</button>
              <button type="button" class="operation-menu-item" data-operation-action="edit" role="menuitem">Изменить</button>
              <button type="button" class="operation-menu-item" data-operation-action="view" role="menuitem">Просмотреть</button>
              <button type="button" class="operation-menu-item" data-operation-action="delete" role="menuitem">Удалить</button>
            </div>
          `}
          <div class="operation-title">
            <div class="operation-category"><strong>${escapeHtml(category)}</strong>${isPendingUpload ? `<span class="operation-pending-upload" title="Не выгружено в облако" aria-label="Не выгружено в облако" role="img"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 18.4h10a3.8 3.8 0 0 0 .6-7.55A5.7 5.7 0 0 0 7.1 9.3 4.55 4.55 0 0 0 7.2 18.4Z"/><path d="M12 16V7.8M8.9 10.9 12 7.8l3.1 3.1"/></svg></span>` : ""}</div>
            ${description ? `<div class="operation-description">${escapeHtml(description)}</div>` : ""}
          </div>
          <div class="operation-amount ${amountClass}">
            ${signChar} ${formatMoney(visibleAmount)} ₽
          </div>
        </article>
      `);
    }

    elements.operationsList.innerHTML = rows.join("");
  }

  function renderCategoryOptions() {
    const categories = getCategoriesForPicker();
    if (!categories.length) {
      elements.categoryPickerList.innerHTML = `<div class="empty">Категорий пока нет</div>`;
      return;
    }

    elements.categoryPickerList.innerHTML = categories
      .map((category) => {
        const isSelected = category.id === elements.categorySelect.value;
        const dotStyle = `background:${category.color || "#64748b"}`;
        return `
          <button type="button" class="category-picker-option ${isSelected ? "selected" : ""}" data-category-id="${category.id}">
            <span class="category-dot" style="${dotStyle}"></span>
            <span>${escapeHtml(category.name)}</span>
          </button>
        `;
      })
      .join("");
  }

  function getCategoriesForPicker() {
    const useCount = new Map();
    for (const operation of state.operations) {
      if (!operation?.categoryId) continue;
      useCount.set(operation.categoryId, (useCount.get(operation.categoryId) || 0) + 1);
    }

    const popular = state.categories
      .filter((category) => (useCount.get(category.id) || 0) > 0)
      .sort((left, right) => {
        const countDiff = (useCount.get(right.id) || 0) - (useCount.get(left.id) || 0);
        return countDiff || normalizeTextForSearch(left.name).localeCompare(normalizeTextForSearch(right.name), "ru");
      })
      .slice(0, 6);
    const popularIds = new Set(popular.map((category) => category.id));
    const alphabetical = state.categories
      .filter((category) => !popularIds.has(category.id))
      .sort((left, right) => normalizeTextForSearch(left.name).localeCompare(normalizeTextForSearch(right.name), "ru"));

    return [...popular, ...alphabetical];
  }

  function renderPopularCategories() {
    if (!elements.popularCategories) return;

    const useCount = new Map();
    for (const operation of state.operations) {
      if (!operation?.categoryId) continue;
      useCount.set(operation.categoryId, (useCount.get(operation.categoryId) || 0) + 1);
    }

    const popular = state.categories
      .filter((category) => (useCount.get(category.id) || 0) > 0)
      .sort((left, right) => {
        const countDiff = (useCount.get(right.id) || 0) - (useCount.get(left.id) || 0);
        return countDiff || normalizeTextForSearch(left.name).localeCompare(normalizeTextForSearch(right.name), "ru");
      })
      .slice(0, 6);

    elements.popularCategories.hidden = popular.length === 0;
    const disabled = state.quickAddMode === "view" ? " disabled" : "";
    elements.popularCategories.innerHTML = popular
      .map((category) => `<button type="button" class="chip popular-category" data-popular-category-id="${escapeHtml(category.id)}"${disabled}>${escapeHtml(category.name)}</button>`)
      .join("");
  }

  function sanitizeOperations(operations) {
    if (!Array.isArray(operations)) {
      return [];
    }

    return operations
      .filter((operation) => operation && typeof operation === "object")
      .map((operation) => {
        const sourceType = String(operation.type || "").toLowerCase();
        const normalizedType =
          sourceType === "expense" ? "expense" : sourceType === "income" ? "income" : "";

        return {
          ...operation,
          operationDate: parseDateToDateOnlyString(operation.operationDate || operation.date || operation.createdAt),
          id: String(operation.id || "").trim() || getUuid(),
          createdAt: String(operation.createdAt || "").trim(),
          localAddedAt: String(operation.localAddedAt || "").trim(),
          type: normalizedType,
          amount: round2(Math.abs(Number(operation.amount) || 0)),
          categoryId: operation.categoryId || "",
          description: operation.description ? String(operation.description).trim() : "",
        };
      })
      .filter((operation) =>
        Number.isFinite(Number(operation.amount))
        && operation.categoryId
        && operation.operationDate
        && ["income", "expense"].includes(operation.type)
      );
  }
  function renderSyncSettingsForm() {
    if (!elements.syncGoogleClientIdInput || !elements.syncGoogleFileIdInput) return;

    elements.syncGoogleClientIdInput.value = state.syncSettings.googleClientId;
    elements.syncGoogleFileIdInput.value = state.syncSettings.googleFileId;
  }

  function setSyncStatus(message) {
    if (!elements.syncStatus) return;
    elements.syncStatus.textContent = message || "";
  }

  function showAppNotice(message, tone = "success") {
    if (!elements.appNotice) return;
    if (appNoticeTimer) clearTimeout(appNoticeTimer);
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
    const timestamp = Date.parse(state.syncSettings.lastSuccessfulSyncAt || "");
    if (!Number.isFinite(timestamp)) {
      elements.lastSuccessfulSync.textContent = "· ещё не было";
      return;
    }
    elements.lastSuccessfulSync.textContent = `· ${new Date(timestamp).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`;
  }

  async function getGoogleAccessToken(scope) {
    const accessToken = await requestGoogleAccessToken({
      clientId: state.syncSettings.googleClientId,
      scope,
      accountEmail: state.syncSettings.googleAccountEmail,
    });
    await rememberGoogleAccount(accessToken);
    return accessToken;
  }

  async function rememberGoogleAccount(accessToken) {
    try {
      const email = await getGoogleAccountEmail(accessToken);
      if (!email || email === state.syncSettings.googleAccountEmail) return;
      state.syncSettings.googleAccountEmail = email;
      await persistSyncSettings();
    } catch {
      // The account hint is optional and must not interrupt cloud actions.
    }
  }

  function consumeCloudConnectionSettings() {
    const url = new URL(location.href);
    const settings = parseReaderConnectionLink(url.toString(), { isValidKey: isValidCloudEncryptionKey });
    if (!settings) return null;
    url.searchParams.delete('mf_google_client');
    url.searchParams.delete('mf_google_file');
    url.hash = '';
    window.history.replaceState({}, '', url.toString());
    return settings;
  }

  async function onApplyReaderConnectionLink() {
    const value = (elements.readerLinkInput?.value || "").trim();
    let url;
    try {
      url = new URL(value);
    } catch {
      setSyncStatus("Вставьте корректную ссылку подключения из приложения MoneyFlow.");
      return;
    }
    const googleClientId = url.searchParams.get("mf_google_client") || "";
    const googleFileId = url.searchParams.get("mf_google_file") || "";
    const encryptionKey = new URLSearchParams(url.hash.slice(1)).get("mf_key") || "";
    if (!googleClientId || !googleFileId || !isValidCloudEncryptionKey(encryptionKey)) {
      setSyncStatus("В ссылке нет корректного ключа подключения MoneyFlow.");
      return;
    }
    state.syncSettings = sanitizeSyncSettings({
      ...state.syncSettings,
      googleClientId,
      googleFileId,
      accessMode: "unknown",
      googleAccountEmail: "",
    });
    setCloudEncryptionKey(encryptionKey);
    await persistSyncSettings();
    renderSyncSettingsForm();
    updateCloudAccessUI();
    if (elements.readerLinkInput) elements.readerLinkInput.value = "";
    setSyncStatus("Подключение сохранено. Загружаю данные из облака...");
    await downloadFromGoogleDrive({ skipReplaceConfirmation: true });
  }

  function getReaderConnectionLink() {
    if (!isValidCloudEncryptionKey(state.cloudEncryptionKey)) return '';
    return createReaderConnectionLink({
      origin: location.origin,
      pathname: location.pathname,
      googleClientId: state.syncSettings.googleClientId,
      googleFileId: state.syncSettings.googleFileId,
      encryptionKey: state.cloudEncryptionKey,
    });
  }

  function onRefreshReaderConnectionLink() {
    refreshReaderConnectionLink();
  }

  function refreshReaderConnectionLink({ notify = true } = {}) {
    if (state.syncSettings.accessMode !== "writer" || !state.syncSettings.googleFileId) {
      if (notify) setSyncStatus("Ссылка доступна на устройстве редактора после первой выгрузки.");
      return false;
    }
    const link = getReaderConnectionLink();
    if (!link) {
      if (notify) setSyncStatus("Сначала укажите пароль-фразу и выгрузите зашифрованный файл.");
      return false;
    }
    if (elements.readerConnectionLink) elements.readerConnectionLink.value = link;
    if (elements.readerConnection) elements.readerConnection.hidden = false;
    if (notify) {
      setSyncStatus("Ссылка подключения обновлена.");
      showAppNotice("Ссылка подключения обновлена.");
    }
    return true;
  }

  async function onInviteReader() {
    const email = String(elements.readerEmailInput?.value || "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setSyncStatus("Укажите корректный Google e-mail читателя.");
      setReaderInviteStatus("Укажите корректный Gmail-адрес читателя.", "error");
      elements.readerEmailInput?.focus();
      return;
    }
    if (!state.syncSettings.googleFileId || state.syncSettings.accessMode !== "writer") {
      setSyncStatus("Открыть доступ может только ведущее устройство после первой выгрузки.");
      setReaderInviteStatus("Сначала выполните первую выгрузку из ведущего устройства.", "error");
      return;
    }

    setSyncStatus("Выдаю читателю доступ к файлу Google Drive...");
    setReaderInviteStatus("Отправляю приглашение...", "");
    try {
      const accessToken = await getGoogleAccessToken("https://www.googleapis.com/auth/drive.file");
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(state.syncSettings.googleFileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }),
        },
      );
      if (!response.ok) throw new Error(`Google Drive: ${response.status}`);
      const createdPermission = await response.json();
      if (createdPermission?.id && createdPermission?.emailAddress) {
        state.readerPermissions = state.readerPermissions.filter((item) => item.email.toLowerCase() !== String(createdPermission.emailAddress).toLowerCase());
        state.readerPermissions.push({
          id: String(createdPermission.id),
          email: String(createdPermission.emailAddress),
          displayName: String(createdPermission.displayName || ""),
        });
        renderReaderPermissions();
      }
      elements.readerEmailInput.value = "";
      setSyncStatus(`Доступ на чтение выдан: ${email}.`);
      setReaderInviteStatus(`Доступ выдан для ${email}. Отправьте ему ссылку подключения ниже.`, "success");
    } catch (error) {
      setSyncStatus(`Не удалось открыть доступ: ${error?.message || "неизвестная ошибка"}`);
      setReaderInviteStatus(`Отправка не выполнена: ${error?.message || "неизвестная ошибка"}`, "error");
    }
  }

  function setReaderInviteStatus(message, state) {
    if (!elements.readerInviteStatus) return;
    elements.readerInviteStatus.textContent = message || "";
    if (state) {
      elements.readerInviteStatus.dataset.state = state;
    } else {
      delete elements.readerInviteStatus.dataset.state;
    }
  }

  async function onShareReaderConnection() {
    if (!state.syncSettings.googleClientId || !state.syncSettings.googleFileId || state.syncSettings.accessMode !== "writer") {
      setReaderConnectionStatus("Ссылка доступна на ведущем устройстве после первой выгрузки.", "error");
      return;
    }

    const connectionLink = getReaderConnectionLink();
    if (!connectionLink) {
      setReaderConnectionStatus("Обновите ссылку после выгрузки зашифрованного файла.", "error");
      return;
    }
    const appLink = `${location.origin}${location.pathname}`;
    const shareMessage = `Установите M-Flow: ${appLink}\n\n1. Откройте первую ссылку и установите приложение.\n2. В приложении откройте «Настройки синхронизации» в верхней части экрана, затем выберите вкладку «Читатель».\n3. Вставьте вторую ссылку в поле «Ссылка подключения» и нажмите «Подключиться по ссылке»:\n${connectionLink}\n\nДанные загрузятся автоматически.`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "M-Flow: подключение читателя",
          text: shareMessage,
        });
        setReaderConnectionStatus("Ссылка передана читателю.", "success");
        return;
      }
      await copyReaderConnectionLink(shareMessage);
      setReaderConnectionStatus("Инструкция и ссылки скопированы в буфер обмена.", "success");
    } catch (error) {
      if (error?.name === "AbortError") {
        setReaderConnectionStatus("Отправка ссылки отменена.", "");
        return;
      }
      setReaderConnectionStatus("Не удалось отправить ссылку. Попробуйте еще раз.", "error");
    }
  }

  async function copyReaderConnectionLink(connectionLink) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(connectionLink);
      return;
    }
    const input = document.createElement("textarea");
    input.value = connectionLink;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("copy_failed");
  }

  function setReaderConnectionStatus(message, state) {
    if (!elements.readerConnectionStatus) return;
    elements.readerConnectionStatus.textContent = message || "";
    if (state) {
      elements.readerConnectionStatus.dataset.state = state;
    } else {
      delete elements.readerConnectionStatus.dataset.state;
    }
  }

  async function loadReaderPermissions() {
    if (!state.syncSettings.googleFileId || state.syncSettings.accessMode !== "writer") {
      setReaderAccessStatus("Список читателей доступен на ведущем устройстве после первой выгрузки.", "error");
      return;
    }

    setReaderAccessStatus("Загружаю список читателей...", "");
    try {
      const accessToken = await getGoogleAccessToken("https://www.googleapis.com/auth/drive.file");
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(state.syncSettings.googleFileId)}/permissions?fields=permissions(id,emailAddress,displayName,role,type,deleted)&pageSize=100&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) throw new Error(`Google Drive: ${response.status}`);
      const payload = await response.json();
      state.readerPermissions = (Array.isArray(payload?.permissions) ? payload.permissions : [])
        .filter((permission) => permission?.type === "user" && permission?.role === "reader" && permission?.emailAddress && !permission?.deleted)
        .map((permission) => ({
          id: String(permission.id),
          email: String(permission.emailAddress),
          displayName: String(permission.displayName || ""),
        }));
      renderReaderPermissions();
      setReaderAccessStatus(state.readerPermissions.length ? "Список читателей обновлен." : "Приглашенных читателей нет.", "success");
    } catch (error) {
      setReaderAccessStatus(`Не удалось загрузить список: ${error?.message || "неизвестная ошибка"}`, "error");
    }
  }

  function renderReaderPermissions() {
    if (!elements.readerAccessList) return;
    if (!state.readerPermissions.length) {
      elements.readerAccessList.innerHTML = `<div class="empty">Приглашенных читателей нет</div>`;
      return;
    }
    elements.readerAccessList.innerHTML = state.readerPermissions
      .map((permission) => `
        <div class="reader-access-item">
          <span class="reader-access-email">${escapeHtml(permission.email)}</span>
          <button type="button" class="btn btn--danger" data-reader-permission-id="${escapeHtml(permission.id)}">Удалить доступ</button>
        </div>
      `)
      .join("");
  }

  function onReaderAccessListClick(event) {
    const button = event.target.closest("[data-reader-permission-id]");
    if (!button) return;
    const permissionId = button.getAttribute("data-reader-permission-id");
    const permission = state.readerPermissions.find((item) => item.id === permissionId);
    if (!permission) return;
    deleteReaderPermission(permission);
  }

  async function deleteReaderPermission(permission) {
    if (!window.confirm(`Удалить доступ на чтение для ${permission.email}?`)) return;
    setReaderAccessStatus("Удаляю доступ...", "");
    try {
      const accessToken = await getGoogleAccessToken("https://www.googleapis.com/auth/drive.file");
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(state.syncSettings.googleFileId)}/permissions/${encodeURIComponent(permission.id)}?supportsAllDrives=true`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error?.message || `Google Drive: ${response.status}`);
      }
      state.readerPermissions = state.readerPermissions.filter((item) => item.id !== permission.id);
      renderReaderPermissions();
      setReaderAccessStatus(`Доступ удален: ${permission.email}.`, "success");
    } catch (error) {
      setReaderAccessStatus(`Не удалось удалить доступ: ${error?.message || "неизвестная ошибка"}`, "error");
    }
  }

  function setReaderAccessStatus(message, state) {
    if (!elements.readerAccessStatus) return;
    elements.readerAccessStatus.textContent = message || "";
    if (state) {
      elements.readerAccessStatus.dataset.state = state;
    } else {
      delete elements.readerAccessStatus.dataset.state;
    }
  }

  function getStoredCloudEncryptionKey() {
    const key = localStorage.getItem(STORAGE_KEYS.cloudEncryptionKey) || "";
    return isValidCloudEncryptionKey(key) ? key : "";
  }

  function getStoredCloudEncryptionSalt() {
    const salt = localStorage.getItem(STORAGE_KEYS.cloudEncryptionSalt) || "";
    try {
      return base64ToBytes(salt).byteLength === 16 ? salt : "";
    } catch {
      return "";
    }
  }

  function isValidCloudEncryptionKey(key) {
    return isValidEncryptionKey(key);
  }

  function setCloudEncryptionKey(key) {
    if (!isValidCloudEncryptionKey(key)) return false;
    state.cloudEncryptionKey = key;
    localStorage.setItem(STORAGE_KEYS.cloudEncryptionKey, key);
    return true;
  }

  function resetCloudEncryptionMaterial() {
    state.cloudEncryptionKey = "";
    state.cloudEncryptionSalt = "";
    localStorage.removeItem(STORAGE_KEYS.cloudEncryptionKey);
    localStorage.removeItem(STORAGE_KEYS.cloudEncryptionSalt);
  }

  async function ensureEditorEncryptionKey() {
    if (isValidCloudEncryptionKey(state.cloudEncryptionKey)) return state.cloudEncryptionKey;
    if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.getRandomValues) throw new Error('Браузер не поддерживает шифрование файла');
    let salt = state.cloudEncryptionSalt;
    if (!salt) {
      salt = createEncryptionSalt();
      state.cloudEncryptionSalt = salt;
      localStorage.setItem(STORAGE_KEYS.cloudEncryptionSalt, salt);
    }
    const key = await deriveEncryptionKey(state.cloudPassphrase, salt);
    setCloudEncryptionKey(key);
    return key;
  }

  async function encryptCloudPayload(payload) {
    return encryptCloudPayloadValue(payload, {
      encryptionKey: await ensureEditorEncryptionKey(),
      salt: state.cloudEncryptionSalt,
    });
  }

  async function restoreEditorEncryptionKeyFromCloudFile(encryptedPayload) {
    const kdf = encryptedPayload?.kdf;
    if (!state.cloudPassphrase || !isExpectedKdf(kdf)) return '';
    try {
      const salt = String(kdf.salt || '');
      if (base64ToBytes(salt).byteLength !== 16) return '';
      const key = await deriveEncryptionKey(state.cloudPassphrase, salt);
      state.cloudEncryptionSalt = salt;
      localStorage.setItem(STORAGE_KEYS.cloudEncryptionSalt, salt);
      setCloudEncryptionKey(key);
      return key;
    } catch {
      return '';
    }
  }

  async function decryptCloudPayload(encryptedPayload) {
    if (Array.isArray(encryptedPayload?.operations) && Array.isArray(encryptedPayload?.categories)) return encryptedPayload;
    let key = state.cloudEncryptionKey;
    if (!isValidCloudEncryptionKey(key) && state.syncSettings.accessMode !== 'reader') {
      key = await restoreEditorEncryptionKeyFromCloudFile(encryptedPayload);
    }
    if (!isValidCloudEncryptionKey(key)) throw new Error('В приложении нет ключа. Откройте актуальную ссылку подключения от редактора.');
    try {
      return await decryptCloudPayloadValue(encryptedPayload, key);
    } catch {
      throw new Error('Не удалось расшифровать файл. Откройте актуальную ссылку подключения от редактора.');
    }
  }

  function getCloudPayload() {
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      operations: state.operations,
      categories: state.categories,
    };
  }

  async function uploadToGoogleDrive() {
    setSyncStatus('Открываю вход Google и шифрую полный файл...');
    try {
      const accessToken = await getGoogleAccessToken('https://www.googleapis.com/auth/drive.file');
      const metadata = await uploadDriveData({
        accessToken,
        fileId: state.syncSettings.googleFileId,
        payload: JSON.stringify(await encryptCloudPayload(getCloudPayload())),
        createId: getUuid,
      });
      if (!state.syncSettings.googleFileId && metadata?.id) {
        state.syncSettings.googleFileId = metadata.id;
        state.syncSettings.accessMode = 'writer';
      }
      state.syncSettings.lastSuccessfulSyncAt = new Date().toISOString();
      await persistSyncSettings();
      renderSyncSettingsForm();
      updateCloudAccessUI();
      renderLastSuccessfulSync();
      clearPendingCloudChanges();
      render();
      setSyncStatus('Зашифрованный файл успешно выгружен в Google Drive.');
      showAppNotice('Данные успешно выгружены в облако.');
    } catch (error) {
      const message = `Выгрузка неуспешна: ${error?.message || "неизвестная ошибка"}`;
      setSyncStatus(message);
      showAppNotice(message, 'error');
    }
  }

  async function downloadFromGoogleDrive({ skipReplaceConfirmation = false } = {}) {
    setSyncStatus('Открываю вход Google и загружаю файл...');
    try {
      const accessToken = await getGoogleAccessToken('https://www.googleapis.com/auth/drive.readonly');
      if (!state.syncSettings.googleFileId) {
        const cloudFile = await findLatestDriveFile({ accessToken });
        if (!cloudFile?.id) throw new Error('Файл MoneyFlow не найден. Сначала выгрузите данные в облако.');
        state.syncSettings.googleFileId = cloudFile.id;
        state.syncSettings.accessMode = 'unknown';
        await persistSyncSettings();
        renderSyncSettingsForm();
        updateCloudAccessUI();
      }
      if (!skipReplaceConfirmation && (state.operations.length || state.categories.length) && !window.confirm('Загрузка из облака полностью заменит локальные операции и категории. Продолжить?')) return;
      state.syncSettings.accessMode = await getDriveAccessMode({ accessToken, fileId: state.syncSettings.googleFileId });
      await persistSyncSettings();
      updateCloudAccessUI();
      const encryptedPayload = await downloadDriveData({ accessToken, fileId: state.syncSettings.googleFileId });
      const payload = await decryptCloudPayload(encryptedPayload);
      if (!Array.isArray(payload?.operations) || !Array.isArray(payload?.categories)) throw new Error('Файл не похож на данные MoneyFlow');
      state.operations = sanitizeOperations(payload.operations);
      state.categories = sanitizeCategories(payload.categories);
      state.activeCategoryFilter = new Set();
      state.currentPage = 1;
      writeJson(STORAGE_KEYS.operations, state.operations);
      writeJson(STORAGE_KEYS.categories, state.categories);
      renderCategoryOptions();
      render();
      state.syncSettings.lastSuccessfulSyncAt = new Date().toISOString();
      await persistSyncSettings();
      renderLastSuccessfulSync();
      clearPendingCloudChanges();
      refreshReaderConnectionLink({ notify: false });
      setSyncStatus('Данные из облака загружены. Локальные операции и категории заменены.');
      showAppNotice(state.syncSettings.accessMode === 'reader' ? 'Данные синхронизированы.' : 'Данные из облака загружены.');
    } catch (error) {
      const message = `Загрузка неуспешна: ${error?.message || "неизвестная ошибка"}`;
      setSyncStatus(message);
      showAppNotice(message, 'error');
    }
  }

  function getCategoryName(categoryId) {
    return state.categories.find((category) => category.id === categoryId)?.name || "Без категории";
  }

  function getCategoryById(categoryId) {
    return state.categories.find((category) => category.id === categoryId) || null;
  }

  function loadMoreOperations() {
    const yearFiltered = getOperationsByYear(enrichOperationsWithBalance(state.operations, getCategoryName), state);
    const visible = getFilteredOperations(yearFiltered, state);
    const totalPages = Math.ceil(visible.length / state.pageSize) || 0;
    if (state.currentPage >= totalPages) return;

    state.currentPage += 1;
    render();
  }

  function onCategoryPickerSelect(event) {
    const button = event.target.closest("[data-category-id], [data-action]");
    if (!button) return;

    if (button.dataset.action === "add-category") {
      addCategoryFromPickerSearch();
      return;
    }
    if (button.dataset.action === "start-category-search") {
      startCategorySearch();
      return;
    }

    const categoryId = button.getAttribute("data-category-id");
    if (!categoryId) return;
    setCategorySelection(categoryId);
    closeCategoryPicker();
  }

  function openCategoryCreator() {
    if (state.quickAddMode === "view" || !elements.categoryCreateForm || !elements.categoryCreateNameInput) return;
    elements.categoryCreateForm.hidden = false;
    elements.categoryCreateNameInput.value = "";
    elements.categoryCreateNameInput.focus({ preventScroll: true });
  }

  function closeCategoryCreator() {
    if (elements.categoryCreateForm) elements.categoryCreateForm.hidden = true;
    if (elements.categoryCreateNameInput) elements.categoryCreateNameInput.value = "";
  }

  function onCreateCategory() {
    const category = addCategory(elements.categoryCreateNameInput?.value || "");
    if (!category) {
      elements.categoryCreateNameInput?.focus({ preventScroll: true });
      return;
    }
    setCategorySelection(category.id);
    closeCategoryCreator();
    renderCategoryOptions();
    closeCategoryPicker();
  }

  function startCategorySearch() {
    if (state.quickAddMode === "view" || !elements.categoryPickerInput) return;
    state.categorySearchEditing = true;
    elements.categorySelect.value = "";
    elements.categoryPickerInput.readOnly = false;
    elements.categoryPickerInput.value = "";
    state.categorySearchText = "";
    state.categoryCurrentPage = 1;
    renderCategoryOptions();
    elements.categoryPickerInput.focus({ preventScroll: true });
  }

  function onPopularCategoryClick(event) {
    if (state.quickAddMode === "view") return;
    const button = event.target.closest("[data-popular-category-id]");
    const categoryId = button?.getAttribute("data-popular-category-id");
    if (!categoryId) return;
    setCategorySelection(categoryId);
    closeCategoryPicker();
  }

  function onOutsideCategoryPickerClick(event) {
    if (!elements.categoryPickerPopover || !elements.categoryPicker) return;
    if (!elements.categoryPickerPopover.hidden && !elements.categoryPicker.contains(event.target) && !elements.categoryPickerPopover.contains(event.target)) {
      closeCategoryPicker();
    }
  }

  function toggleCategoryPicker() {
    if (!elements.categoryPickerPopover) return;
    if (elements.categoryPickerPopover.hidden) {
      openCategoryPicker();
    } else {
      closeCategoryPicker();
    }
  }

  function openCategoryPicker() {
    if (elements.form && elements.form.classList.contains("is-readonly")) return;
    if (!elements.categoryPickerPopover) return;
    elements.categoryPickerPopover.hidden = false;
    state.categorySearchText = state.categorySearchEditing
      ? (elements.categoryPickerInput?.value || "").trim()
      : "";
    state.categoryCurrentPage = 1;
    renderCategoryOptions();
    if (state.categorySearchEditing) {
      elements.categoryPickerInput?.focus();
    }
  }

  function closeCategoryPicker() {
    if (!elements.categoryPickerPopover) return;
    elements.categoryPickerPopover.hidden = true;
    closeCategoryCreator();
    if (!state.categorySearchEditing) return;

    state.categorySearchEditing = false;
    state.categorySearchText = "";
    state.categoryCurrentPage = 1;
    if (elements.categoryPickerInput) {
      elements.categoryPickerInput.readOnly = true;
      const selectedCategory = getCategoryById(elements.categorySelect?.value);
      elements.categoryPickerInput.value = selectedCategory?.name || "";
    }
  }

  function loadMoreCategories() {
    const totalPages = Math.ceil(getCategoryPickerSlice().totalItems / CATEGORY_PAGE_SIZE) || 0;
    if (state.categoryCurrentPage >= totalPages) return;

    state.categoryCurrentPage += 1;
    renderCategoryOptions();
  }

  function getCategoryPickerSlice() {
    const normalizedSearch = normalizeTextForSearch(state.categorySearchText);
    const filtered = getMatchedCategories(state.categories, normalizedSearch);

    const totalItems = filtered.length;
    const totalPages = Math.max(Math.ceil(totalItems / CATEGORY_PAGE_SIZE), 0);
    if (state.categoryCurrentPage > Math.max(totalPages, 1)) {
      state.categoryCurrentPage = 1;
    }
    return {
      totalItems,
      totalPages,
      pageItems: filtered.slice(0, state.categoryCurrentPage * CATEGORY_PAGE_SIZE),
    };
  }

  function updateCategoryPickerPager(totalItems, totalPages) {
    if (!elements.categoryPickerLoadMoreBtn) return;
    elements.categoryPickerLoadMoreBtn.hidden = totalItems === 0 || state.categoryCurrentPage >= totalPages;
  }

  function setCategorySelection(categoryId) {
    if (!elements.categorySelect || !elements.categoryPickerInput) return;

    const category = state.categories.find((item) => item.id === categoryId);
    if (!category) return;

    state.categorySearchEditing = false;
    elements.categorySelect.value = category.id;
    elements.categoryPickerInput.value = category.name;
    elements.categoryPickerInput.readOnly = true;
  }

  function ensureCategorySelection() {
    const selectedCategoryId = elements.categorySelect.value;
    if (!selectedCategoryId) {
      if (normalizeTextForSearch(elements.categoryPickerInput.value)) {
        const normalizedInput = normalizeTextForSearch(elements.categoryPickerInput.value);
        const exact = state.categories.find((category) => normalizeTextForSearch(category.name) === normalizedInput);
        if (exact) {
          setCategorySelection(exact.id);
          return exact.id;
        }
      }
      elements.categoryPickerInput.focus();
      return "";
    }

    const exists = state.categories.some((category) => category.id === selectedCategoryId);
    if (!exists) {
      elements.categoryPickerInput.focus();
      return "";
    }

    return selectedCategoryId;
  }

  function addCategory(name, color) {
    const trimName = String(name || "").trim();
    if (!trimName) return null;

    const normalizedName = normalizeTextForSearch(trimName);
    const existing = findCategoryByNormalizedName(state.categories, normalizedName);
    if (existing) {
      setCategorySelection(existing.id);
      return existing;
    }

    const category = {
      id: getCategoryId(trimName),
      name: trimName,
      mode: "both",
      color: normalizeHexColor(color || getRandomCategoryColor()),
    };

    state.categories.push(category);
    writeJson(STORAGE_KEYS.categories, state.categories);
    markPendingCloudChanges();
    return category;
  }

  function getRandomCategoryColor() {
    return pickCategoryColor(state.categories, CATEGORY_COLORS);
  }
  function addCategoryFromPickerSearch() {
    const name = (elements.categoryPickerInput.value || "").trim();
    if (!name) {
      return;
    }
    const category = addCategory(name);
    if (!category) return;

    setCategorySelection(category.id);
    elements.categoryPickerInput.value = category.name;
    state.categorySearchText = "";
    state.categoryCurrentPage = 1;
    renderCategoryOptions();
    closeCategoryPicker();
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
  }

  main();
})();
