import assert from "node:assert/strict";
import test from "node:test";

import { decryptCloudPayload, deriveEncryptionKey, encryptCloudPayload, isValidEncryptionKey } from "../modules/cloud-crypto.js";

test("шифрует и расшифровывает файл с пароль-фразой", async () => {
  const salt = "AQEBAQEBAQEBAQEBAQEBAQ==";
  const key = await deriveEncryptionKey("простая фраза", salt);
  const encrypted = await encryptCloudPayload({ operations: [{ id: "1" }], categories: [{ id: "food" }] }, { encryptionKey: key, salt });

  assert.equal(isValidEncryptionKey(key), true);
  assert.equal(encrypted.format, "moneyflow-encrypted-v1");
  assert.deepEqual(await decryptCloudPayload(encrypted, key), { operations: [{ id: "1" }], categories: [{ id: "food" }] });
});

test("не расшифровывает файл другим ключом", async () => {
  const salt = "AgICAgICAgICAgICAgICAg==";
  const encrypted = await encryptCloudPayload({ operations: [], categories: [] }, { encryptionKey: await deriveEncryptionKey("one", salt), salt });
  const otherKey = await deriveEncryptionKey("two", salt);
  await assert.rejects(() => decryptCloudPayload(encrypted, otherKey));
});
