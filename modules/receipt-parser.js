let pdfJsLibraryPromise = null;

export function parseReceiptQr(rawQr) {
  const source = String(rawQr || "").trim();
  const queryText = source.includes("?") ? source.slice(source.indexOf("?") + 1) : source;
  const params = new URLSearchParams(queryText);
  const amount = Number(String(params.get("s") || "").replace(/\s/g, "").replace(",", "."));
  const operationDate = parseReceiptQrDate(params.get("t"));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("в QR нет корректной суммы чека");
  if (!operationDate) throw new Error("в QR нет корректной даты чека");

  return {
    amount: Math.round((amount + Number.EPSILON) * 100) / 100,
    operationDate,
    fiscalNumber: String(params.get("fn") || "").trim(),
    fiscalDocument: String(params.get("i") || "").trim(),
  };
}

export function parseReceiptQrDate(value) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})?$/);
  if (!match) return "";
  const [, year, month, day, hour, minute, second = "0"] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (Number.isNaN(date.getTime())) return "";
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute)
  ) {
    return "";
  }
  return `${year}-${month}-${day}`;
}

export function createQrDetector({
  Detector = globalThis.BarcodeDetector,
  decode = globalThis.jsQR,
  createCanvas = defaultCreateCanvas,
} = {}) {
  if (typeof Detector === "function") {
    try {
      return new Detector({ formats: ["qr_code"] });
    } catch {
      try {
        return new Detector();
      } catch {
        // Use the local decoder below when the native API cannot initialize.
      }
    }
  }
  return createJsQrDetector({ decode, createCanvas });
}

function createJsQrDetector({ decode, createCanvas }) {
  if (typeof decode !== "function")
    throw new Error("в этом браузере нет распознавания QR из изображения");
  return {
    async detect(source) {
      const width = Math.floor(Number(source?.videoWidth || source?.naturalWidth || source?.width || 0));
      const height = Math.floor(Number(source?.videoHeight || source?.naturalHeight || source?.height || 0));
      if (!width || !height) return [];
      const canvas = createCanvas(width, height);
      const context = canvas?.getContext?.("2d", { willReadFrequently: true });
      if (!context) throw new Error("не удалось подготовить кадр камеры");
      context.drawImage(source, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      const result = decode(image.data, width, height, { inversionAttempts: "attemptBoth" });
      return String(result?.data || "").trim() ? [{ rawValue: result.data }] : [];
    },
  };
}

function defaultCreateCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function detectQrFromSource(source, detector = createQrDetector()) {
  return (await detectQrsFromSource(source, detector))[0] || "";
}

export async function detectQrsFromSource(source, detector = createQrDetector()) {
  const codes = await detector.detect(source);
  return [...new Set(
    codes
      .map((code) => String(code?.rawValue || "").trim())
      .filter(Boolean),
  )];
}

export function combineReceiptQrs(rawValues) {
  const receipts = new Map();
  for (const rawValue of rawValues || []) {
    const raw = String(rawValue || "").trim();
    if (!raw) continue;
    try {
      const parsed = parseReceiptQr(raw);
      const fiscalKey = parsed.fiscalNumber && parsed.fiscalDocument
        ? `${parsed.fiscalNumber}:${parsed.fiscalDocument}`
        : raw;
      if (!receipts.has(fiscalKey)) receipts.set(fiscalKey, { raw, parsed });
    } catch {
      // A PDF may contain unrelated QR codes; only fiscal receipt QR codes count.
    }
  }
  const uniqueReceipts = [...receipts.values()];
  if (!uniqueReceipts.length) return "";
  if (uniqueReceipts.length === 1) return uniqueReceipts[0].raw;

  const amountInKopecks = uniqueReceipts.reduce(
    (sum, receipt) => sum + amountToKopecks(receipt.parsed.amount),
    0n,
  );
  const amount = `${amountInKopecks / 100n}.${String(amountInKopecks % 100n).padStart(2, "0")}`;
  const operationDate = uniqueReceipts
    .map((receipt) => receipt.parsed.operationDate)
    .sort()
    .at(-1);
  return `t=${operationDate.replaceAll("-", "")}T000000&s=${amount}`;
}

function amountToKopecks(amount) {
  const [rubles = "0", kopecks = ""] = String(amount).split(".");
  return BigInt(rubles) * 100n + BigInt(kopecks.padEnd(2, "0").slice(0, 2) || "0");
}

export async function decodeReceiptQrFromFile(file, name) {
  if (isPdfReceiptFile(file, name)) return decodeQrFromReceiptPdf(file);
  return decodeQrFromReceiptImage(file);
}

function isPdfReceiptFile(file, name) {
  return String(file?.type || "").toLowerCase() === "application/pdf" || /\.pdf$/i.test(String(name || file?.name || ""));
}

async function decodeQrFromReceiptImage(file) {
  if (!file || typeof file !== "object") throw new Error("файл изображения не получен");
  const image = await createImageBitmap(file);
  try {
    const rawValue = await detectQrFromSource(image);
    if (!rawValue) throw new Error("QR-код на изображении не найден");
    return rawValue;
  } finally {
    image.close?.();
  }
}

async function decodeQrFromReceiptPdf(file) {
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("PDF-файл не получен");
  const pdfjs = await getPdfJsLibrary();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const detector = createQrDetector();

  try {
    const rawValues = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 2.5 });
      const scale = Math.min(1, 2400 / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale: 2.5 * scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("не удалось подготовить страницу PDF");
      await page.render({ canvasContext: context, viewport }).promise;
      const pageValues = await detectQrsFromSource(canvas, detector);
      page.cleanup();
      rawValues.push(...pageValues);
    }
    const combinedQr = combineReceiptQrs(rawValues);
    if (combinedQr) return combinedQr;
    throw new Error("QR-коды чеков в PDF не найдены");
  } finally {
    await loadingTask.destroy();
  }
}

function getPdfJsLibrary() {
  if (!pdfJsLibraryPromise) {
    pdfJsLibraryPromise = import("../vendor/pdfjs/pdf.min.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
      return pdfjs;
    });
  }
  return pdfJsLibraryPromise;
}
