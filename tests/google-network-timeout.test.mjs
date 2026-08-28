import assert from "node:assert/strict";
import test from "node:test";

import {
  assertGoogleAuthAvailable,
  requestGoogleAccessToken,
  uploadDriveData,
} from "../modules/google-drive-api.js";

test("не запускает Google-авторизацию без сети", async () => {
  let requested = false;
  await assert.rejects(
    assertGoogleAuthAvailable({
      online: false,
      fetchFn: async () => {
        requested = true;
      },
    }),
    /Сервер авторизации Google недоступен/,
  );
  assert.equal(requested, false);
});

test("ограничивает ожидание ответа сервера авторизации", async () => {
  await assert.rejects(
    assertGoogleAuthAvailable({
      online: true,
      fetchFn: () => new Promise(() => {}),
      timeoutMs: 5,
    }),
    /Сервер авторизации Google недоступен/,
  );
});

test("ограничивает ожидание Google-токена", async () => {
  await assert.rejects(
    requestGoogleAccessToken({
      clientId: "client-id",
      scope: "scope",
      online: true,
      fetchFn: async () => ({ ok: true }),
      tokenTimeoutMs: 5,
      googleApi: {
        accounts: {
          oauth2: {
            initTokenClient: () => ({ requestAccessToken() {} }),
          },
        },
      },
    }),
    /Сервер авторизации Google недоступен/,
  );
});

test("ограничивает ожидание выгрузки в Google Drive", async () => {
  await assert.rejects(
    uploadDriveData({
      accessToken: "token",
      fileId: "file-id",
      payload: "{}",
      createId: () => "id",
      fetchFn: () => new Promise(() => {}),
      timeoutMs: 5,
    }),
    /Google Drive не ответил вовремя/,
  );
});
