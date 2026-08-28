import assert from "node:assert/strict";
import test from "node:test";
import { buildReaderShareMessage } from "../modules/reader-access-controller.js";

test("инструкция читателю содержит адрес приложения и ссылку подключения", () => {
  const text = buildReaderShareMessage({
    appLink: "https://example.test/app",
    connectionLink: "https://example.test/app?reader=1",
  });
  assert.match(text, /https:\/\/example\.test\/app/);
  assert.match(text, /Подключиться по ссылке/);
});
