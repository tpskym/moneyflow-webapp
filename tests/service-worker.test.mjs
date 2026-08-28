import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("Share Target использует отдельный POST endpoint", async () => {
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
    `${source}\nglobalThis.__isReceiptShareRequest = isReceiptShareRequest; globalThis.__isAppUpdateCheckRequest = isAppUpdateCheckRequest; globalThis.__cacheFirst = cacheFirst;`,
    context,
  );

  const request = new Request(
    "https://example.test/moneyflow/receive-check/",
    { method: "POST", body: new FormData() },
  );

  assert.equal(context.__isReceiptShareRequest(request), true);
  assert.equal(
    context.__isAppUpdateCheckRequest(
      new Request("https://example.test/moneyflow/index.html?update-check=1"),
    ),
    true,
  );
  assert.equal(
    context.__isAppUpdateCheckRequest(
      new Request("https://example.test/moneyflow/index.html"),
    ),
    false,
  );

  let openedCache = "";
  context.caches.open = async (name) => {
    openedCache = name;
    return { match: async () => new Response("cached") };
  };
  const cachedResponse = await context.__cacheFirst(
    new Request("https://example.test/moneyflow/app.js?v=186"),
  );
  assert.equal(await cachedResponse.text(), "cached");
  assert.equal(openedCache, "moneyflow-v186");
});
