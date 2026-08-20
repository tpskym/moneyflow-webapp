(() => {
  const STORAGE_KEYS = {
    operations: "moneyflow-operations-v1",
    categories: "moneyflow-categories-v1",
    syncSettings: "moneyflow-sync-settings-v1",
  };

  const DEFAULT_CATEGORIES = [];

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
    categoryPickerPrevBtn: document.getElementById("category-picker-prev"),
    categoryPickerNextBtn: document.getElementById("category-picker-next"),
    categoryPickerPageInfo: document.getElementById("category-picker-page-info"),
    amountInput: document.getElementById("operation-amount"),
    descriptionInput: document.getElementById("operation-description"),
    operationDateInput: document.getElementById("operation-date"),
    balanceCurrent: document.getElementById("balance-current"),
    searchInput: document.getElementById("search-input"),
    operationsList: document.getElementById("operations-list"),
    chipContainer: document.querySelector(".chips"),
    balanceTitle: document.getElementById("balance-title"),
    prevPageBtn: document.getElementById("prev-page"),
    nextPageBtn: document.getElementById("next-page"),
    pageInfo: document.getElementById("page-info"),
    yearFilterContainer: document.getElementById("year-filters"),
    syncToggleButton: document.getElementById("sync-settings-toggle"),
    syncSettingsCard: document.getElementById("sync-settings-section"),
    syncWebDavPathInput: document.getElementById("webdav-path"),
    syncUsernameInput: document.getElementById("webdav-username"),
    syncPasswordInput: document.getElementById("webdav-password"),
    syncSaveButton: document.getElementById("webdav-save"),
    syncNowTopButton: document.getElementById("webdav-sync-top"),
    syncStatus: document.getElementById("webdav-status"),
    clearDataButton: document.getElementById("webdav-clear-data"),
    quickAddToggleButton: document.getElementById("quick-add-toggle"),
    quickAddCard: document.getElementById("quick-add-card"),
    quickAddTitle: document.getElementById("quick-add-title"),
    operationSubmitButton: document.getElementById("operation-submit"),
  };

  const state = {
    operations: [],
    categories: [...DEFAULT_CATEGORIES],
    syncSettings: {
      webdavPath: "",
      username: "",
      password: "",
      lastSyncedAt: "",
    },
    searchText: "",
    activeTypeFilter: "all",
    activeYearFilter: new Set(),
    operationType: "income",
    currentPage: 1,
    pageSize: 20,
    categorySearchText: "",
    categoryCurrentPage: 1,
    quickAddMode: "add",
    quickAddSourceOperationId: "",
  };

  let searchDebounce;
  let categoryPickerDebounce;
  let operationLongPressTimer;
  let longPressHandledOperationId = null;

  function main() {
    enableLiveReload();
    const persistedOperations = readJson(STORAGE_KEYS.operations, []);
    state.operations = sanitizeOperations(persistedOperations);
    state.categories = sanitizeCategories(readJson(STORAGE_KEYS.categories, DEFAULT_CATEGORIES));
    state.syncSettings = sanitizeSyncSettings(readJson(STORAGE_KEYS.syncSettings, state.syncSettings));

    renderSyncSettingsForm();
    syncApplyTypeFromState();
    updateSyncSettingsVisibility(false);
    updateQuickAddVisibility(false);
    setQuickAddDate(getTodayInputDate());
    renderCategoryOptions();
    renderYearFilters();
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
    if (elements.typeToggle) {
      elements.typeToggle.addEventListener("click", onTypeToggleClick);
    }
    elements.categoryPickerInput.addEventListener("focus", openCategoryPicker);
    elements.categoryPickerInput.addEventListener("click", openCategoryPicker);
    elements.categoryPickerInput.addEventListener("keydown", onCategoryInputKeydown);
    elements.categoryPickerInput.addEventListener("input", onCategoryInputChange);
    elements.categoryPickerToggle.addEventListener("click", toggleCategoryPicker);
    elements.categoryPickerPrevBtn.addEventListener("click", () => goCategoryPage(-1));
    elements.categoryPickerNextBtn.addEventListener("click", () => goCategoryPage(1));
    elements.categoryPickerList.addEventListener("click", onCategoryPickerSelect);
    elements.searchInput.addEventListener("input", onSearchInput);
    elements.yearFilterContainer?.addEventListener("click", onYearFilterClick);
    elements.prevPageBtn.addEventListener("click", () => goPage(-1));
    elements.nextPageBtn.addEventListener("click", () => goPage(1));
    elements.syncSaveButton?.addEventListener("click", onSyncSave);
    elements.clearDataButton?.addEventListener("click", onClearLocalData);
    elements.syncNowTopButton?.addEventListener("click", onSyncNow);
    elements.syncToggleButton?.addEventListener("click", onSyncToggle);
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

  function onTypeToggleClick(event) {
    const button = event.target.closest("[data-type]");
    if (!button) return;

    state.operationType = button.dataset.type;
    syncApplyTypeFromState();
  }

  function onSyncToggle() {
    const shouldOpen = Boolean(elements.syncSettingsCard?.hidden);
    updateSyncSettingsVisibility(shouldOpen);
  }

  function onQuickAddToggle() {
    const shouldOpen = Boolean(elements.quickAddCard?.hidden);
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
      elements.amountInput?.focus();
      if (elements.form) {
        elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  function onSyncSave({ close = true } = {}) {
    const previousLastSyncedAt = state.syncSettings.lastSyncedAt || "";
    state.syncSettings = sanitizeSyncSettings({
      webdavPath: elements.syncWebDavPathInput?.value || "",
      username: elements.syncUsernameInput?.value || "",
      password: elements.syncPasswordInput?.value || "",
      lastSyncedAt: previousLastSyncedAt,
    });
    writeJson(STORAGE_KEYS.syncSettings, state.syncSettings);
    setSyncStatus("Настройки сохранены.");
    if (close) {
      updateSyncSettingsVisibility(false);
    }
  }

  function onClearLocalData() {
    const confirmed = window.confirm("Удалить все локальные операции, категории и сбросить дату последней синхронизации?");
    if (!confirmed) return;

    state.operations = [];
    state.categories = [];
    state.syncSettings.lastSyncedAt = "";
    state.searchText = "";
    state.activeTypeFilter = "all";
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
    writeJson(STORAGE_KEYS.syncSettings, state.syncSettings);

    if (elements.form) {
      elements.form.reset();
    }
    if (elements.quickAddCard && !elements.quickAddCard.hidden) {
      resetQuickAddFormToDefaults();
    }
    setQuickAddDate(getTodayInputDate());
    render();
    renderCategoryOptions();
    setSyncStatus("Локальные операции, категории и дата синхронизации очищены.");
    updateSyncSettingsVisibility(false);
  }

  function onSyncNow() {
    onSyncSave({ close: false });
    syncNowWithWebDav();
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

    const operationFromForm = getOperationFromForm();
    if (!operationFromForm) return;

    const operationsToAdd = [];
    operationsToAdd.push(operationFromForm);

    if (state.quickAddMode === "edit" && state.quickAddSourceOperationId) {
      const sourceOperation = state.operations.find((item) => item.id === state.quickAddSourceOperationId);
      if (sourceOperation) {
        const inverseSource = createOppositeOperation(sourceOperation);
        operationsToAdd.push(inverseSource);
      }
    }

    for (const operation of operationsToAdd) {
      state.operations.push(operation);
    }
    writeJson(STORAGE_KEYS.operations, state.operations);

    resetQuickAddFormToDefaults();
    setQuickAddDate(getTodayInputDate());
    setQuickAddMode("add");
    syncApplyTypeFromState();
    renderCategoryOptions();
    state.currentPage = 1;
    render();
    elements.searchInput.focus();
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
        addInverseOperation(operation);
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

    updateQuickAddVisibility(true);
    closeCategoryPicker();
    const mode = options.mode || "add";
    const sourceOperationId = options.sourceOperationId || "";
    setQuickAddMode(mode, sourceOperationId);
    state.operationType = operation.type || "income";
    syncApplyTypeFromState();

    elements.amountInput.value = String(round2(Number(operation.amount) || 0));
    setOperationCategoryForQuickAdd(operation.categoryId, operation.categoryName);
    elements.descriptionInput.value = operation.description || "";
    setQuickAddDate(normalizeDateForInput(options.date || getOperationDateValue(operation)));
    if (elements.form) {
      elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (state.quickAddMode === "view") {
      return;
    }

    elements.amountInput.focus();
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
      elements.operationSubmitButton.textContent = normalizedMode === "edit" ? "Сохранить изменения" : "Добавить операцию";
    }

    const readOnlyInputs = [
      elements.amountInput,
      elements.operationDateInput,
      elements.categoryPickerInput,
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
    const rawAmount = elements.amountInput.value.trim();
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      elements.amountInput.focus();
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
      createdAt: "",
      type: selectedType,
      amount: round2(amount),
      categoryId: selectedCategory,
      description,
    };
  }

  function addInverseOperation(operation) {
    const inverseOperation = createOppositeOperation(operation);
    if (!inverseOperation) return;

    state.operations.push(inverseOperation);
    writeJson(STORAGE_KEYS.operations, state.operations);
    state.currentPage = 1;
    render();
  }

  function createOppositeOperation(operation) {
    if (!operation) return null;
    const oppositeType = getOppositeType(operation.type);
    if (!["income", "expense"].includes(oppositeType)) return null;

    return {
      id: getUuid(),
      operationDate: getOperationDateValue(operation),
      createdAt: "",
      type: oppositeType,
      amount: round2(Math.abs(Number(operation.amount) || 0)),
      categoryId: operation.categoryId,
      description: operation.description || "",
    };
  }

  function getOppositeType(type) {
    if (type === "income") return "expense";
    if (type === "expense") return "income";
    return "";
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
    const leftCreated = parseDateFromValue(left?.createdAt).getTime();
    const rightCreated = parseDateFromValue(right?.createdAt).getTime();
    return leftCreated - rightCreated;
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

    const start = (state.currentPage - 1) * state.pageSize;
    const pageItems = visibleOperations.slice(start, start + state.pageSize);
    const allBalance = enrichedOps.reduce((sum, operation) => sum + signedAmount(operation), 0);

    updateBalances(allBalance);
    renderYearFilters();
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

    const visibleByCancel = getRenderableOperations(filteredByQuery);
    if (state.activeTypeFilter === "all") {
      return visibleByCancel;
    }

    return visibleByCancel.filter((operation) => operation.type === state.activeTypeFilter);
  }

  function getRenderableOperations(operations) {
    if (!Array.isArray(operations) || operations.length === 0) return [];

    const totalByKey = new Map();
    for (const operation of operations) {
      if (!["income", "expense"].includes(operation.type)) continue;
      const key = getCancellationKey(operation);
      const state = totalByKey.get(key) || { income: new Map(), expense: new Map() };
      const amount = round2(Math.abs(Number(operation.amount) || 0));
      const amountKey = formatAmountForCancellation(amount);
      if (operation.type === "income") {
        const entries = state.income.get(amountKey) || [];
        entries.push(operation.id);
        state.income.set(amountKey, entries);
      } else if (operation.type === "expense") {
        const entries = state.expense.get(amountKey) || [];
        entries.push(operation.id);
        state.expense.set(amountKey, entries);
      }
      totalByKey.set(key, state);
    }

    const cancelledIds = new Set();
    for (const bucket of totalByKey.values()) {
      for (const [amountKey, incomeIds] of bucket.income) {
        const expenseIds = bucket.expense.get(amountKey) || [];
        const pairsToCancel = Math.min(incomeIds.length, expenseIds.length);
        if (pairsToCancel <= 0) continue;

        for (let i = 0; i < pairsToCancel; i += 1) {
          cancelledIds.add(incomeIds[i]);
          cancelledIds.add(expenseIds[i]);
        }
      }
    }

    return operations.filter((operation) => !cancelledIds.has(operation.id));
  }

  function getCancellationKey(operation) {
    const dateValue = parseDateToDateOnlyString(getOperationDateValue(operation));
    const day = dateValue || "invalid";
    const category = operation.categoryId || "";
    const description = normalizeTextForSearch(operation.description || "");
    return `${day}__${category}__${description}`;
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
  }

  function updateQuickAddVisibility(open) {
    if (!elements.quickAddCard || !elements.quickAddToggleButton) return;

    elements.quickAddCard.hidden = !open;
    const label = open ? "Скрыть быстрое добавление" : "Открыть быстрое добавление";
    elements.quickAddToggleButton.setAttribute("aria-label", label);
    elements.quickAddToggleButton.setAttribute("title", label);
    elements.quickAddToggleButton.classList.toggle("is-open", open);
  }

  function updatePager(totalItems, totalPages) {
    if (totalItems === 0) {
      elements.pageInfo.textContent = "Стр. 0 / 0";
      elements.prevPageBtn.disabled = true;
      elements.nextPageBtn.disabled = true;
      return;
    }
    elements.pageInfo.textContent = `Стр. ${state.currentPage} / ${totalPages}`;
    elements.prevPageBtn.disabled = state.currentPage <= 1;
    elements.nextPageBtn.disabled = state.currentPage >= totalPages;
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
      const sign = operation.type === "expense" ? -1 : 1;
      const signChar = operation.type === "income" ? "+" : "-";
      const visibleAmount = sign * Math.abs(operation.amount);
      const category = operation.categoryName || "Без категории";
      const description = operation.description || "";
      const menuActionLabel = `Действия для операции "${escapeHtml(category)}"`;

      if (dayLabel !== lastDay) {
        rows.push(`<div class="operation-day">${escapeHtml(dayLabel)}</div>`);
        lastDay = dayLabel;
      }

      rows.push(`
        <article class="operation" data-operation-id="${escapeHtml(operation.id)}">
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
          <div class="operation-title">
            <div class="operation-category"><strong>${escapeHtml(category)}</strong></div>
            ${description ? `<div class="operation-description">${escapeHtml(description)}</div>` : ""}
          </div>
          <div class="operation-meta">
            <span>Остаток: ${formatMoney(operation.balanceAfter)} ₽</span>
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
    const result = getCategoryPickerSlice();
    const searchValue = (state.categorySearchText || "").trim();
    const normalizedSearchValue = normalizeTextForSearch(searchValue);
    const hasExactCategoryMatch = !!(searchValue && findCategoryByNormalizedName(normalizedSearchValue));
    const addCategoryOption = searchValue && !hasExactCategoryMatch
      ? `
        <button type="button" class="category-picker-option category-picker-option--add" data-action="add-category">
          <span class="category-picker-add-mark">+</span>
          <span>Добавить категорию «${escapeHtml(searchValue)}»</span>
        </button>
      `
      : "";

    if (!result.totalItems) {
      if (!searchValue) {
        elements.categoryPickerList.innerHTML = `<div class="empty">Категории не найдены</div>`;
      } else if (addCategoryOption) {
        elements.categoryPickerList.innerHTML = addCategoryOption;
      } else {
        elements.categoryPickerList.innerHTML = `<div class="empty">Категории не найдены</div>`;
      }
      updateCategoryPickerPager(result.totalItems, result.totalPages);
      return;
    }

    const items = result.pageItems
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
    elements.categoryPickerList.innerHTML = `${addCategoryOption}${items}`;
    updateCategoryPickerPager(result.totalItems, result.totalPages);
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
      webdavPath: String((settings && settings.webdavPath) || "").trim(),
      username: String((settings && settings.username) || "").trim(),
      password: String((settings && settings.password) || "").trim(),
      lastSyncedAt: String((settings && settings.lastSyncedAt) || "").trim(),
    };
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
    if (!elements.syncWebDavPathInput || !elements.syncUsernameInput || !elements.syncPasswordInput) return;

    elements.syncWebDavPathInput.value = state.syncSettings.webdavPath;
    elements.syncUsernameInput.value = state.syncSettings.username;
    elements.syncPasswordInput.value = state.syncSettings.password;
  }

  function setSyncStatus(message) {
    if (!elements.syncStatus) return;
    elements.syncStatus.textContent = message || "";
  }

  function getMissingSyncSettings() {
    const missing = [];
    if (!state.syncSettings.webdavPath) {
      missing.push("путь к файлу");
    }
    if (!state.syncSettings.username) {
      missing.push("логин");
    }
    if (!state.syncSettings.password) {
      missing.push("пароль");
    }
    return missing;
  }

  async function syncNowWithWebDav() {
    const missingSyncSettings = getMissingSyncSettings();
    if (missingSyncSettings.length > 0) {
      setSyncStatus(`Синхронизация не выполнена: не указаны настройки (${missingSyncSettings.join(", ")}).`);
      return;
    }

    const syncStartedAt = new Date();

    const encodedAuth = `${state.syncSettings.username || ""}:${state.syncSettings.password || ""}`;
    const headers = {
      "Content-Type": "application/json",
    };
    if (encodedAuth.trim()) {
      headers.Authorization = `Basic ${btoa(unescape(encodeURIComponent(encodedAuth)))}`;
    }

    setSyncStatus("Синхронизация...");
    try {
      const preparedLocalOperations = prepareOperationsForSync(state.operations, syncStartedAt);
      if (preparedLocalOperations.changed) {
        state.operations = preparedLocalOperations.operations;
        writeJson(STORAGE_KEYS.operations, state.operations);
      }

      const localPayload = {
        version: 1,
        operations: state.operations,
        categories: state.categories,
        lastSyncedAt: state.syncSettings.lastSyncedAt,
      };

      let remotePayload = null;
      try {
        const response = await fetch(state.syncSettings.webdavPath, {
          method: "GET",
          headers,
        });
        if (response.ok) {
          remotePayload = await response.json();
        } else if (response.status >= 400 && response.status !== 404) {
          throw new Error(`Чтение удаленного файла: ${response.status} ${response.statusText}`);
        }
      } catch {
        remotePayload = null;
      }

      const remoteOps = Array.isArray(remotePayload?.operations) ? remotePayload.operations : [];
      const parsedRemoteSince = state.syncSettings.lastSyncedAt ? Date.parse(state.syncSettings.lastSyncedAt) : NaN;
      const remoteSince = Number.isFinite(parsedRemoteSince) ? parsedRemoteSince : 0;
      let remoteCursor = 0;
      const remoteNewOps = remoteOps
        .map((operation) => sanitizeOperations([operation])[0])
        .filter(Boolean)
        .map((operation) => prepareRemoteOperationForSync(operation, syncStartedAt, remoteCursor++))
        .filter((operation) => {
          if (!remoteSince) return true;
          const operationCreated = Date.parse(operation?.createdAt);
          if (!Number.isFinite(operationCreated)) return false;
          return operationCreated > remoteSince;
        });
      const remoteCategories = Array.isArray(remotePayload?.categories) ? remotePayload?.categories : [];

      const mergedCategories = mergeCategories([...state.categories], remoteCategories);
      const mergedOperations = mergeOperations([...state.operations], remoteNewOps);

      const mergedPayload = {
        ...localPayload,
        operations: mergedOperations,
        categories: mergedCategories,
        lastSyncedAt: new Date().toISOString(),
      };

      const saveResponse = await fetch(state.syncSettings.webdavPath, {
        method: "PUT",
        headers,
        body: JSON.stringify(mergedPayload),
      });

      if (!saveResponse.ok) {
        throw new Error(`Ошибка записи: ${saveResponse.status}`);
      }

      state.syncSettings.lastSyncedAt = mergedPayload.lastSyncedAt;
      state.categories = mergedCategories;
      state.operations = mergedOperations;
      writeJson(STORAGE_KEYS.categories, state.categories);
      writeJson(STORAGE_KEYS.operations, state.operations);
      writeJson(STORAGE_KEYS.syncSettings, state.syncSettings);
      renderCategoryOptions();
      state.currentPage = 1;
      render();
      setSyncStatus("Синхронизация успешно выполнена.");
    } catch (error) {
      setSyncStatus(`Синхронизация неуспешна: ${error?.message || "неизвестная ошибка"}`);
    }
  }

  function getCategoryName(categoryId) {
    return state.categories.find((category) => category.id === categoryId)?.name || "Без категории";
  }

  function getCategoryById(categoryId) {
    return state.categories.find((category) => category.id === categoryId) || null;
  }

  function goPage(delta) {
    const yearFiltered = getOperationsByYear(enrichOperationsWithBalance(state.operations));
    const visible = getFilteredOperations(yearFiltered);
    const totalPages = Math.ceil(visible.length / state.pageSize) || 0;
    if (totalPages <= 1) return;

    state.currentPage = Math.min(Math.max(1, state.currentPage + delta), totalPages);
    render();
  }

  function onCategoryPickerSelect(event) {
    const button = event.target.closest("[data-category-id], [data-action]");
    if (!button) return;

    if (button.dataset.action === "add-category") {
      addCategoryFromPickerSearch();
      return;
    }

    const categoryId = button.getAttribute("data-category-id");
    if (!categoryId) return;
    setCategorySelection(categoryId);
    closeCategoryPicker();
  }

  function onOutsideCategoryPickerClick(event) {
    if (!state.categories.length || !elements.categoryPickerPopover || !elements.categoryPicker) return;
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
    state.categorySearchText = (elements.categoryPickerInput ? elements.categoryPickerInput.value : "").trim();
    state.categoryCurrentPage = 1;
    renderCategoryOptions();
    elements.categoryPickerInput.focus();
  }

  function closeCategoryPicker() {
    if (!elements.categoryPickerPopover) return;
    elements.categoryPickerPopover.hidden = true;
  }

  function goCategoryPage(delta) {
    const totalPages = getCategoryPickerTotalPages();
    if (totalPages <= 1) return;

    state.categoryCurrentPage = Math.min(Math.max(1, state.categoryCurrentPage + delta), totalPages);
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
    const start = (state.categoryCurrentPage - 1) * CATEGORY_PAGE_SIZE;
    return {
      totalItems,
      totalPages,
      pageItems: filtered.slice(start, start + CATEGORY_PAGE_SIZE),
    };
  }

  function getCategoryPickerTotalPages() {
    return Math.max(Math.ceil(getCategoryPickerSlice().totalItems / CATEGORY_PAGE_SIZE), 0);
  }

  function updateCategoryPickerPager(totalItems, totalPages) {
    if (totalItems === 0) {
      elements.categoryPickerPageInfo.textContent = "Стр. 0 / 0";
      elements.categoryPickerPrevBtn.disabled = true;
      elements.categoryPickerNextBtn.disabled = true;
      return;
    }
    elements.categoryPickerPageInfo.textContent = `Стр. ${state.categoryCurrentPage} / ${totalPages}`;
    elements.categoryPickerPrevBtn.disabled = state.categoryCurrentPage <= 1;
    elements.categoryPickerNextBtn.disabled = state.categoryCurrentPage >= totalPages;
  }

  function setCategorySelection(categoryId) {
    if (!elements.categorySelect || !elements.categoryPickerInput) return;

    const category = state.categories.find((item) => item.id === categoryId);
    if (!category) return;

    elements.categorySelect.value = category.id;
    elements.categoryPickerInput.value = category.name;
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
      color: normalizeHexColor(color || "#64748b"),
    };

    state.categories.push(category);
    writeJson(STORAGE_KEYS.categories, state.categories);
    return category;
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
