import assert from "node:assert/strict";
import test from "node:test";

import {
  combineReceiptQrs,
  detectQrsFromCanvasRegions,
  parseReceiptQr,
  parseReceiptQrDate,
} from "../modules/receipt-parser.js";

test("находит несколько QR в разных областях одной страницы PDF", async () => {
  const source = { width: 1200, height: 1800 };
  let tileIndex = 0;
  const detector = {
    async detect(image) {
      if (image === source) return [{ rawValue: "receipt-1" }];
      if (image.tileIndex === 2) return [{ rawValue: "receipt-2" }];
      if (image.tileIndex === 6) return [{ rawValue: "receipt-3" }];
      return [];
    },
  };
  const createCanvas = (width, height) => ({
    width,
    height,
    tileIndex: ++tileIndex,
    getContext: () => ({ drawImage() {} }),
  });

  const values = await detectQrsFromCanvasRegions(source, detector, { createCanvas });

  assert.deepEqual(values, ["receipt-1", "receipt-2", "receipt-3"]);
});

test("суммирует все уникальные чеки из PDF и берёт последнюю дату", () => {
  const first = "t=20260820T120000&s=100.25&fn=10&i=1";
  const second = "t=20260822T130000&s=250.40&fn=10&i=2";
  const combined = combineReceiptQrs([first, second, first, "https://example.test/not-a-receipt"]);

  assert.match(combined, /s=350\.65$/);
  assert.deepEqual(parseReceiptQr(combined), {
    amount: 350.65,
    operationDate: "2026-08-22",
    fiscalNumber: "",
    fiscalDocument: "",
  });
});

test("складывает копейки без округления и погрешности float", () => {
  const combined = combineReceiptQrs([
    "t=20260822T120000&s=0.10&fn=10&i=1",
    "t=20260822T120100&s=0.20&fn=10&i=2",
  ]);

  assert.match(combined, /s=0\.30$/);
  assert.equal(parseReceiptQr(combined).amount, 0.3);
});

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

test("использует локальный jsQR, если BarcodeDetector недоступен", async () => {
  const { createQrDetector } = await import("../modules/receipt-parser.js");
  const calls = [];
  const detector = createQrDetector({
    Detector: undefined,
    decode: (data, width, height) => {
      calls.push({ data, width, height });
      return { data: "t=20260828T120000&s=100" };
    },
    createCanvas: () => ({
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(6) }),
      }),
    }),
  });

  const codes = await detector.detect({ videoWidth: 3, videoHeight: 2 });

  assert.deepEqual(codes, [{ rawValue: "t=20260828T120000&s=100" }]);
  assert.equal(calls[0].width, 3);
  assert.equal(calls[0].height, 2);
});
