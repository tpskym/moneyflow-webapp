(() => {
  const STORAGE_KEYS = {
    operations: "moneyflow-operations-v1",
    categories: "moneyflow-categories-v1",
    syncSettings: "moneyflow-sync-settings-v1",
  };

  const DEFAULT_CATEGORIES = [];

  const PASSWORD_CIPHER_PREFIX = "moneyflow-aes-gcm-v1:";
  const PASSWORD_CRYPTO_DB = "moneyflow-security-v1";
  const PASSWORD_CRYPTO_STORE = "keys";
  const PASSWORD_CRYPTO_KEY_ID = "webdav-password";
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
    balanceCurrent: document.getElementById("balance-current"),
    lastSuccessfulSync: document.getElementById("last-successful-sync"),
    searchSection: document.getElementById("search-section"),
    searchToggleButton: document.getElementById("search-toggle"),
    searchField: document.getElementById("search-field"),
    searchFilters: document.getElementById("search-filters"),
    searchInput: document.getElementById("search-input"),
    operationsList: document.getElementById("operations-list"),
    chipContainer: document.querySelector(".chips"),
    balanceTitle: document.getElementById("balance-title"),
    loadMoreOperationsButton: document.getElementById("load-more-operations"),
    yearFilterContainer: document.getElementById("year-filters"),
    categoryFilterContainer: document.getElementById("category-filters"),
    syncToggleButton: document.getElementById("sync-settings-toggle"),
    syncSettingsCard: document.getElementById("sync-settings-section"),
    syncGoogleClientIdField: document.getElementById("google-client-id-field"),
    instructionsToggleButton: document.getElementById("instructions-toggle"),
    instructionsCard: document.getElementById("instructions-section"),
    instructionsCloseButton: document.getElementById("instructions-close"),
    syncGoogleClientIdInput: document.getElementById("google-client-id"),
    syncGoogleFileIdInput: document.getElementById("google-file-id"),
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
    readerConnectionShareButton: document.getElementById("reader-connection-share"),
    readerConnectionStatus: document.getElementById("reader-connection-status"),
    readerAccessManagement: document.getElementById("reader-access-management"),
    readerAccessRefreshButton: document.getElementById("reader-access-refresh"),
    readerAccessList: document.getElementById("reader-access-list"),
    readerAccessStatus: document.getElementById("reader-access-status"),
    syncStatus: document.getElementById("cloud-status"),
    appNotice: document.getElementById("app-notice"),
    clearDataButton: document.getElementById("cloud-clear-data"),
    quickAddToggleButton: document.getElementById("quick-add-toggle"),
    quickAddCard: document.getElementById("quick-add-card"),
    quickAddTitle: document.getElementById("quick-add-title"),
    operationSubmitButton: document.getElementById("operation-submit"),
    quickAddDismissButton: document.getElementById("quick-add-dismiss"),
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
    searchText: "",
    activeTypeFilter: "all",
    activeYearFilter: new Set(),
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
  };

  let searchDebounce;
  let categoryPickerDebounce;
  let operationLongPressTimer;
  let longPressHandledOperationId = null;
  let activeSyncTab = "editor";
  let appNoticeTimer;

  async function main() {
    enableLiveReload();
    const persistedOperations = readJson(STORAGE_KEYS.operations, []);
    state.operations = sanitizeOperations(persistedOperations);
    state.categories = sanitizeCategories(readJson(STORAGE_KEYS.categories, DEFAULT_CATEGORIES));
    state.syncSettings = sanitizeSyncSettings(readJson(STORAGE_KEYS.syncSettings, state.syncSettings));
    const connectionSettings = consumeCloudConnectionSettings();
    if (connectionSettings) {
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
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
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
    elements.categoryFilterContainer?.addEventListener("click", onCategoryFilterClick);
    elements.loadMoreOperationsButton.addEventListener("click", loadMoreOperations);
    elements.readerLinkApplyButton?.addEventListener("click", onApplyReaderConnectionLink);
    elements.syncEditorTabButton?.addEventListener("click", () => setActiveSyncTab("editor"));
    elements.syncReaderTabButton?.addEventListener("click", () => setActiveSyncTab("reader"));
    elements.syncSaveButton?.addEventListener("click", onSyncSave);
    elements.clearDataButton?.addEventListener("click", onClearLocalData);
    elements.cloudUploadTopButton?.addEventListener("click", onCloudUpload);
    elements.cloudDownloadTopButton?.addEventListener("click", onCloudDownload);
    elements.cloudUploadButton?.addEventListener("click", onCloudUpload);
    elements.cloudDownloadButton?.addEventListener("click", onCloudDownload);
    elements.readerCloudDownloadButton?.addEventListener("click", onReaderCloudDownload);
    elements.readerInviteButton?.addEventListener("click", onInviteReader);
    elements.readerConnectionShareButton?.addEventListener("click", onShareReaderConnection);
    elements.readerAccessRefreshButton?.addEventListener("click", loadReaderPermissions);
    elements.readerAccessList?.addEventListener("click", onReaderAccessListClick);
    elements.syncToggleButton?.addEventListener("click", onSyncToggle);
    elements.instructionsToggleButton?.addEventListener("click", onInstructionsToggle);
    elements.instructionsCloseButton?.addEventListener("click", () => updateInstructionsVisibility(false));
    elements.quickAddToggleButton?.addEventListener("click", onQuickAddToggle);
    elements.operationDateInput?.addEventListener("input", onOperationDateInput);
    elements.operationDateInput?.addEventListener("blur", onOperationDateInputBlur);
    elements.operationsList.addEventListener("pointerdown", onOperationsListPointerDown);
    elements.operationsList.addEventListener("pointerup", onOperationsListPointerUp);
    elements.operationsList.addEventListener("pointercancel", onOperationsListPointerCancel);
    elements.operationsList.addEventListener("pointerleave", onOperationsListPointerCancel);
    elements.operationsList.addEventListener("lostpointercapture", onOperationsListPointerCancel);
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

  async function onSyncSave({ close = false } = {}) {
    const googleClientId = (elements.syncGoogleClientIdInput?.value || state.syncSettings.googleClientId || "").trim();
    const googleFileId = (elements.syncGoogleFileIdInput?.value || state.syncSettings.googleFileId || "").trim();
    state.syncSettings = sanitizeSyncSettings({
      googleClientId,
      googleFileId,
      accessMode: googleFileId === state.syncSettings.googleFileId ? state.syncSettings.accessMode : "unknown",
      googleAccountEmail: state.syncSettings.googleAccountEmail,
    });
    await persistSyncSettings();
    updateCloudAccessUI();
    setSyncStatus("Настройки сохранены.");
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

  async function onCloudUpload() {
    const saved = await onSyncSave({ close: false });
    if (!saved) {
      updateSyncSettingsVisibility(true);
      return;
    }
    if (state.syncSettings.accessMode !== "writer" && state.syncSettings.googleFileId) {
      updateSyncSettingsVisibility(true);
      setSyncStatus("Это устройство настроено только для чтения. Выгрузка недоступна.");
      return;
    }
    const missingSyncSettings = getMissingSyncSettings();
    if (missingSyncSettings.length > 0) {
      updateSyncSettingsVisibility(true);
      setSyncStatus(`Выгрузка не выполнена: заполните ${missingSyncSettings.join(", ")}.`);
      const firstMissingInput = elements.syncGoogleClientIdInput;
      firstMissingInput?.focus();
      return;
    }
    uploadToGoogleDrive();
  }

  async function onCloudDownload({ skipReplaceConfirmation = state.syncSettings.accessMode === "reader" } = {}) {
    const saved = await onSyncSave({ close: false });
    if (!saved) {
      updateSyncSettingsVisibility(true);
      return;
    }
    const missingSyncSettings = getMissingSyncSettings();
    if (missingSyncSettings.length > 0) {
      updateSyncSettingsVisibility(true);
      setSyncStatus(`Загрузка не выполнена: заполните ${missingSyncSettings.join(", ")}.`);
      elements.syncGoogleClientIdInput?.focus();
      return;
    }
    downloadFromGoogleDrive({ skipReplaceConfirmation });
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

  function setAmountValue(value) {
    const rawValue = String(value || "");
    if (elements.amountInput) {
      elements.amountInput.value = rawValue;
    }
    if (elements.amountDisplay) {
      elements.amountDisplay.textContent = rawValue ? rawValue.replace(".", ",") : "0";
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
      } else {
        state.operations.push(operationFromForm);
      }
    } else {
      state.operations.push(operationFromForm);
    }
    writeJson(STORAGE_KEYS.operations, state.operations);

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
        openQuickAddWithOperation(operation, { mode: "copy", date: getOperationDateValue(operation) });
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
      const firstCategory = getAllCategoriesSorted()[0];
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
    state.currentPage = 1;
    render();
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
    elements.operationDateInput.value = value || getTodayInputDate();
  }

  function normalizeDateForInput(dateValue) {
    const date = parseDateFromValue(dateValue);
    if (Number.isNaN(date.getTime())) return getTodayInputDate();
    return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
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

  function getTodayInputDate() {
    return normalizeDateForInput(getTodayDate());
  }

  function parseOperationDate(value) {
    const date = parseDateFromInput(value);
    if (Number.isNaN(date.getTime())) {
      return getTodayDate();
    }
    return date;
  }

  function parseDateFromInput(value) {
    if (!value) return getTodayDate();

    const normalized = String(value)
      .trim()
      .replace(/\//g, ".");

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const [year, month, day] = normalized.split("-").map((part) => Number(part));
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime()) && `${String(parsed.getDate()).padStart(2, "0")}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${parsed.getFullYear()}` === normalized.split("-").reverse().join(".")) {
        return parsed;
      }
    }

    if (/^\d{2}\.\d{2}\.\d{4}$/.test(normalized)) {
      const [day, month, year] = normalized.split(".").map((part) => Number(part));
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime()) && `${String(parsed.getDate()).padStart(2, "0")}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${parsed.getFullYear()}` === normalized) {
        return parsed;
      }
    }

    const digits = normalized.replace(/\D/g, "");
    if (digits.length === 8) {
      const day = Number(digits.slice(0, 2));
      const month = Number(digits.slice(2, 4));
      const year = Number(digits.slice(4, 8));
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month - 1 && parsed.getFullYear() === year) {
        return parsed;
      }
    }

    return getTodayDate();
  }

  function getTodayDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function dateToDateOnlyString(date) {
    return parseDateToDateOnlyString(date);
  }

  function parseDateToDateOnlyString(dateValue) {
    const date = parseDateFromValue(dateValue);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function operationDateOnlyString(dateValue) {
    return parseDateToDateOnlyString(dateValue);
  }

  function parseDateFromValue(value) {
    if (!value) return new Date(NaN);
    if (typeof value === "number") {
      const direct = new Date(value);
      if (!Number.isNaN(direct.getTime())) return direct;
      return new Date(NaN);
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? new Date(NaN) : value;
    }

    if (typeof value !== "string") {
      return new Date(NaN);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-").map((part) => Number(part));
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
      const [day, month, year] = value.split(".").map((part) => Number(part));
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const direct = new Date(value);
    return Number.isNaN(direct.getTime()) ? new Date(NaN) : direct;
  }

  function isValidTimestamp(value) {
    return Number.isFinite(parseDateFromValue(value).getTime());
  }

  function getDisplayOperationId(operationId) {
    const normalized = String(operationId || "").trim();
    if (!normalized) return "";
    if (normalized.length <= 10) {
      return normalized;
    }
    return `${normalized.slice(0, 5)}…${normalized.slice(-4)}`;
  }

  function getSyncCreatedAtBase(syncStartedAt) {
    const syncStartedTimestamp = parseDateFromValue(syncStartedAt).getTime();
    const baseTimestamp = Number.isFinite(syncStartedTimestamp)
      ? syncStartedTimestamp
      : Date.now();
    return baseTimestamp + SYNC_CREATED_AT_OFFSET_MS;
  }

  function prepareOperationsForSync(operations, syncStartedAt) {
    const baseTimestamp = getSyncCreatedAtBase(syncStartedAt);
    let cursor = 0;
    let changed = false;

    const updated = Array.isArray(operations)
      ? operations.map((operation) => {
          if (!operation || typeof operation !== "object") return operation;

          const isCreatedAtMissing = !isValidTimestamp(operation.createdAt);
          const isIdMissing = !String(operation.id || "").trim();
          if (!isIdMissing && !isCreatedAtMissing) {
            return operation;
          }

          changed = true;
          const nextCreatedAt = isCreatedAtMissing ? new Date(baseTimestamp + cursor).toISOString() : operation.createdAt;
          if (isCreatedAtMissing) {
            cursor += 1;
          }

          return {
            ...operation,
            id: isIdMissing ? getUuid() : operation.id,
            createdAt: isCreatedAtMissing ? nextCreatedAt : operation.createdAt,
          };
        })
      : [];

    return { operations: updated, changed };
  }

  function prepareRemoteOperationForSync(operation, syncStartedAt, cursor) {
    if (operation && typeof operation === "object") {
      if (!isValidTimestamp(operation.createdAt)) {
        return {
          ...operation,
          createdAt: new Date(getSyncCreatedAtBase(syncStartedAt) + cursor).toISOString(),
        };
      }
      return operation;
    }
    return operation;
  }

  function getOperationDateValue(operation) {
    if (!operation) return "";
    const byOperationDate = parseDateFromValue(operation.operationDate);
    if (byOperationDate) {
      return parseDateToDateOnlyString(byOperationDate);
    }
    return parseDateToDateOnlyString(parseDateFromValue(operation.date || operation.createdAt));
  }

  function getOperationSortDate(operation) {
    const operationDate = parseDateFromValue(getOperationDateValue(operation));
    const createdAtDate = parseDateFromValue(operation?.createdAt);
    return operationDate.getTime();
  }

  function compareOperationsChronologicalAscending(left, right) {
    return getOperationSortDate(left) - getOperationSortDate(right) || dateToOrderTiebreak(left, right);
  }

  function compareOperationsChronologicalDescending(left, right) {
    return getOperationSortDate(right) - getOperationSortDate(left) || dateToOrderTiebreak(right, left);
  }

  function dateToOrderTiebreak(left, right) {
    const leftCreated = getOperationOrderTimestamp(left);
    const rightCreated = getOperationOrderTimestamp(right);
    return leftCreated - rightCreated || String(left?.id || "").localeCompare(String(right?.id || ""));
  }

  function getOperationOrderTimestamp(operation) {
    const syncCreatedAt = parseDateFromValue(operation?.createdAt).getTime();
    if (Number.isFinite(syncCreatedAt)) return syncCreatedAt;

    const localAddedAt = parseDateFromValue(operation?.localAddedAt).getTime();
    return Number.isFinite(localAddedAt) ? localAddedAt : 0;
  }

  function formatOperationDate(operation) {
    const operationDate = parseDateFromValue(getOperationDateValue(operation));
    return operationDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatOperationDateTime(operation) {
    const createdAtDate = parseDateFromValue(operation?.createdAt);
    if (Number.isNaN(createdAtDate.getTime())) return "Ожидает синхронизации";
    const ms = String(createdAtDate.getMilliseconds()).padStart(3, "0");
    const time = createdAtDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${createdAtDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })} ${time}.${ms}`;
  }

  function formatAmountForCancellation(value) {
    return Math.abs(round2(Number(value) || 0)).toFixed(2);
  }

  function render() {
    const enrichedOps = enrichOperationsWithBalance(state.operations);
    const yearFiltered = getOperationsByYear(enrichedOps);
    const filtered = getFilteredOperations(yearFiltered);
    const visibleOperations = filtered;
    const totalPages = Math.ceil(visibleOperations.length / state.pageSize);
    const safeTotalPages = Math.max(totalPages, 0);
    if (state.currentPage > Math.max(safeTotalPages, 1)) state.currentPage = 1;

    const pageItems = visibleOperations.slice(0, state.currentPage * state.pageSize);
    const filteredBalance = filtered.reduce((sum, operation) => sum + signedAmount(operation), 0);

    updateBalances(filteredBalance);
    renderYearFilters();
    renderCategoryFilters();
    renderCategoryOptions();
    renderOperationsList(pageItems);
    updatePager(visibleOperations.length, safeTotalPages);
  }

  function enrichOperationsWithBalance(operations) {
    const sorted = [...operations].sort((a, b) => compareOperationsChronologicalAscending(a, b));
    let runningBalance = 0;
    const map = new Map();

    for (const operation of sorted) {
      runningBalance = round2(runningBalance + signedAmount(operation));
      map.set(operation.id, round2(runningBalance));
    }

    return operations.map((operation) => ({
      ...operation,
      balanceAfter: map.get(operation.id) ?? 0,
      categoryName: getCategoryName(operation.categoryId),
    }));
  }

  function getFilteredOperations(opsWithBalance) {
    const normalizedQuery = normalizeTextForSearch(state.searchText);
    const queryAmount = normalizeAmountForSearch(state.searchText);

    const filteredByQuery = opsWithBalance
      .filter((operation) => {
        if (!["income", "expense"].includes(operation.type)) return false;
        if (state.activeCategoryFilter.size && !state.activeCategoryFilter.has(operation.categoryId)) return false;

        if (!normalizedQuery) return true;

        const description = normalizeTextForSearch(operation.description || "");
        const category = normalizeTextForSearch(operation.categoryName || "");
        const amountCandidates = [
          normalizeAmountForSearch(formatMoney(operation.amount)),
          normalizeAmountForSearch(formatMoney(Math.abs(operation.amount))),
          normalizeAmountForSearch(operation.amount.toString()),
          normalizeAmountForSearch(operation.amount.toFixed(2)),
        ];

        return (
          `${description} ${category}`.includes(normalizedQuery) ||
          amountCandidates.some((candidate) => candidate.includes(queryAmount))
        );
      })
      .sort((a, b) => compareOperationsChronologicalDescending(a, b));

    if (state.activeTypeFilter === "all") {
      return filteredByQuery;
    }

    return filteredByQuery.filter((operation) => operation.type === state.activeTypeFilter);
  }

  function getOperationsByYear(operations) {
    if (!(state.activeYearFilter instanceof Set) || state.activeYearFilter.size === 0) {
      return [...operations];
    }

    return operations.filter((operation) => state.activeYearFilter.has(getOperationYear(operation)));
  }

  function getOperationYear(operation) {
    const operationDate = parseDateFromValue(getOperationDateValue(operation));
    return operationDate.getFullYear();
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
    if (isReadOnly) activeSyncTab = "reader";
    if (isWriter) activeSyncTab = "editor";
    renderSyncTabs();

    if (elements.readerLinkConnect) elements.readerLinkConnect.hidden = false;

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
    if (!elements.loadMoreOperationsButton) return;
    elements.loadMoreOperationsButton.hidden = totalItems === 0 || state.currentPage >= totalPages;
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
            <div class="operation-category"><strong>${escapeHtml(category)}</strong></div>
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

  function getCategoryId(name) {
    const base = normalizeTextForSearch(name)
      .replace(/[^a-z0-9\-_ ]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 32);
    const safeBase = base || "cat";
    const candidate = `${safeBase}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
    return candidate;
  }

  function normalizeHexColor(value) {
    const match = /^#([0-9a-fA-F]{6})$/.test(value || "");
    if (match) return value.toUpperCase();
    return "#64748B";
  }

  function sanitizeCategories(categories) {
    if (!Array.isArray(categories)) return [...DEFAULT_CATEGORIES];
    return categories
      .map((category) => {
        if (!category || typeof category !== "object") return null;
        const name = String(category.name || "").trim();
        const mode = "both";
        if (!name) return null;
        return {
          id: category.id || getCategoryId(name),
          name,
          mode,
          color: normalizeHexColor(category.color || "#64748b"),
        };
      })
      .filter(Boolean);
  }

  function sanitizeSyncSettings(settings) {
    return {
      googleClientId: String((settings && settings.googleClientId) || "").trim(),
      googleFileId: String((settings && settings.googleFileId) || "").trim(),
      accessMode: settings && ["writer", "reader", "unknown"].includes(settings.accessMode)
        ? settings.accessMode
        : "writer",
      googleAccountEmail: String((settings && settings.googleAccountEmail) || "").trim(),
      lastSuccessfulSyncAt: String((settings && settings.lastSuccessfulSyncAt) || "").trim(),
    };
  }

  async function restoreSyncSettings(storedSettings) {
    if (!storedSettings.password) {
      return { settings: storedSettings, needsEncryption: false };
    }
    if (!storedSettings.password.startsWith(PASSWORD_CIPHER_PREFIX)) {
      return { settings: storedSettings, needsEncryption: true };
    }

    return {
      settings: {
        ...storedSettings,
        password: await decryptStoredPassword(storedSettings.password),
      },
      needsEncryption: false,
    };
  }

  async function persistSyncSettings() {
    writeJson(STORAGE_KEYS.syncSettings, state.syncSettings);
  }

  async function encryptStoredPassword(password) {
    const value = String(password || "");
    if (!value) return "";

    const key = await getPasswordCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(value),
    );
    return `${PASSWORD_CIPHER_PREFIX}${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
  }

  async function decryptStoredPassword(payload) {
    const encoded = String(payload || "").slice(PASSWORD_CIPHER_PREFIX.length);
    const [ivValue, encryptedValue] = encoded.split(".");
    if (!ivValue || !encryptedValue) throw new Error("Некорректный формат зашифрованного пароля");

    const key = await getPasswordCryptoKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ivValue) },
      key,
      base64ToBytes(encryptedValue),
    );
    return new TextDecoder().decode(decrypted);
  }

  async function getPasswordCryptoKey() {
    if (!globalThis.isSecureContext || !globalThis.crypto?.subtle || !globalThis.indexedDB) {
      throw new Error("Web Crypto недоступен");
    }

    const database = await openPasswordCryptoDatabase();
    try {
      const existingKey = await readPasswordCryptoKey(database);
      if (existingKey) return existingKey;

      const createdKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      await savePasswordCryptoKey(database, createdKey);
      return createdKey;
    } finally {
      database.close();
    }
  }

  function openPasswordCryptoDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(PASSWORD_CRYPTO_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(PASSWORD_CRYPTO_STORE)) {
          request.result.createObjectStore(PASSWORD_CRYPTO_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function readPasswordCryptoKey(database) {
    return new Promise((resolve, reject) => {
      const request = database.transaction(PASSWORD_CRYPTO_STORE, "readonly")
        .objectStore(PASSWORD_CRYPTO_STORE)
        .get(PASSWORD_CRYPTO_KEY_ID);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  function savePasswordCryptoKey(database, key) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PASSWORD_CRYPTO_STORE, "readwrite");
      transaction.objectStore(PASSWORD_CRYPTO_STORE).put(key, PASSWORD_CRYPTO_KEY_ID);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
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

  function getMissingSyncSettings({ needsFileId = false } = {}) {
    const missing = [];
    if (!state.syncSettings.googleClientId) {
      missing.push("OAuth Client ID");
    }
    if (needsFileId && !state.syncSettings.googleFileId) missing.push("ID файла Google Drive");
    return missing;
  }

  async function getGoogleAccessToken(scope) {
    if (!globalThis.google?.accounts?.oauth2) {
      throw new Error("Сервис авторизации Google ещё загружается. Повторите попытку через несколько секунд.");
    }
    return new Promise((resolve, reject) => {
      const tokenClient = globalThis.google.accounts.oauth2.initTokenClient({
        client_id: state.syncSettings.googleClientId,
        scope,
        login_hint: state.syncSettings.googleAccountEmail || undefined,
        callback: async (response) => {
          if (response?.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          await rememberGoogleAccount(response.access_token);
          resolve(response.access_token);
        },
      });
      tokenClient.requestAccessToken({ prompt: "" });
    });
  }

  async function rememberGoogleAccount(accessToken) {
    try {
      const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return;
      const payload = await response.json();
      const email = String(payload?.user?.emailAddress || "").trim();
      if (!email || email === state.syncSettings.googleAccountEmail) return;
      state.syncSettings.googleAccountEmail = email;
      await persistSyncSettings();
    } catch {
      // Account hint is optional and must not interrupt cloud actions.
    }
  }

  function consumeCloudConnectionSettings() {
    const url = new URL(location.href);
    const googleClientId = url.searchParams.get("mf_google_client") || "";
    const googleFileId = url.searchParams.get("mf_google_file") || "";
    if (!googleClientId || !googleFileId) return null;

    url.searchParams.delete("mf_google_client");
    url.searchParams.delete("mf_google_file");
    const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
    history.replaceState({}, document.title, cleanUrl);
    return { googleClientId, googleFileId };
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
    if (!googleClientId || !googleFileId) {
      setSyncStatus("В ссылке нет данных подключения MoneyFlow.");
      return;
    }

    state.syncSettings = sanitizeSyncSettings({
      ...state.syncSettings,
      googleClientId,
      googleFileId,
      accessMode: "unknown",
      googleAccountEmail: "",
    });
    await persistSyncSettings();
    renderSyncSettingsForm();
    updateCloudAccessUI();
    if (elements.readerLinkInput) elements.readerLinkInput.value = "";
    setSyncStatus("Подключение читателя сохранено. Нажмите «Синхронизировать».");
  }

  function getReaderConnectionLink() {
    const url = new URL(location.origin + location.pathname);
    url.searchParams.set("mf_google_client", state.syncSettings.googleClientId);
    url.searchParams.set("mf_google_file", state.syncSettings.googleFileId);
    return url.toString();
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
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Подключение MoneyFlow",
          text: "Откройте ссылку, затем нажмите «Синхронизировать» для подключения чтения данных MoneyFlow.",
          url: connectionLink,
        });
        setReaderConnectionStatus("Ссылка передана читателю.", "success");
        return;
      }
      await copyReaderConnectionLink(connectionLink);
      setReaderConnectionStatus("Ссылка скопирована в буфер обмена. Отправьте её читателю любым способом.", "success");
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

  function getCloudPayload() {
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      operations: state.operations,
      categories: state.categories,
    };
  }

  async function uploadToGoogleDrive() {
    setSyncStatus("Открываю вход Google и выгружаю полный файл...");
    try {
      const accessToken = await getGoogleAccessToken("https://www.googleapis.com/auth/drive.file");
      const payload = JSON.stringify(getCloudPayload());
      const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
      let response;
      if (state.syncSettings.googleFileId) {
        response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(state.syncSettings.googleFileId)}?uploadType=media`, {
          method: "PATCH",
          headers,
          body: payload,
        });
      } else {
        const boundary = `moneyflow-${getUuid()}`;
        response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: "moneyflow-data.json", mimeType: "application/json" })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--`,
        });
      }
      if (!response.ok) throw new Error(`Google Drive: ${response.status}`);
      const metadata = await response.json();
      if (!state.syncSettings.googleFileId && metadata?.id) {
        state.syncSettings.googleFileId = metadata.id;
        state.syncSettings.accessMode = "writer";
      }
      state.syncSettings.lastSuccessfulSyncAt = new Date().toISOString();
      await persistSyncSettings();
      renderSyncSettingsForm();
      updateCloudAccessUI();
      renderLastSuccessfulSync();
      setSyncStatus("Полный файл успешно выгружен в Google Drive.");
      showAppNotice("Данные успешно выгружены в облако.");
    } catch (error) {
      const message = `Выгрузка неуспешна: ${error?.message || "неизвестная ошибка"}`;
      setSyncStatus(message);
      showAppNotice(message, "error");
    }
  }

  async function downloadFromGoogleDrive({ skipReplaceConfirmation = false } = {}) {
    setSyncStatus("Открываю вход Google и загружаю файл...");
    try {
      const accessToken = await getGoogleAccessToken("https://www.googleapis.com/auth/drive.readonly");
      if (!state.syncSettings.googleFileId) {
        const query = encodeURIComponent("name = 'moneyflow-data.json' and trashed = false");
        const fileListResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!fileListResponse.ok) throw new Error(`Google Drive: ${fileListResponse.status}`);
        const fileList = await fileListResponse.json();
        const cloudFile = fileList?.files?.[0];
        if (!cloudFile?.id) {
          throw new Error("Файл MoneyFlow не найден. Сначала выгрузите данные в облако.");
        }
        state.syncSettings.googleFileId = cloudFile.id;
        state.syncSettings.accessMode = "unknown";
        await persistSyncSettings();
        renderSyncSettingsForm();
        updateCloudAccessUI();
      }
      if (!skipReplaceConfirmation && (state.operations.length || state.categories.length) && !window.confirm("Загрузка из облака полностью заменит локальные операции и категории. Продолжить?")) {
        return;
      }
      const permissionResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(state.syncSettings.googleFileId)}?fields=capabilities(canEdit)`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!permissionResponse.ok) {
        throw new Error(permissionResponse.status === 404
          ? "Нет доступа к файлу. Войдите под Gmail, которому редактор выдал доступ."
          : `Google Drive: ${permissionResponse.status}`);
      }
      const permissions = await permissionResponse.json();
      state.syncSettings.accessMode = permissions?.capabilities?.canEdit ? "writer" : "reader";
      await persistSyncSettings();
      updateCloudAccessUI();
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(state.syncSettings.googleFileId)}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(response.status === 404
          ? "Нет доступа к данным. Войдите под Gmail, которому редактор выдал доступ."
          : `Google Drive: ${response.status}`);
      }
      const payload = await response.json();
      if (!Array.isArray(payload?.operations) || !Array.isArray(payload?.categories)) {
        throw new Error("Файл не похож на данные MoneyFlow");
      }
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
      setSyncStatus("Данные из облака загружены. Локальные операции и категории заменены.");
    } catch (error) {
      setSyncStatus(`Загрузка неуспешна: ${error?.message || "неизвестная ошибка"}`);
    }
  }

  function getCategoryName(categoryId) {
    return state.categories.find((category) => category.id === categoryId)?.name || "Без категории";
  }

  function getCategoryById(categoryId) {
    return state.categories.find((category) => category.id === categoryId) || null;
  }

  function loadMoreOperations() {
    const yearFiltered = getOperationsByYear(enrichOperationsWithBalance(state.operations));
    const visible = getFilteredOperations(yearFiltered);
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

  function getAllCategoriesSorted() {
    return [...state.categories].sort((a, b) =>
      normalizeTextForSearch(a.name).localeCompare(normalizeTextForSearch(b.name), "ru")
    );
  }

  function findCategoryByNormalizedName(normalizedName) {
    const target = normalizeTextForSearch(normalizedName);
    if (!target) return null;
    return state.categories.find((category) => normalizeTextForSearch(category.name) === target);
  }

  function getMatchedCategories(categories, normalizedQuery) {
    const normalized = normalizeTextForSearch(normalizedQuery);
    const all = getAllCategoriesSortedFrom(categories);

    if (!normalized) {
      return all;
    }

    const ranked = all
      .map((category) => ({
        category,
        score: getCategorySearchScore(normalizeTextForSearch(category.name), normalized),
      }))
      .filter((entry) => entry.score >= CATEGORY_SEARCH_SIMILARITY_THRESHOLD)
      .sort((left, right) => {
        if (right.score === left.score) {
          return normalizeTextForSearch(left.category.name).localeCompare(normalizeTextForSearch(right.category.name), "ru");
        }
        return right.score - left.score;
      });

    return ranked.map((entry) => entry.category);
  }

  function getAllCategoriesSortedFrom(categories) {
    return [...categories].sort((a, b) =>
      normalizeTextForSearch(a.name).localeCompare(normalizeTextForSearch(b.name), "ru"),
    );
  }

  function getCategorySearchScore(categoryName, normalizedQuery) {
    if (!normalizedQuery) return 1;
    if (!categoryName) return 0;

    if (categoryName === normalizedQuery) return 1.1;
    if (categoryName.startsWith(normalizedQuery)) return 1.0;
    if (categoryName.includes(` ${normalizedQuery}`) || categoryName.includes(normalizedQuery)) return 0.95;

    const queryWords = normalizedQuery.split(" ").filter(Boolean);
    const nameWords = categoryName.split(" ").filter(Boolean);
    if (queryWords.length > 1) {
      const allWordsFound = queryWords.every((word) =>
        nameWords.some((nameWord) => nameWord.includes(word)),
      );
      if (allWordsFound) return 0.9;
    }

    if (normalizedQuery.length <= 3 && categoryName.includes(normalizedQuery[0])) {
      return 0.7;
    }

    const distance = getLevenshteinDistance(categoryName, normalizedQuery);
    const maxLen = Math.max(categoryName.length, normalizedQuery.length);
    if (!maxLen) return 0;

    return 1 - distance / maxLen;
  }

  function getLevenshteinDistance(left, right) {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const dp = new Array(rows);
    for (let i = 0; i < rows; i += 1) {
      dp[i] = new Array(cols);
    }
    for (let i = 0; i < rows; i += 1) dp[i][0] = i;
    for (let j = 0; j < cols; j += 1) dp[0][j] = j;

    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        if (left[i - 1] === right[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + 1,
          );
        }
      }
    }

    return dp[left.length][right.length];
  }

  function mergeOperations(localOperations, remoteOperations) {
    const seen = new Map();
    const result = [];

    for (const operation of localOperations) {
      if (!operation || !operation.id) continue;
      if (!seen.has(operation.id)) {
        seen.set(operation.id, true);
        result.push(operation);
      }
    }

    for (const operation of remoteOperations) {
      if (!operation || !operation.id || seen.has(operation.id)) continue;
      if (!isOperationValid(operation)) continue;
      seen.set(operation.id, true);
      result.push(operation);
    }

    return result.sort((a, b) => compareOperationsChronologicalAscending(a, b));
  }

  function isOperationValid(operation) {
    return (
      ["income", "expense"].includes(operation.type) &&
      Number.isFinite(Number(operation.amount)) &&
      operation.categoryId &&
      operation.operationDate &&
      operation.id
    );
  }

  function mergeCategories(localCategories, remoteCategories) {
    const seen = new Map();

    for (const category of localCategories) {
      if (!category?.id || !category?.name) continue;
      const normalized = normalizeTextForSearch(category.name);
      const existing = seen.get(normalized);
      if (!existing || existing.id !== category.id) {
        seen.set(normalized, category);
      }
    }

    for (const category of remoteCategories) {
      if (!category?.id || !category?.name) continue;
      const normalized = normalizeTextForSearch(category.name);
      if (seen.has(normalized)) continue;

      seen.set(normalized, {
        id: category.id,
        name: String(category.name || "").trim(),
        mode: "both",
        color: normalizeHexColor(category.color || "#64748b"),
      });
    }

    return [...seen.values()].filter(Boolean);
  }

  function addCategory(name, color) {
    const trimName = String(name || "").trim();
    if (!trimName) return null;

    const normalizedName = normalizeTextForSearch(trimName);
    const existing = findCategoryByNormalizedName(normalizedName);
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
    return category;
  }

  function getRandomCategoryColor() {
    const usedColors = new Set(state.categories.map((category) => normalizeHexColor(category.color)));
    const availableColors = CATEGORY_COLORS.filter((color) => !usedColors.has(color));
    const palette = availableColors.length ? availableColors : CATEGORY_COLORS;
    const randomIndex = Math.floor(Math.random() * palette.length);
    return palette[randomIndex];
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

  function signedAmount(operation) {
    if (operation.type === "income") return Math.abs(operation.amount);
    if (operation.type === "expense") return -Math.abs(operation.amount);
    return 0;
  }

  function formatMoney(value) {
    const v = Number(value) || 0;
    return v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  }

  function normalizeTextForSearch(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function normalizeAmountForSearch(text) {
    return normalizeTextForSearch(text).replace(/\s/g, "").replace(/,/g, ".");
  }

  function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function getUuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `op-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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
