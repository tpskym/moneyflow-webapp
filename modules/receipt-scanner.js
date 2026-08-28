import { createQrDetector, detectQrFromSource, parseReceiptQr } from "./receipt-parser.js";

export function createReceiptScanner({
  elements,
  isReadOnly = () => false,
  onReceiptRecognized = () => {},
  getUserMedia = defaultGetUserMedia,
  createDetector = createQrDetector,
  detectQr = detectQrFromSource,
  parseReceipt = parseReceiptQr,
  scheduleFrame = defaultScheduleFrame,
  cancelFrame = defaultCancelFrame,
} = {}) {
  let stream = null;
  let frameId = null;
  let busy = false;
  let detector = null;

  async function toggle() {
    if (isReadOnly() || !elements?.card || !elements?.video) return;
    if (!elements.card.hidden) {
      close();
      return;
    }

    elements.card.hidden = false;
    setStatus("Запрашиваю доступ к камере...");

    try {
      detector = createDetector();
      stream = await getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      elements.video.srcObject = stream;
      await elements.video.play();
      setStatus("Наведите камеру на QR-код чека.");
      scanFrame();
    } catch (error) {
      setStatus(`Не удалось открыть сканер: ${error?.message || "нет доступа к камере"}.`);
      close({ keepMessage: true });
    }
  }

  async function scanFrame() {
    if (!stream || !elements?.video || elements.card?.hidden) return;

    if (!busy && elements.video.readyState >= 2) {
      busy = true;
      try {
        const rawQr = await detectQr(elements.video, detector);
        if (rawQr) {
          const receipt = parseReceipt(rawQr);
          close();
          onReceiptRecognized(receipt);
          return;
        }
      } catch {
        // A non-receipt QR or a single failed frame does not stop the scanner.
      } finally {
        busy = false;
      }
    }

    if (stream) frameId = scheduleFrame(scanFrame);
  }

  function close({ keepMessage = false } = {}) {
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    busy = false;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    detector = null;

    if (elements?.video) {
      elements.video.pause();
      elements.video.srcObject = null;
    }
    if (elements?.card) elements.card.hidden = !keepMessage;
  }

  function setStatus(message) {
    if (elements?.status) elements.status.textContent = message;
  }

  return { close, toggle };
}

function defaultGetUserMedia(constraints) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("камера недоступна в этом браузере");
  return navigator.mediaDevices.getUserMedia(constraints);
}

function defaultScheduleFrame(callback) {
  return requestAnimationFrame(callback);
}

function defaultCancelFrame(frameId) {
  cancelAnimationFrame(frameId);
}
