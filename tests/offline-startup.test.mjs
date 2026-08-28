import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("локальные данные отрисовываются до сетевых фоновых действий", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const renderPosition = source.indexOf("    render();\n    registerServiceWorker();");
  const receiptPosition = source.indexOf("    receiptShareController.receiveFromShareTarget();");

  assert.ok(renderPosition > 0);
  assert.ok(receiptPosition > renderPosition);
  assert.doesNotMatch(source, /await receiptShareController\.receiveFromShareTarget/);
});

test("обычный запуск не ожидает готовности service worker", async () => {
  const source = await readFile(
    new URL("../modules/receipt-share-controller.js", import.meta.url),
    "utf8",
  );
  const skipPosition = source.indexOf("    if (!sharedLaunch) return;");
  const readyPosition = source.indexOf("      const registration = await navigator.serviceWorker.ready;");

  assert.ok(skipPosition > 0);
  assert.ok(readyPosition > skipPosition);
});
