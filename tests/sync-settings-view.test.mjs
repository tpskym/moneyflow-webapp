import assert from "node:assert/strict";
import test from "node:test";
import { createSyncSettingsView, getCloudAccessState } from "../modules/sync-settings-view.js";

test("читатель не может выгружать, а редактор может", () => {
  assert.equal(getCloudAccessState({ googleClientId: "id", googleFileId: "file", accessMode: "reader" }).canUpload, false);
  assert.equal(getCloudAccessState({ googleClientId: "id", googleFileId: "file", accessMode: "writer" }).canUpload, true);
});

test("неопределённый режим разрешает добавление до подтверждения читателя", () => {
  assert.equal(getCloudAccessState({ googleFileId: "file", accessMode: "unknown" }).canEdit, true);
  assert.equal(getCloudAccessState({ googleFileId: "file", accessMode: "writer" }).canEdit, true);
  assert.equal(getCloudAccessState({ googleFileId: "file", accessMode: "reader" }).canEdit, false);
});

test("кнопка закрытия настроек видна только читателю", () => {
  const state = { syncSettings: { googleFileId: "file", accessMode: "reader" } };
  const elements = { syncSettingsCloseButton: { hidden: true } };
  const view = createSyncSettingsView({
    state,
    elements,
    getReaderConnectionLink: () => "",
    onCloseQuickAdd() {},
  });

  view.updateCloudAccessUI();
  assert.equal(elements.syncSettingsCloseButton.hidden, false);

  state.syncSettings.accessMode = "writer";
  view.updateCloudAccessUI();
  assert.equal(elements.syncSettingsCloseButton.hidden, true);
});
