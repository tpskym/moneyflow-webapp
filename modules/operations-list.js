export function renderOperationsMarkup(operations, {
  accessMode = "writer",
  pendingOperationIds = new Set(),
  escapeHtml,
  formatMoney,
  formatOperationDate,
} = {}) {
  if (!operations.length) return `<div class="empty">Нет операций по выбранному фильтру</div>`;

  let lastDay = "";
  const rows = [];
  const isReaderDevice = accessMode === "reader";
  for (const operation of operations) {
    const dayLabel = formatOperationDate(operation);
    const category = operation.categoryName || "Без категории";
    const description = operation.description || "";
    const isPendingUpload = !isReaderDevice && pendingOperationIds.has(operation.id);
    if (dayLabel !== lastDay) {
      rows.push(`<div class="operation-day">${escapeHtml(dayLabel)}</div>`);
      lastDay = dayLabel;
    }
    const controls = isReaderDevice
      ? `<button type="button" class="operation-view-trigger" title="Просмотреть" aria-label="Просмотреть операцию &quot;${escapeHtml(category)}&quot;"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg></button>`
      : `<button type="button" class="operation-menu-trigger" data-operation-menu-trigger="${operation.id}" title="Действия" aria-label="Действия для операции &quot;${escapeHtml(category)}&quot;">⋯</button><div class="operation-menu" role="menu" aria-label="Меню операции"><button type="button" class="operation-menu-item" data-operation-action="copy" role="menuitem">Копировать</button><button type="button" class="operation-menu-item" data-operation-action="edit" role="menuitem">Изменить</button><button type="button" class="operation-menu-item" data-operation-action="view" role="menuitem">Просмотреть</button><button type="button" class="operation-menu-item" data-operation-action="delete" role="menuitem">Удалить</button></div>`;
    const pendingBadge = isPendingUpload
      ? `<span class="operation-pending-upload" title="Не выгружено в облако" aria-label="Не выгружено в облако" role="img"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 18.4h10a3.8 3.8 0 0 0 .6-7.55A5.7 5.7 0 0 0 7.1 9.3 4.55 4.55 0 0 0 7.2 18.4Z"/><path d="M12 16V7.8M8.9 10.9 12 7.8l3.1 3.1"/></svg></span>`
      : "";
    const sign = operation.type === "income" ? "+" : "-";
    rows.push(`<article class="operation" data-operation-id="${escapeHtml(operation.id)}">${controls}<div class="operation-title"><div class="operation-category"><strong>${escapeHtml(category)}</strong>${pendingBadge}</div>${description ? `<div class="operation-description">${escapeHtml(description)}</div>` : ""}</div><div class="operation-amount ${operation.type}">${sign} ${formatMoney(Math.abs(operation.amount))} ₽</div></article>`);
  }
  return rows.join("");
}

export function createOperationsListController({
  operationsList,
  getAccessMode,
  getOperationById,
  getPendingOperationIds,
  getOperationDateValue,
  getTodayDate,
  operationDateOnlyString,
  escapeHtml,
  formatMoney,
  formatOperationDate,
  onDelete,
  onOpen,
}) {
  let longPressTimer = null;
  let longPressHandledOperationId = null;

  function closeMenus() {
    if (!operationsList) return;
    [...operationsList.querySelectorAll(".operation")].forEach((row) => row.classList.remove("menu-open"));
  }
  function openOperation(operation, options) {
    closeMenus();
    onOpen(operation, options);
  }
  function onClick(event) {
    const menuTrigger = event.target.closest("[data-operation-menu-trigger]");
    if (menuTrigger) {
      event.stopPropagation();
      event.preventDefault();
      const row = menuTrigger.closest("[data-operation-id]");
      const isOpen = row?.classList.contains("menu-open");
      closeMenus();
      if (!isOpen) row?.classList.add("menu-open");
      return;
    }
    const actionButton = event.target.closest("[data-operation-action]");
    if (actionButton) {
      event.stopPropagation();
      event.preventDefault();
      const operation = getOperationById(actionButton.closest("[data-operation-id]")?.getAttribute("data-operation-id"));
      if (!operation) return;
      const action = actionButton.getAttribute("data-operation-action");
      if (getAccessMode() === "reader" || action === "view") openOperation(operation, { mode: "view", date: getOperationDateValue(operation) });
      else if (action === "copy") openOperation(operation, { mode: "copy", date: operationDateOnlyString(getTodayDate()) });
      else if (action === "edit") openOperation(operation, { mode: "edit", date: getOperationDateValue(operation), sourceOperationId: operation.id });
      else if (action === "delete") {
        closeMenus();
        onDelete(operation.id);
      }
      return;
    }
    const operationId = event.target.closest("[data-operation-id]")?.getAttribute("data-operation-id");
    if (longPressHandledOperationId && operationId === longPressHandledOperationId) {
      longPressHandledOperationId = null;
      return;
    }
    const operation = getOperationById(operationId);
    if (operation) openOperation(operation, { mode: "view", date: getOperationDateValue(operation) });
  }
  function clearLongPress() {
    if (!longPressTimer) return;
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  function onPointerDown(event) {
    if (event.target.closest("[data-operation-action], [data-operation-menu-trigger]")) return;
    const operation = getOperationById(event.target.closest("[data-operation-id]")?.getAttribute("data-operation-id"));
    if (!operation) return;
    longPressHandledOperationId = null;
    clearLongPress();
    longPressTimer = setTimeout(() => {
      longPressHandledOperationId = operation.id;
      openOperation(operation, { mode: "copy", date: operationDateOnlyString(getTodayDate()) });
    }, 520);
  }
  function onOutsideClick(event) {
    if (!event.target.closest("[data-operation-action], [data-operation-menu-trigger]")) closeMenus();
  }
  function bind() {
    if (!operationsList) return;
    operationsList.addEventListener("pointerdown", onPointerDown);
    operationsList.addEventListener("pointerup", clearLongPress);
    operationsList.addEventListener("pointercancel", clearLongPress);
    operationsList.addEventListener("pointerleave", clearLongPress);
    operationsList.addEventListener("lostpointercapture", clearLongPress);
    operationsList.addEventListener("contextmenu", (event) => {
      if (event.target.closest("[data-operation-id]")) event.preventDefault();
    });
    operationsList.addEventListener("click", onClick);
    document.addEventListener("click", onOutsideClick);
  }
  function render(operations) {
    if (!operationsList) return;
    operationsList.innerHTML = renderOperationsMarkup(operations, {
      accessMode: getAccessMode(), pendingOperationIds: getPendingOperationIds(), escapeHtml, formatMoney, formatOperationDate,
    });
  }
  return { bind, closeMenus, render };
}
