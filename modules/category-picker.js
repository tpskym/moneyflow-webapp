export function orderCategoriesForPicker(categories, operations, normalizeText) {
  const useCount = new Map();
  for (const operation of operations) {
    if (operation?.categoryId) useCount.set(operation.categoryId, (useCount.get(operation.categoryId) || 0) + 1);
  }
  const byName = (left, right) => normalizeText(left.name).localeCompare(normalizeText(right.name), "ru");
  const popular = categories
    .filter((category) => (useCount.get(category.id) || 0) > 0)
    .sort((left, right) => (useCount.get(right.id) || 0) - (useCount.get(left.id) || 0) || byName(left, right))
    .slice(0, 6);
  const popularIds = new Set(popular.map((category) => category.id));
  return [...popular, ...categories.filter((category) => !popularIds.has(category.id)).sort(byName)];
}

export function createCategoryPickerController({
  state,
  elements,
  categoryColors,
  createCategoryId,
  escapeHtml,
  findCategoryByNormalizedName,
  getMatchedCategories,
  markPendingCloudChanges,
  normalizeHexColor,
  normalizeText,
  pickCategoryColor,
  writeCategories,
}) {
  let searchDebounce;

  function getCategoryById(categoryId) {
    return state.categories.find((category) => category.id === categoryId) || null;
  }

  function getCategoriesForPicker() {
    return orderCategoriesForPicker(state.categories, state.operations, normalizeText);
  }

  function renderPopularCategories() {
    if (!elements.popularCategories) return;
    const popular = getCategoriesForPicker().slice(0, 6).filter((category) => state.operations.some((operation) => operation?.categoryId === category.id));
    elements.popularCategories.hidden = popular.length === 0;
    const disabled = state.quickAddMode === "view" ? " disabled" : "";
    elements.popularCategories.innerHTML = popular
      .map((category) => `<button type="button" class="chip popular-category" data-popular-category-id="${escapeHtml(category.id)}"${disabled}>${escapeHtml(category.name)}</button>`)
      .join("");
  }

  function renderOptions() {
    const searchText = state.categorySearchEditing ? normalizeText(state.categorySearchText) : "";
    const categories = searchText ? getMatchedCategories(state.categories, searchText) : getCategoriesForPicker();
    if (!categories.length) {
      elements.categoryPickerList.innerHTML = `<div class="empty">Категорий пока нет</div>`;
      renderPopularCategories();
      return;
    }
    elements.categoryPickerList.innerHTML = categories.map((category) => {
      const selected = category.id === elements.categorySelect.value;
      const color = `background:${category.color || "#64748b"}`;
      return `<button type="button" class="category-picker-option ${selected ? "selected" : ""}" data-category-id="${escapeHtml(category.id)}"><span class="category-dot" style="${color}"></span><span>${escapeHtml(category.name)}</span></button>`;
    }).join("");
    renderPopularCategories();
  }

  function setSelection(categoryId) {
    if (!elements.categorySelect || !elements.categoryPickerInput) return;
    const category = getCategoryById(categoryId);
    if (!category) return;
    state.categorySearchEditing = false;
    elements.categorySelect.value = category.id;
    elements.categoryPickerInput.value = category.name;
    elements.categoryPickerInput.readOnly = true;
  }

  function ensureSelection() {
    const selectedCategoryId = elements.categorySelect.value;
    if (!selectedCategoryId) {
      const normalizedInput = normalizeText(elements.categoryPickerInput.value);
      const exact = normalizedInput && state.categories.find((category) => normalizeText(category.name) === normalizedInput);
      if (exact) {
        setSelection(exact.id);
        return exact.id;
      }
      elements.categoryPickerInput.focus();
      return "";
    }
    if (!getCategoryById(selectedCategoryId)) {
      elements.categoryPickerInput.focus();
      return "";
    }
    return selectedCategoryId;
  }

  function addCategory(name, color) {
    const categoryName = String(name || "").trim();
    if (!categoryName) return null;
    const existing = findCategoryByNormalizedName(state.categories, normalizeText(categoryName));
    if (existing) {
      setSelection(existing.id);
      return existing;
    }
    const category = {
      id: createCategoryId(categoryName), name: categoryName, mode: "both",
      color: normalizeHexColor(color || pickCategoryColor(state.categories, categoryColors)),
    };
    state.categories.push(category);
    writeCategories(state.categories);
    markPendingCloudChanges();
    return category;
  }

  function closeCreator() {
    if (elements.categoryCreateForm) elements.categoryCreateForm.hidden = true;
    if (elements.categoryCreateNameInput) elements.categoryCreateNameInput.value = "";
  }

  function close() {
    if (!elements.categoryPickerPopover) return;
    elements.categoryPickerPopover.hidden = true;
    closeCreator();
    if (!state.categorySearchEditing) return;
    state.categorySearchEditing = false;
    state.categorySearchText = "";
    state.categoryCurrentPage = 1;
    elements.categoryPickerInput.readOnly = true;
    elements.categoryPickerInput.value = getCategoryById(elements.categorySelect?.value)?.name || "";
  }

  function open() {
    if (elements.form?.classList.contains("is-readonly") || !elements.categoryPickerPopover) return;
    elements.categoryPickerPopover.hidden = false;
    state.categorySearchText = state.categorySearchEditing ? (elements.categoryPickerInput?.value || "").trim() : "";
    state.categoryCurrentPage = 1;
    renderOptions();
    if (state.categorySearchEditing) elements.categoryPickerInput?.focus();
  }

  function toggle() {
    if (elements.categoryPickerPopover?.hidden) open();
    else close();
  }

  function startSearch() {
    if (state.quickAddMode === "view" || !elements.categoryPickerInput) return;
    state.categorySearchEditing = true;
    elements.categorySelect.value = "";
    elements.categoryPickerInput.readOnly = false;
    elements.categoryPickerInput.value = "";
    state.categorySearchText = "";
    state.categoryCurrentPage = 1;
    renderOptions();
    elements.categoryPickerInput.focus({ preventScroll: true });
  }

  function addFromSearch() {
    const category = addCategory(elements.categoryPickerInput.value);
    if (!category) return;
    setSelection(category.id);
    state.categorySearchText = "";
    state.categoryCurrentPage = 1;
    renderOptions();
    close();
  }

  function onInputChange(event) {
    if (elements.form?.classList.contains("is-readonly")) return;
    const value = (event?.target?.value ?? elements.categoryPickerInput.value ?? "").trim();
    if (!value) {
      clearTimeout(searchDebounce);
      elements.categorySelect.value = "";
      state.categorySearchText = "";
      state.categoryCurrentPage = 1;
      renderOptions();
      return;
    }
    const selected = getCategoryById(elements.categorySelect.value);
    if (!selected || normalizeText(selected.name) !== normalizeText(value)) elements.categorySelect.value = "";
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      if (normalizeText(elements.categoryPickerInput?.value || "") !== normalizeText(value)) return;
      state.categorySearchText = value;
      state.categoryCurrentPage = 1;
      renderOptions();
    }, 220);
  }

  function onInputKeydown(event) {
    if (elements.form?.classList.contains("is-readonly") || event.key !== "Enter") return;
    event.preventDefault();
    if (!getMatchedCategories(state.categories, normalizeText(elements.categoryPickerInput.value)).length) addFromSearch();
  }

  function onSelect(event) {
    const button = event.target.closest("[data-category-id], [data-action]");
    if (!button) return;
    if (button.dataset.action === "add-category") return addFromSearch();
    if (button.dataset.action === "start-category-search") return startSearch();
    const categoryId = button.getAttribute("data-category-id");
    if (categoryId) {
      setSelection(categoryId);
      close();
    }
  }

  function onCreate() {
    const category = addCategory(elements.categoryCreateNameInput?.value);
    if (!category) return elements.categoryCreateNameInput?.focus({ preventScroll: true });
    setSelection(category.id);
    closeCreator();
    renderOptions();
    close();
  }

  function onPopularClick(event) {
    if (state.quickAddMode === "view") return;
    const categoryId = event.target.closest("[data-popular-category-id]")?.getAttribute("data-popular-category-id");
    if (categoryId) {
      setSelection(categoryId);
      close();
    }
  }

  function onOutsideClick(event) {
    if (!elements.categoryPickerPopover?.hidden && !elements.categoryPicker.contains(event.target) && !elements.categoryPickerPopover.contains(event.target)) close();
  }

  function openCreator() {
    if (state.quickAddMode === "view" || !elements.categoryCreateForm || !elements.categoryCreateNameInput) return;
    elements.categoryCreateForm.hidden = false;
    elements.categoryCreateNameInput.value = "";
    elements.categoryCreateNameInput.focus({ preventScroll: true });
  }

  function bind() {
    elements.categoryPickerInput.addEventListener("focus", open);
    elements.categoryPickerInput.addEventListener("click", open);
    elements.categoryPickerInput.addEventListener("keydown", onInputKeydown);
    elements.categoryPickerInput.addEventListener("input", onInputChange);
    elements.categoryPickerToggle.addEventListener("click", toggle);
    elements.categoryCreateToggleButton?.addEventListener("click", openCreator);
    elements.categoryCreateSaveButton?.addEventListener("click", onCreate);
    elements.categoryCreateCancelButton?.addEventListener("click", closeCreator);
    elements.categoryPickerList.addEventListener("click", onSelect);
    elements.popularCategories?.addEventListener("click", onPopularClick);
    document.addEventListener("click", onOutsideClick);
  }

  return { addCategory, bind, close, ensureSelection, getCategoriesForPicker, renderOptions, renderPopularCategories, setSelection };
}
