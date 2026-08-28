export function createAppUiController(context) {
  const { elements, state, actions } = context;
  function openNativeDatePicker(input) {
    if (!(input instanceof HTMLInputElement) || input.disabled) return;
    try {
      input.showPicker?.();
    } catch {
      input.focus({ preventScroll: true });
      input.click();
    }
  }
  function onTypeToggle(event) {
    const type = event.target.closest("[data-type]")?.dataset.type;
    if (!type) return;
    state.operationType = type;
    actions.call("applyQuickAddType");
  }
  function onSyncToggle() {
    const open = Boolean(elements.syncSettingsCard?.hidden);
    actions.call("updateInstructionsVisibility", false);
    actions.call("updateSyncSettingsVisibility", open);
  }
  function onInstructionsToggle() {
    const open = Boolean(elements.instructionsCard?.hidden);
    actions.call("updateSyncSettingsVisibility", false);
    actions.call("updateQuickAddVisibility", false);
    actions.call("updateInstructionsVisibility", open);
  }
  function onQuickAddToggle() {
    if (
      state.syncSettings.accessMode !== "writer" &&
      state.syncSettings.googleFileId
    ) {
      actions.call(
        "setSyncStatus",
        "На этом устройстве доступно только чтение. Нажмите «Синхронизировать» для загрузки данных.",
      );
      return;
    }
    const open = Boolean(elements.quickAddCard?.hidden);
    actions.call("updateSyncSettingsVisibility", false);
    actions.call("updateQuickAddVisibility", open);
    if (!open) return;
    actions.call("setQuickAddMode", "add");
    actions.call("closeCategoryPicker");
    if (elements.categorySelect?.value)
      actions.call("setCategorySelection", elements.categorySelect.value);
    if (!elements.operationDateInput?.value)
      actions.call("setQuickAddDate", actions.call("getTodayInputDate"));
    elements.form?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function bind() {
    elements.typeToggle?.addEventListener("click", onTypeToggle);
    elements.syncToggleButton?.addEventListener("click", onSyncToggle);
    elements.instructionsToggleButton?.addEventListener(
      "click",
      onInstructionsToggle,
    );
    elements.quickAddToggleButton?.addEventListener("click", onQuickAddToggle);
  }
  return { bind, openNativeDatePicker };
}
