export function getCategoryChartEntries(operations, type, getCategoryById, getCategoryName, round2) {
  const totals = new Map();
  operations.filter((operation) => operation.type === type).forEach((operation) => {
    const key = operation.categoryId || "uncategorized";
    totals.set(key, round2((totals.get(key) || 0) + Math.abs(Number(operation.amount) || 0)));
  });
  return [...totals.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount, category: getCategoryById(categoryId), name: getCategoryName(categoryId) }))
    .filter((entry) => entry.amount > 0)
    .sort((left, right) => right.amount - left.amount);
}

export function getAvailableOperationYears(
  operations,
  currentYear = new Date().getFullYear(),
) {
  const years = (Array.isArray(operations) ? operations : [])
    .map((operation) => Number(String(operation?.operationDate || "").slice(0, 4)))
    .filter((year) => Number.isInteger(year) && year > 0 && year <= currentYear);
  const earliestYear = years.length ? Math.min(...years) : currentYear;
  return Array.from(
    { length: currentYear - earliestYear + 1 },
    (_, index) => currentYear - index,
  );
}

export function createFiltersView({
  state, elements, escapeHtml, formatMoney, getCategoriesForPicker, getCategoryById,
  getCategoryName, loadMoreOperations, round2,
}) {
  let operationsLoadObserver = null;
  function renderCategoryFilters() {
    if (!elements.categoryFilterContainer) return;
    const selected = state.activeCategoryFilter instanceof Set ? state.activeCategoryFilter : new Set();
    const all = `<button type="button" class="chip ${selected.size === 0 ? "active" : ""}" data-category-filter="all">Все категории</button>`;
    const categories = getCategoriesForPicker().map((category) => {
      const color = `background:${category.color || "#64748b"}`;
      return `<button type="button" class="chip category-filter-chip ${selected.has(category.id) ? "active" : ""}" data-category-filter="${escapeHtml(category.id)}"><span class="category-dot" style="${color}"></span>${escapeHtml(category.name)}</button>`;
    }).join("");
    elements.categoryFilterContainer.innerHTML = all + categories;
  }
  function renderYearFilters() {
    if (!elements.yearFilterContainer) return;
    const years = getAvailableOperationYears(state.operations);
    const selected = state.activeYearFilter instanceof Set ? state.activeYearFilter : new Set();
    const buttons = [{ value: "all", label: "Все" }, ...years.map((year) => ({ value: String(year), label: String(year) }))];
    if (selected.size && ![...selected].some((year) => years.includes(year))) state.activeYearFilter = new Set();
    elements.yearFilterContainer.innerHTML = buttons.map((year) => `<button type="button" class="chip ${(year.value === "all" ? selected.size === 0 : selected.has(Number(year.value))) ? "active" : ""}" data-year="${year.value}">${year.label}</button>`).join("");
  }
  function renderPeriodFilters() {
    const years = state.activeYearFilter instanceof Set ? [...state.activeYearFilter] : [];
    if (years.length !== 1) {
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
    const days = new Date(years[0], month, 0).getDate();
    if (elements.dayFilterContainer) {
      elements.dayFilterContainer.hidden = false;
      elements.dayFilterContainer.innerHTML = `<span class="period-filter-label">Дни</span>${Array.from({ length: days }, (_, index) => index + 1).map((day) => `<button type="button" class="chip ${state.activeDayFilter.has(day) ? "active" : ""}" data-period-kind="day" data-period-value="${day}">${day}</button>`).join("")}`;
    }
  }
  function renderChart(container, operations, type) {
    if (!container) return;
    const entries = getCategoryChartEntries(operations, type, getCategoryById, getCategoryName, round2);
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    if (!total) {
      container.innerHTML = `<div class="chart-empty">Нет операций</div>`;
      return;
    }
    let cursor = 0;
    const segments = entries.map((entry) => {
      const next = cursor + entry.amount / total * 360;
      const segment = `${entry.category?.color || "#64748b"} ${cursor.toFixed(2)}deg ${next.toFixed(2)}deg`;
      cursor = next;
      return segment;
    });
    const legend = entries.map((entry) => `<div class="chart-legend-item"><span class="chart-dot" style="background:${entry.category?.color || "#64748b"}"></span><span>${escapeHtml(entry.name)}</span><strong>${formatMoney(entry.amount)} ₽ · ${Math.round(entry.amount / total * 100)}%</strong></div>`).join("");
    container.innerHTML = `<div class="chart-donut" style="background:conic-gradient(${segments.join(",")})"><span>${formatMoney(total)} ₽</span></div><div class="chart-legend">${legend}</div>`;
  }
  function renderCategoryCharts(operations) {
    renderChart(elements.incomeCategoryChart, operations, "income");
    renderChart(elements.expenseCategoryChart, operations, "expense");
  }
  function updateBalances(balance) {
    const years = state.activeYearFilter instanceof Set ? [...state.activeYearFilter].sort((left, right) => right - left).join(", ") : "";
    if (elements.balanceTitle) elements.balanceTitle.textContent = years ? `Текущий остаток (${years})` : "Текущий остаток";
    elements.balanceCurrent.textContent = `${formatMoney(balance)} ₽`;
  }
  function updateSearchVisibility(open, { focus = false } = {}) {
    if (!elements.searchField || !elements.searchToggleButton) return;
    elements.searchField.hidden = !open;
    if (elements.searchFilters) elements.searchFilters.hidden = !open;
    elements.searchSection?.classList.toggle("is-open", open);
    elements.searchToggleButton.setAttribute("aria-expanded", String(open));
    elements.searchToggleButton.classList.toggle("is-open", open);
    const label = open ? "Скрыть поиск" : "Открыть поиск";
    elements.searchToggleButton.setAttribute("aria-label", label);
    elements.searchToggleButton.setAttribute("title", label);
    if (focus) elements.searchInput?.focus();
  }
  function updatePager(totalItems, totalPages) {
    const sentinel = elements.operationsLoadSentinel;
    if (!sentinel) return;
    const canLoad = totalItems > 0 && state.currentPage < totalPages;
    sentinel.hidden = !canLoad;
    operationsLoadObserver?.disconnect();
    operationsLoadObserver = null;
    if (!canLoad || !("IntersectionObserver" in window)) return;
    operationsLoadObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      operationsLoadObserver?.disconnect();
      operationsLoadObserver = null;
      loadMoreOperations();
    }, { rootMargin: "0px" });
    operationsLoadObserver.observe(sentinel);
  }
  return { renderCategoryCharts, renderCategoryFilters, renderPeriodFilters, renderYearFilters, updateBalances, updatePager, updateSearchVisibility };
}
