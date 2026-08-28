import assert from "node:assert/strict";
import test from "node:test";

import { createReceiptScanner } from "../modules/receipt-scanner.js";

function createElements() {
  return {
    card: { hidden: true },
    status: { textContent: "" },
    video: {
      readyState: 2,
      srcObject: null,
      async play() {},
      pause() {},
    },
  };
}

test("распознанный QR создаёт черновик чека и освобождает камеру", async () => {
  const elements = createElements();
  const stoppedTracks = [];
  const received = [];
  const scanner = createReceiptScanner({
    elements,
    getUserMedia: async () => ({ getTracks: () => [{ stop: () => stoppedTracks.push(true) }] }),
    createDetector: () => ({ detect: async () => [] }),
    detectQr: async () => "t=20260828T120000&s=750.25&fn=100&i=200",
    parseReceipt: () => ({ amount: 750.25, operationDate: "2026-08-28", fiscalNumber: "100", fiscalDocument: "200" }),
    onReceiptRecognized: (receipt) => received.push(receipt),
    scheduleFrame: () => 1,
    cancelFrame: () => {},
  });

  await scanner.toggle();

  assert.deepEqual(received, [{ amount: 750.25, operationDate: "2026-08-28", fiscalNumber: "100", fiscalDocument: "200" }]);
  assert.equal(elements.card.hidden, true);
  assert.equal(elements.video.srcObject, null);
  assert.equal(stoppedTracks.length, 1);
});

test("не открывает камеру на устройстве читателя", async () => {
  const elements = createElements();
  let cameraRequested = false;
  const scanner = createReceiptScanner({
    elements,
    isReadOnly: () => true,
    getUserMedia: async () => {
      cameraRequested = true;
    },
  });

  await scanner.toggle();

  assert.equal(cameraRequested, false);
  assert.equal(elements.card.hidden, true);
});

test("оставляет понятную ошибку при запрете камеры", async () => {
  const elements = createElements();
  const scanner = createReceiptScanner({
    elements,
    getUserMedia: async () => {
      throw new Error("Permission denied");
    },
    createDetector: () => ({ detect: async () => [] }),
  });

  await scanner.toggle();

  assert.equal(elements.card.hidden, false);
  assert.match(elements.status.textContent, /Permission denied/);
});

test("при ошибке строгого выбора повторяет запуск с предпочтением задней камеры", async () => {
  const elements = createElements();
  const constraints = [];
  const scanner = createReceiptScanner({
    elements,
    getUserMedia: async (request) => {
      constraints.push(request);
      if (constraints.length === 1) {
        const error = new Error("Could not start video service");
        error.name = "NotReadableError";
        throw error;
      }
      return { getTracks: () => [] };
    },
    createDetector: () => ({ detect: async () => [] }),
    scheduleFrame: () => 1,
  });

  await scanner.toggle();

  assert.deepEqual(constraints, [
    { audio: false, video: { facingMode: { exact: "environment" } } },
    { audio: false, video: { facingMode: { ideal: "environment" } } },
  ]);
});

test("переключает ошибочно открытую фронтальную камеру на найденную заднюю", async () => {
  const elements = createElements();
  const constraints = [];
  let frontStopped = false;
  const frontStream = {
    getTracks: () => [{ stop: () => { frontStopped = true; } }],
    getVideoTracks: () => [{ getSettings: () => ({ deviceId: "front", facingMode: "environment" }) }],
  };
  const rearStream = { getTracks: () => [] };
  const scanner = createReceiptScanner({
    elements,
    getUserMedia: async (request) => {
      constraints.push(request);
      return constraints.length === 1 ? frontStream : rearStream;
    },
    enumerateDevices: async () => [
      { kind: "videoinput", deviceId: "front", label: "Camera facing front" },
      { kind: "videoinput", deviceId: "rear", label: "Camera2 0, facing back" },
    ],
    createDetector: () => ({ detect: async () => [] }),
    scheduleFrame: () => 1,
  });

  await scanner.toggle();

  assert.equal(frontStopped, true);
  assert.equal(elements.video.srcObject, rearStream);
  assert.deepEqual(constraints[1], { audio: false, video: { deviceId: { exact: "rear" } } });
});

test("повторяет запуск камеры при ошибке Android без имени ошибки", async () => {
  const elements = createElements();
  const constraints = [];
  const scanner = createReceiptScanner({
    elements,
    getUserMedia: async (request) => {
      constraints.push(request);
      if (constraints.length === 1) throw new Error("Could not start video service");
      return { getTracks: () => [] };
    },
    createDetector: () => ({ detect: async () => [] }),
    scheduleFrame: () => 1,
  });

  await scanner.toggle();

  assert.equal(constraints.length, 2);
});

test("не запускает второй запрос, пока Android запускает первую камеру", async () => {
  const elements = createElements();
  let resolveCamera;
  let requests = 0;
  const scanner = createReceiptScanner({
    elements,
    getUserMedia: () => {
      requests += 1;
      return new Promise((resolve) => {
        resolveCamera = resolve;
      });
    },
    createDetector: () => ({ detect: async () => [] }),
    cameraWaitingNoticeMs: 5,
    scheduleFrame: () => 1,
  });

  const opening = scanner.toggle();
  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.equal(requests, 1);
  assert.match(elements.status.textContent, /Android всё ещё запускает камеру/);
  resolveCamera({ getTracks: () => [] });
  await opening;
  assert.equal(requests, 1);
});
