import assert from "node:assert/strict";
import test from "node:test";

import { parseReceiptQr, parseReceiptQrDate } from "../modules/receipt-parser.js";

test("разбирает QR ФНС из адреса и переносит сумму, дату и фискальные поля", () => {
  const receipt = parseReceiptQr("https://proverkacheka.nalog.ru/?t=20260828T143015&s=1%20234.56&fn=1234567890123456&i=4567");

  assert.deepEqual(receipt, {
    amount: 1234.56,
    operationDate: "2026-08-28",
    fiscalNumber: "1234567890123456",
    fiscalDocument: "4567",
  });
});

test("принимает сумму с запятой и QR без адреса", () => {
  const receipt = parseReceiptQr("t=20260102T030405&s=42,70&fn=10&i=20");

  assert.equal(receipt.amount, 42.7);
  assert.equal(receipt.operationDate, "2026-01-02");
  assert.equal(receipt.fiscalNumber, "10");
  assert.equal(receipt.fiscalDocument, "20");
});

test("отклоняет QR без обязательной суммы или даты", () => {
  assert.throws(() => parseReceiptQr("https://example.test/?fn=123"), /суммы/);
  assert.throws(() => parseReceiptQr("https://example.test/?s=100&fn=123"), /даты/);
});

test("не принимает нулевую, отрицательную и текстовую сумму", () => {
  for (const value of ["0", "-1", "сто"]) {
    assert.throws(() => parseReceiptQr(`t=20260102T030405&s=${value}`), /суммы/);
  }
});

test("извлекает дату QR с временем", () => {
  assert.equal(parseReceiptQrDate("20261231T235959"), "2026-12-31");
  assert.equal(parseReceiptQrDate("20261231"), "");
});

test("отклоняет несуществующие даты QR", () => {
  for (const value of ["20260230T120000", "20261301T120000", "abc", ""]) {
    assert.equal(parseReceiptQrDate(value), "");
  }
});
