import assert from "node:assert/strict";
import test from "node:test";
import {
  createAppUpdateController,
  extractAppVersion,
} from "../modules/app-update.js";

test("извлекает номер опубликованной версии", () => {
  assert.equal(extractAppVersion('<span class="app-version">v182</span>'), 182);
  assert.equal(extractAppVersion("без версии"), 0);
});

test("перезагружает новую версию без очистки локальных данных", async () => {
  let replacedWith = "";
  const locationRef = {
    href: "https://example.test/moneyflow/",
    replace(url) { replacedWith = url; },
  };
  const controller = createAppUpdateController({
    currentVersion: 181,
    locationRef,
    navigatorRef: { onLine: true },
    now: () => 100,
    fetchImpl: async () => ({
      ok: true,
      async text() { return '<span class="app-version">v182</span>'; },
    }),
  });

  assert.equal(await controller.check(), true);
  assert.match(replacedWith, /refresh=100/);
});

test("не перезагружает текущую версию", async () => {
  let reloads = 0;
  const controller = createAppUpdateController({
    currentVersion: 182,
    locationRef: {
      href: "https://example.test/moneyflow/",
      replace() { reloads += 1; },
    },
    navigatorRef: { onLine: true },
    fetchImpl: async () => ({
      ok: true,
      async text() { return '<span class="app-version">v182</span>'; },
    }),
  });

  assert.equal(await controller.check(), false);
  assert.equal(reloads, 0);
});

test("проверяет обновление один раз при старте без таймеров", async () => {
  let requests = 0;
  const controller = createAppUpdateController({
    currentVersion: 184,
    locationRef: {
      href: "https://example.test/moneyflow/",
      replace() {},
    },
    navigatorRef: { onLine: true },
    fetchImpl: async () => {
      requests += 1;
      return {
        ok: true,
        async text() { return '<span class="app-version">v184</span>'; },
      };
    },
  });

  await controller.bind();
  assert.equal(requests, 1);
});
