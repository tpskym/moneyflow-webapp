import assert from "node:assert/strict";
import test from "node:test";

import { downloadDriveData, getDriveAccessMode, uploadDriveData } from "../modules/google-drive-api.js";

test("создаёт новый файл в Google Drive и возвращает его ID", async () => {
  const calls = [];
  const response = await uploadDriveData({
    accessToken: "token",
    payload: "{\"encrypted\":true}",
    createId: () => "boundary",
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ id: "file-id" }) };
    },
  });

  assert.equal(response.id, "file-id");
  assert.match(calls[0].url, /uploadType=multipart/);
  assert.match(calls[0].options.body, /moneyflow-data\.json/);
});

test("читает права и содержимое файла", async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes("capabilities")) return { ok: true, status: 200, json: async () => ({ capabilities: { canEdit: false } }) };
    return { ok: true, status: 200, json: async () => ({ format: "moneyflow-encrypted-v1" }) };
  };

  assert.equal(await getDriveAccessMode({ accessToken: "token", fileId: "file", fetchFn }), "reader");
  assert.deepEqual(await downloadDriveData({ accessToken: "token", fileId: "file", fetchFn }), { format: "moneyflow-encrypted-v1" });
  assert.equal(calls.length, 2);
});
