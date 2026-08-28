export function applyPeriodSelection(state, kind, value, mode = "toggle") {
  const values =
    kind === "month" ? state.activeMonthFilter : state.activeDayFilter;
  if (!(values instanceof Set) || !Number.isInteger(value)) return;
  if (mode === "add") values.add(value);
  else if (mode === "remove") values.delete(value);
  else if (values.has(value)) values.delete(value);
  else values.add(value);
  normalizePeriodSelection(state);
}

export function normalizePeriodSelection(state) {
  if (state.activeYearFilter.size !== 1) {
    state.activeMonthFilter.clear();
    state.activeDayFilter.clear();
  } else if (state.activeMonthFilter.size !== 1) state.activeDayFilter.clear();
}

export function createFilterController(context) {
  const { elements, state, actions } = context;
  let searchDebounce;
  let chartsOpen = false;
  let periodDrag = null;
  let ignorePeriodClick = false;
  const redraw = () => actions.call("render");

  function resetPage() {
    state.currentPage = 1;
  }
  function onSearchInput(event) {
    clearTimeout(searchDebounce);
    const value = event.target.value;
    searchDebounce = setTimeout(() => {
      state.searchText = value;
      resetPage();
      redraw();
    }, 280);
  }
  function onYearClick(event) {
    const value = event.target.closest("[data-year]")?.dataset.year;
    if (!value) return;
    if (value === "all") state.activeYearFilter = new Set();
    else {
      const years = new Set(state.activeYearFilter);
      const year = Number(value);
      if (years.has(year)) years.delete(year);
      else years.add(year);
      state.activeYearFilter = years;
    }
    normalizePeriodSelection(state);
    resetPage();
    redraw();
  }
  function onPeriodClick(event) {
    if (ignorePeriodClick) {
      ignorePeriodClick = false;
      return;
    }
    const button = event.target.closest(
      "[data-period-kind][data-period-value]",
    );
    if (!button) return;
    applyPeriodSelection(
      state,
      button.dataset.periodKind,
      Number(button.dataset.periodValue),
    );
    resetPage();
    redraw();
  }
  function onPeriodPointerDown(event) {
    const button = event.target.closest(
      "[data-period-kind][data-period-value]",
    );
    if (!button || (event.pointerType === "mouse" && event.button !== 0))
      return;
    const value = Number(button.dataset.periodValue);
    const kind = button.dataset.periodKind;
    if (!Number.isInteger(value)) return;
    periodDrag = {
      kind,
      value,
      mode: (kind === "month"
        ? state.activeMonthFilter
        : state.activeDayFilter
      ).has(value)
        ? "remove"
        : "add",
      visited: new Set([value]),
      didDrag: false,
    };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }
  function onPeriodPointerMove(event) {
    if (!periodDrag) return;
    const button = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-period-kind][data-period-value]");
    const value = Number(button?.dataset.periodValue);
    if (
      !button ||
      button.dataset.periodKind !== periodDrag.kind ||
      !Number.isInteger(value) ||
      periodDrag.visited.has(value)
    )
      return;
    if (!periodDrag.didDrag) {
      periodDrag.didDrag = true;
      applyPeriodSelection(
        state,
        periodDrag.kind,
        periodDrag.value,
        periodDrag.mode,
      );
    }
    periodDrag.visited.add(value);
    applyPeriodSelection(state, periodDrag.kind, value, periodDrag.mode);
  }
  function onPeriodPointerUp(event) {
    if (!periodDrag) return;
    const dragged = periodDrag.didDrag;
    periodDrag = null;
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
    if (!dragged) return;
    resetPage();
    ignorePeriodClick = true;
    redraw();
    setTimeout(() => {
      ignorePeriodClick = false;
    }, 250);
  }
  function onDateChange(event) {
    const input = event.target;
    const from = input === elements.dateFromPickerInput;
    const display = from ? elements.dateFromDisplay : elements.dateToDisplay;
    const dateInput = from ? elements.dateFromInput : elements.dateToInput;
    const value = input?.value
      ? actions.call("normalizeDateForInput", input.value)
      : "";
    if (dateInput) dateInput.value = value;
    if (display) display.textContent = value || "Выбрать дату";
    if (from) state.dateFrom = value;
    else state.dateTo = value;
    resetPage();
    redraw();
  }
  function onCategoryClick(event) {
    const value = event.target.closest("[data-category-filter]")?.dataset
      .categoryFilter;
    if (!value) return;
    if (value === "all") state.activeCategoryFilter = new Set();
    else {
      const categories = new Set(state.activeCategoryFilter);
      if (categories.has(value)) categories.delete(value);
      else categories.add(value);
      state.activeCategoryFilter = categories;
    }
    resetPage();
    redraw();
  }
  function onTypeClick(event) {
    const value = event.target
      .closest("[data-type]")
      ?.getAttribute("data-type");
    if (!value) return;
    state.activeTypeFilter = value;
    resetPage();
    redraw();
  }
  function updateChartsVisibility() {
    if (elements.categoryCharts) elements.categoryCharts.hidden = !chartsOpen;
    if (elements.chartsToggleButton) {
      elements.chartsToggleButton.setAttribute(
        "aria-expanded",
        String(chartsOpen),
      );
      elements.chartsToggleButton.textContent = chartsOpen
        ? "Скрыть диаграммы"
        : "Диаграммы";
    }
  }
  function bind() {
    elements.searchToggleButton?.addEventListener("click", () =>
      actions.call(
        "updateSearchVisibility",
        Boolean(elements.searchField?.hidden),
      ),
    );
    elements.searchInput?.addEventListener("input", onSearchInput);
    elements.yearFilterContainer?.addEventListener("click", onYearClick);
    [elements.monthFilterContainer, elements.dayFilterContainer].forEach(
      (container) => {
        container?.addEventListener("click", onPeriodClick);
        container?.addEventListener("pointerdown", onPeriodPointerDown);
        container?.addEventListener("pointermove", onPeriodPointerMove);
        container?.addEventListener("pointerup", onPeriodPointerUp);
        container?.addEventListener("pointercancel", onPeriodPointerUp);
      },
    );
    [elements.dateFromPickerInput, elements.dateToPickerInput].forEach(
      (input) => {
        input?.addEventListener("change", onDateChange);
        input?.addEventListener("input", onDateChange);
      },
    );
    elements.chartsToggleButton?.addEventListener("click", () => {
      chartsOpen = !chartsOpen;
      updateChartsVisibility();
    });
    elements.categoryFilterContainer?.addEventListener(
      "click",
      onCategoryClick,
    );
    elements.chipContainer?.addEventListener("click", onTypeClick);
    document
      .getElementById("date-from-picker-button")
      ?.addEventListener("click", () =>
        actions.call("openNativeDatePicker", elements.dateFromPickerInput),
      );
    document
      .getElementById("date-to-picker-button")
      ?.addEventListener("click", () =>
        actions.call("openNativeDatePicker", elements.dateToPickerInput),
      );
  }
  return { bind, updateChartsVisibility };
}
