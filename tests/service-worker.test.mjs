import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("Share Target навигирует и фокусирует уже открытое окно PWA", async () => {
  const messages = [];
  const navigations = [];
  let focused = 0;
  const appClient = {
    url: "https://example.test/moneyflow/",
    postMessage: (message) => messages.push(message),
    async navigate(url) {
      navigations.push(url);
      return this;
    },
    async focus() {
      focused += 1;
      return this;
    },
  };
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const context = {
    URL,
    Request,
    Response,
    caches: {},
    indexedDB: {},
    self: {
      addEventListener() {},
      registration: { scope: "https://example.test/moneyflow/" },
      clients: {
        matchAll: async () => [appClient],
        claim: async () => {},
        openWindow: async () => null,
      },
      skipWaiting() {},
    },
  };
  vm.runInNewContext(
    `${source}\nglobalThis.__activateSharedReceiptsClient = activateSharedReceiptsClient;`,
    context,
  );

  const result = await context.__activateSharedReceiptsClient(
    "https://example.test/moneyflow/?shared-checks=1&share-event=1",
  );

  assert.equal(result, appClient);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "moneyflow:shared-receipts-ready");
  assert.deepEqual(navigations, [
    "https://example.test/moneyflow/?shared-checks=1&share-event=1",
  ]);
  assert.equal(focused, 1);
});
