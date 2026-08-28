export function getCloudAccessState(settings) {
  const hasClientId = Boolean(settings.googleClientId);
  const hasFileId = Boolean(settings.googleFileId);
  const isReadOnly = hasFileId && settings.accessMode === "reader";
  const isWriter = hasFileId && settings.accessMode === "writer";
  const isNotWriter = hasFileId && !isWriter;
  const canEdit = !isReadOnly;
  return { hasClientId, hasFileId, isReadOnly, isWriter, isNotWriter, canEdit, canUpload: hasClientId && (!hasFileId || !isNotWriter), canSync: hasClientId };
}

export function createSyncSettingsView({ state, elements, getReaderConnectionLink, onCloseQuickAdd }) {
  let activeTab = "editor";
  function renderTabs() {
    const reader = activeTab === "reader";
    elements.syncEditorTabButton?.classList.toggle("is-active", !reader);
    elements.syncReaderTabButton?.classList.toggle("is-active", reader);
    elements.syncEditorTabButton?.setAttribute("aria-selected", String(!reader));
    elements.syncReaderTabButton?.setAttribute("aria-selected", String(reader));
    if (elements.syncEditorPanel) elements.syncEditorPanel.hidden = reader;
    if (elements.syncReaderPanel) elements.syncReaderPanel.hidden = !reader;
  }
  function setActiveTab(tab) {
    activeTab = tab === "reader" ? "reader" : "editor";
    renderTabs();
  }
  function updateSyncSettingsVisibility(open) {
    if (!elements.syncSettingsCard || !elements.syncToggleButton) return;
    elements.syncSettingsCard.hidden = !open;
    elements.syncToggleButton.classList.toggle("is-open", open);
    const label = open ? "Скрыть настройки синхронизации" : "Настройки синхронизации";
    elements.syncToggleButton.setAttribute("aria-label", label);
    elements.syncToggleButton.setAttribute("title", label);
    if (open) renderTabs();
  }
  function updateCloudAccessUI() {
    const access = getCloudAccessState(state.syncSettings);
    if (elements.syncEditorTabButton) elements.syncEditorTabButton.hidden = access.isReadOnly;
    if (elements.syncReaderTabButton) elements.syncReaderTabButton.hidden = access.isWriter;
    if (elements.syncTabs) elements.syncTabs.hidden = access.isReadOnly || access.isWriter;
    if (access.isReadOnly) activeTab = "reader";
    if (access.isWriter) activeTab = "editor";
    renderTabs();
    if (elements.readerLinkConnect) elements.readerLinkConnect.hidden = false;
    if (elements.fileExportButton) elements.fileExportButton.hidden = false;
    if (elements.fileImportButton) elements.fileImportButton.hidden = access.isReadOnly;
    [elements.cloudUploadTopButton, elements.cloudUploadButton].forEach((button) => { if (button) button.hidden = !access.canUpload; });
    if (elements.cloudDownloadTopButton) elements.cloudDownloadTopButton.hidden = !access.isReadOnly;
    if (elements.cloudDownloadButton) {
      elements.cloudDownloadButton.hidden = !access.canSync;
      elements.cloudDownloadButton.textContent = access.isReadOnly ? "Синхронизировать" : "Загрузить из облака";
    }
    if (elements.quickAddToggleButton) elements.quickAddToggleButton.hidden = !access.canEdit;
    if (elements.syncGoogleClientIdField) elements.syncGoogleClientIdField.hidden = access.hasFileId;
    if (elements.readerInvite) elements.readerInvite.hidden = !(access.hasClientId && access.hasFileId && access.isWriter);
    if (elements.readerConnection) elements.readerConnection.hidden = !(access.hasClientId && access.hasFileId && access.isWriter);
    if (elements.readerConnectionLink) elements.readerConnectionLink.value = access.hasClientId && access.hasFileId && access.isWriter ? getReaderConnectionLink() : "";
    if (elements.readerAccessManagement) elements.readerAccessManagement.hidden = !(access.hasClientId && access.hasFileId && access.isWriter);
    const actions = elements.cloudDownloadTopButton?.closest(".sync-actions");
    actions?.classList.toggle("is-readonly", access.isReadOnly);
    actions?.classList.toggle("has-single-cloud-action", (access.canUpload ? 1 : 0) + (access.isReadOnly ? 1 : 0) === 1);
    if (!access.canEdit) onCloseQuickAdd();
  }
  function updateInstructionsVisibility(open) {
    if (!elements.instructionsCard || !elements.instructionsToggleButton) return;
    elements.instructionsCard.hidden = !open;
    elements.instructionsToggleButton.classList.toggle("is-open", open);
    const label = open ? "Скрыть инструкцию" : "Как начать";
    elements.instructionsToggleButton.setAttribute("aria-label", label);
    elements.instructionsToggleButton.setAttribute("title", label);
  }
  function bind() {
    elements.syncEditorTabButton?.addEventListener("click", () => setActiveTab("editor"));
    elements.syncReaderTabButton?.addEventListener("click", () => setActiveTab("reader"));
    elements.instructionsCloseButton?.addEventListener("click", () => updateInstructionsVisibility(false));
  }
  return { bind, setActiveTab, updateCloudAccessUI, updateInstructionsVisibility, updateSyncSettingsVisibility };
}
