import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("Share Target принудительно навигирует и активирует открытое PWA", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"),
  );
  assert.equal(manifest.share_target.action, "./receive-check/");
  assert.equal(manifest.launch_handler, undefined);

  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const context = {
    URL,
    Request,
    Response,
    setTimeout(callback) { callback(); },
    caches: {},
    indexedDB: {},
    self: {
      addEventListener() {},
      registration: { scope: "https://example.test/moneyflow/" },
      clients: {
        matchAll: async () => [],
        claim: async () => {},
      },
      skipWaiting() {},
    },
  };
  vm.runInNewContext(
    `${source}\nglobalThis.__isReceiptShareRequest = isReceiptShareRequest; globalThis.__focusReceiptAppClient = focusReceiptAppClient;`,
    context,
  );

  const request = new Request(
    "https://example.test/moneyflow/receive-check/",
    { method: "POST", body: new FormData() },
  );

  assert.equal(context.__isReceiptShareRequest(request), true);

  let focused = 0;
  let notified = 0;
  let navigatedTo = "";
  context.self.clients.matchAll = async () => [
    {
      id: "open-app",
      url: "https://example.test/moneyflow/",
      postMessage() { notified += 1; },
      async navigate(url) { navigatedTo = url; return this; },
      async focus() { focused += 1; },
    },
    {
      id: "new-share",
      url: "https://example.test/moneyflow/receive-check/",
      postMessage() {},
      async focus() {},
    },
  ];
  await context.__focusReceiptAppClient("new-share");
  assert.equal(focused, 1);
  assert.equal(notified, 1);
  assert.match(navigatedTo, /shared-checks=1/);
});
