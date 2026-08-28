import assert from "node:assert/strict";
import test from "node:test";

import { createReaderConnectionLink, getMissingSyncSettings, parseReaderConnectionLink, sanitizeSyncSettings } from "../modules/sync-model.js";

test("нормализует настройки синхронизации", () => {
  assert.deepEqual(sanitizeSyncSettings({ googleClientId: " id ", googleFileId: " file ", accessMode: "bad" }), {
    googleClientId: "id",
    googleFileId: "file",
    accessMode: "writer",
    googleAccountEmail: "",
    lastSuccessfulSyncAt: "",
  });
});

test("создаёт и разбирает ссылку читателя с ключом", () => {
  const link = createReaderConnectionLink({ origin: "https://example.test", pathname: "/m-flow/", googleClientId: "client", googleFileId: "file", encryptionKey: "key" });
  assert.deepEqual(parseReaderConnectionLink(link, { isValidKey: (key) => key === "key" }), { googleClientId: "client", googleFileId: "file", encryptionKey: "key" });
});

test("указывает недостающие настройки", () => {
  assert.deepEqual(getMissingSyncSettings({ googleClientId: "", googleFileId: "" }, { needsFileId: true }), ["OAuth Client ID", "ID файла Google Drive"]);
});
