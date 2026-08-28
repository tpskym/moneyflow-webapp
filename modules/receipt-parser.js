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

export function createQrDetector() {
  const Detector = globalThis.BarcodeDetector;
  if (typeof Detector !== "function") throw new Error("в этом браузере нет распознавания QR из изображения");
  try {
    return new Detector({ formats: ["qr_code"] });
  } catch {
    return new Detector();
  }
}

export async function detectQrFromSource(source, detector = createQrDetector()) {
  const codes = await detector.detect(source);
  const rawValue = codes.find((code) => String(code?.rawValue || "").trim())?.rawValue;
  return rawValue ? String(rawValue).trim() : "";
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
    const pageLimit = Math.min(pdf.numPages, 12);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
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
      const rawValue = await detectQrFromSource(canvas, detector);
      page.cleanup();
      if (rawValue) return rawValue;
    }
    throw new Error("QR-код не найден на первых 12 страницах PDF");
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
