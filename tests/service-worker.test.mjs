import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("Share Target направляет повторный запуск в открытое окно PWA", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"),
  );
  assert.equal(manifest.share_target.action, "./receive-check/");
  assert.equal(manifest.launch_handler.client_mode, "navigate-existing");

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
        matchAll: async () => [],
        claim: async () => {},
      },
      skipWaiting() {},
    },
  };
  vm.runInNewContext(
    `${source}\nglobalThis.__isReceiptShareRequest = isReceiptShareRequest;`,
    context,
  );

  const request = new Request(
    "https://example.test/moneyflow/receive-check/",
    { method: "POST", body: new FormData() },
  );

  assert.equal(context.__isReceiptShareRequest(request), true);
});
