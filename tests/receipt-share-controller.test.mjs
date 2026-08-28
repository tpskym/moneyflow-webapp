import assert from "node:assert/strict";
import test from "node:test";
import { createSharedReceiptDraft } from "../modules/receipt-share-controller.js";

test("создаёт черновик для распознанного чека", async () => {
  const draft = await createSharedReceiptDraft(
    { id: 4, name: "check.png", file: {} },
    0,
    {
      now: () => 10,
      decode: async () => "raw",
      parse: () => ({
        amount: 42.5,
        operationDate: "2026-08-28",
        fiscalNumber: "1",
        fiscalDocument: "2",
      }),
    },
  );
  assert.deepEqual(draft, {
    id: "4",
    name: "check.png",
    status: "ready",
    amount: 42.5,
    operationDate: "2026-08-28",
    fiscalNumber: "1",
    fiscalDocument: "2",
  });
});

test("сохраняет ошибку распознавания в черновике", async () => {
  const draft = await createSharedReceiptDraft({}, 2, {
    now: () => 10,
    decode: async () => {
      throw new Error("QR не найден");
    },
  });
  assert.equal(draft.status, "error");
  assert.equal(draft.error, "QR не найден");
  assert.equal(draft.id, "shared-10-2");
});
