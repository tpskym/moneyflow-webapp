export function buildOperationDraft({ amountText, categoryId, description, operationDateText, type }, {
  createId,
  dateToDateOnlyString,
  normalizeDateForInput,
  now = () => new Date(),
  parseDateFromInput,
  round2,
} = {}) {
  const amount = Number(String(amountText || "").trim().replace(",", "."));
  const dateText = String(operationDateText || "").trim();
  if (!Number.isFinite(amount) || amount <= 0 || !categoryId || !/^\d{2}\.\d{2}\.\d{4}$/.test(dateText)) return null;
  const date = parseDateFromInput(dateText);
  if (!date || Number.isNaN(date.getTime()) || normalizeDateForInput(date) !== dateText) return null;
  const createdAt = now().toISOString();
  return {
    id: createId(), operationDate: dateToDateOnlyString(date), createdAt, localAddedAt: createdAt,
    type: type === "expense" ? "expense" : "income", amount: round2(amount), categoryId, description: String(description || "").trim(),
  };
}

export function createQuickAddController({
  state,
  elements,
  closeCategoryPicker,
  dateToDateOnlyString,
  ensureCategorySelection,
  getAllCategoriesSorted,
  getOperationDateValue,
  getTodayInputDate,
  getUuid,
  markPendingCloudChanges,
  normalizeDateForInput,
  onHideSyncSettings,
  openDatePicker,
  parseDateFromInput,
  parseDateFromValue,
  render,
  renderCategoryOptions,
  round2,
  setCategorySelection,
  setSyncStatus,
  writeAmountsHidden,
  writeOperations,
}) {
  function shouldHideAmount() {
    return state.amountsHidden && !["copy", "edit"].includes(state.quickAddMode);
  }
  function setAmount(value) {
    const rawValue = String(value || "");
    if (elements.amountInput) elements.amountInput.value = rawValue;
    if (elements.amountDisplay) elements.amountDisplay.textContent = shouldHideAmount() ? "•••••" : (rawValue ? rawValue.replace(".", ",") : "0");
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
  function applyAmountsVisibility() {
    document.body.classList.toggle("amounts-hidden", state.amountsHidden);
    updateAmountsVisibilityToggle();
    setAmount(elements.amountInput?.value || "");
  }
  function onAmountsVisibilityToggle() {
    state.amountsHidden = !state.amountsHidden;
    writeAmountsHidden(state.amountsHidden);
    applyAmountsVisibility();
  }
  function onAmountKeypadClick(event) {
    if (state.quickAddMode === "view") return;
    const button = event.target.closest("[data-amount-key], [data-amount-action]");
    if (!button || !elements.amountInput) return;
    const action = button.dataset.amountAction;
    const value = elements.amountInput.value || "";
    if (button.dataset.amountKey !== undefined && typeof navigator.vibrate === "function") navigator.vibrate(8);
    if (action === "clear") return setAmount("");
    if (action === "backspace") return setAmount(value.slice(0, -1));
    const key = button.dataset.amountKey;
    if (!key || !/^\d$|^\.$/.test(key)) return;
    if (key === ".") {
      if (!value.includes(".")) setAmount(value ? `${value}.` : "0.");
      return;
    }
    if (value.includes(".") && (value.split(".")[1] || "").length >= 2) return;
    setAmount(`${value}${key}`);
  }
  function applyType() {
    state.operationType = state.operationType === "expense" ? "expense" : "income";
    if (elements.typeInput) elements.typeInput.value = state.operationType;
    elements.typeToggle?.querySelectorAll("[data-type]").forEach((chip) => chip.classList.toggle("active", chip.dataset.type === state.operationType));
  }
  function updateVisibility(open) {
    if (!elements.quickAddCard || !elements.quickAddToggleButton) return;
    elements.quickAddCard.hidden = !open;
    const label = open ? "Скрыть быстрое добавление" : "Открыть быстрое добавление";
    elements.quickAddToggleButton.setAttribute("aria-label", label);
    elements.quickAddToggleButton.setAttribute("title", label);
    elements.quickAddToggleButton.classList.toggle("is-open", open);
  }
  function setMode(mode, sourceOperationId = "") {
    const normalized = ["edit", "copy", "view"].includes(mode) ? mode : "add";
    state.quickAddMode = normalized;
    state.quickAddSourceOperationId = normalized === "edit" ? sourceOperationId : "";
    const isView = normalized === "view";
    const titles = { add: "Быстрое добавление", edit: "Изменение", copy: "Копирование", view: "Просмотр" };
    if (elements.quickAddTitle) elements.quickAddTitle.textContent = titles[normalized];
    if (elements.operationSubmitButton) {
      elements.operationSubmitButton.hidden = isView;
      elements.operationSubmitButton.textContent = normalized === "edit" ? "Сохранить изменения" : "Добавить";
    }
    if (elements.quickAddDismissButton) elements.quickAddDismissButton.textContent = isView ? "Закрыть" : "Отменить";
    [elements.operationDateInput, elements.descriptionInput].forEach((input) => { if (input) input.readOnly = isView; });
    if (elements.operationDatePickerInput) elements.operationDatePickerInput.disabled = isView;
    if (elements.categoryPickerToggle) elements.categoryPickerToggle.disabled = isView;
    if (elements.categoryPickerInput) elements.categoryPickerInput.readOnly = isView || !state.categorySearchEditing;
    if (elements.amountKeypad) {
      elements.amountKeypad.hidden = isView;
      elements.amountKeypad.querySelectorAll("button").forEach((button) => { button.disabled = isView; });
    }
    elements.popularCategories?.querySelectorAll("button").forEach((button) => { button.disabled = isView; });
    elements.typeToggle?.querySelectorAll("[data-type]").forEach((chip) => { chip.disabled = isView; });
    elements.form?.classList.toggle("is-readonly", isView);
  }
  function setDate(value) {
    const dateText = value || getTodayInputDate();
    if (elements.operationDateInput) elements.operationDateInput.value = dateText;
    if (elements.operationDateDisplay) elements.operationDateDisplay.textContent = dateText;
    const date = parseDateFromInput(dateText);
    if (elements.operationDatePickerInput) elements.operationDatePickerInput.value = Number.isNaN(date?.getTime()) ? "" : dateToDateOnlyString(date);
  }
  function reset() {
    if (!elements.form) return;
    elements.form.reset();
    setAmount("");
    elements.form.classList.remove("is-readonly");
    setMode("add");
    const selected = state.categories.find((category) => category.id === elements.categorySelect?.value) || getAllCategoriesSorted(state.categories)[0];
    if (selected) setCategorySelection(selected.id);
  }
  function setOperationCategory(categoryId, fallbackName) {
    const category = state.categories.find((item) => item.id === categoryId);
    if (!category) {
      elements.categorySelect.value = "";
      elements.categoryPickerInput.value = fallbackName || "";
      return;
    }
    setCategorySelection(category.id);
  }
  function getOperationFromForm() {
    const categoryId = ensureCategorySelection();
    if (!categoryId) return null;
    const draft = buildOperationDraft({
      amountText: elements.amountInput?.value, categoryId, description: elements.descriptionInput?.value,
      operationDateText: elements.operationDateInput?.value, type: state.operationType || elements.typeInput?.value,
    }, { createId: getUuid, dateToDateOnlyString, normalizeDateForInput, parseDateFromInput, round2 });
    if (!draft && !/^\d{2}\.\d{2}\.\d{4}$/.test(String(elements.operationDateInput?.value || ""))) elements.operationDateInput?.focus();
    return draft;
  }
  function onAddOperation(event) {
    event.preventDefault();
    if (state.quickAddMode === "view") return;
    if (state.syncSettings.accessMode !== "writer" && state.syncSettings.googleFileId) return setSyncStatus("На этом устройстве доступно только чтение.");
    const operation = getOperationFromForm();
    if (!operation) return;
    let persistedId = operation.id;
    if (state.quickAddMode === "edit" && state.quickAddSourceOperationId) {
      const index = state.operations.findIndex((item) => item.id === state.quickAddSourceOperationId);
      if (index >= 0) {
        const source = state.operations[index];
        state.operations[index] = { ...operation, id: source.id, createdAt: source.createdAt, localAddedAt: source.localAddedAt };
        persistedId = source.id;
      } else state.operations.push(operation);
    } else state.operations.push(operation);
    writeOperations(state.operations);
    markPendingCloudChanges([persistedId]);
    reset();
    setDate(getTodayInputDate());
    setMode("add");
    applyType();
    updateVisibility(false);
    renderCategoryOptions();
    state.currentPage = 1;
    render();
  }
  function dismiss() {
    closeCategoryPicker();
    reset();
    setDate(getTodayInputDate());
    applyType();
    updateVisibility(false);
  }
  function open(operation, options = {}) {
    if (!operation) return;
    onHideSyncSettings();
    updateVisibility(true);
    closeCategoryPicker();
    const mode = state.syncSettings.accessMode === "reader" ? "view" : (options.mode || "add");
    setMode(mode, options.sourceOperationId || "");
    state.operationType = operation.type || "income";
    applyType();
    setAmount(String(round2(Number(operation.amount) || 0)));
    setOperationCategory(operation.categoryId, operation.categoryName);
    elements.descriptionInput.value = operation.description || "";
    setDate(normalizeDateForInput(options.date || getOperationDateValue(operation)));
    elements.form?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function onDatePickerChange(event) {
    const value = event?.target?.value;
    if (!value) return;
    const date = parseDateFromValue(value);
    if (!Number.isNaN(date.getTime())) setDate(normalizeDateForInput(date));
  }
  function bind() {
    elements.form.addEventListener("submit", onAddOperation);
    elements.quickAddDismissButton?.addEventListener("click", dismiss);
    elements.amountKeypad?.addEventListener("click", onAmountKeypadClick);
    elements.amountsVisibilityToggleButton?.addEventListener("click", onAmountsVisibilityToggle);
    elements.operationDatePickerInput?.addEventListener("change", onDatePickerChange);
    elements.operationDatePickerInput?.addEventListener("input", onDatePickerChange);
    elements.operationDatePickerButton?.addEventListener("click", () => openDatePicker(elements.operationDatePickerInput));
  }
  return { applyAmountsVisibility, applyType, bind, dismiss, open, setAmount, setDate, setMode, updateVisibility };
}
