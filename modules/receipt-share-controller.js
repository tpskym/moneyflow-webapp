import {
  createQrDetector,
  decodeReceiptQrFromFile,
  detectQrFromSource,
  parseReceiptQr,
} from "./receipt-parser.js";
import { createReceiptScanner } from "./receipt-scanner.js";

export function bindShareLaunchQueue(launchQueue, receive) {
  launchQueue?.setConsumer?.((launchParams) => receive(launchParams));
}

export function setReceiptProcessingState(
  elements,
  visible,
  message = "Обрабатываем переданные файлы...",
) {
  const overlay = elements.receiptProcessingOverlay;
  if (!overlay) return;
  overlay.hidden = !visible;
  overlay.setAttribute?.("aria-busy", String(visible));
  if (elements.receiptProcessingStatus) {
    elements.receiptProcessingStatus.textContent = message;
  }
}

export async function createSharedReceiptDraft(
  receipt,
  index,
  {
    decode = decodeReceiptQrFromFile,
    parse = parseReceiptQr,
    now = Date.now,
  } = {},
) {
  const fallbackId = `shared-${now()}-${index}`;
  const name = String(receipt?.name || `Чек ${index + 1}`);
  try {
    const parsed = parse(await decode(receipt?.file, name));
    return {
      id: String(receipt?.id || fallbackId),
      name,
      status: "ready",
      amount: parsed.amount,
      operationDate: parsed.operationDate,
      fiscalNumber: parsed.fiscalNumber,
      fiscalDocument: parsed.fiscalDocument,
    };
  } catch (error) {
    return {
      id: String(receipt?.id || fallbackId),
      name,
      status: "error",
      error: error?.message || "не удалось распознать QR-код",
    };
  }
}

export function createReceiptShareController(context) {
  const { elements, state, actions } = context;
  let receiving = false;
  let receiveAgain = false;
  let scanner = null;
  const escape = (value) => actions.call("escapeHtml", value);
  function renderQueue() {
    if (!elements.sharedReceiptsCard || !elements.sharedReceiptsList) return;
    const drafts = state.sharedReceiptDrafts;
    elements.sharedReceiptsCard.hidden = drafts.length === 0;
    if (elements.sharedReceiptsCount)
      elements.sharedReceiptsCount.textContent = String(drafts.length);
    elements.sharedReceiptsList.innerHTML = drafts
      .map((receipt) => {
        if (receipt.status !== "ready")
          return `<article class="shared-receipt shared-receipt--error" data-shared-receipt-id="${escape(receipt.id)}"><div><strong>${escape(receipt.name)}</strong><p>${escape(receipt.error)}</p></div><button type="button" class="btn btn--secondary" data-shared-receipt-action="dismiss">Убрать</button></article>`;
        const fiscal = [
          receipt.fiscalNumber ? `ФН ${receipt.fiscalNumber}` : "",
          receipt.fiscalDocument ? `ФД ${receipt.fiscalDocument}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return `<article class="shared-receipt" data-shared-receipt-id="${escape(receipt.id)}"><div><strong>${escape(receipt.name)}</strong><p>${escape(actions.call("formatOperationDate", { operationDate: receipt.operationDate }))} · <b>${escape(actions.call("formatMoney", receipt.amount))} ₽</b></p>${fiscal ? `<small>${escape(fiscal)}</small>` : ""}</div><div class="shared-receipt-actions"><button type="button" class="btn" data-shared-receipt-action="fill">Создать операцию</button><button type="button" class="btn btn--secondary" data-shared-receipt-action="dismiss" aria-label="Убрать чек">×</button></div></article>`;
      })
      .join("");
  }
  function requestSharedReceipts(worker) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(
        () => reject(new Error("истекло время ожидания файлов")),
        8000,
      );
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        if (event.data?.error) reject(new Error(event.data.error));
        else
          resolve(
            Array.isArray(event.data?.receipts) ? event.data.receipts : [],
          );
      };
      worker.postMessage({ type: "moneyflow:get-shared-receipts" }, [
        channel.port2,
      ]);
    });
  }
  async function receiveFromShareTarget() {
    if (receiving) {
      receiveAgain = true;
      return;
    }
    const url = new URL(window.location.href);
    const sharedLaunch = url.searchParams.get("shared-checks") === "1";
    if (sharedLaunch) {
      url.searchParams.delete("shared-checks");
      url.searchParams.delete("share-event");
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
    if (!("serviceWorker" in navigator)) {
      if (sharedLaunch)
        actions.call(
          "showAppNotice",
          "Приём чеков недоступен: браузер не поддерживает PWA.",
          "error",
        );
      return;
    }
    receiving = true;
    if (sharedLaunch) {
      setReceiptProcessingState(
        elements,
        true,
        "Получаем переданные файлы...",
      );
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const worker = navigator.serviceWorker.controller || registration.active;
      if (!worker)
        throw new Error("не удалось получить файлы из системного меню");
      const receipts = await requestSharedReceipts(worker);
      if (!receipts.length) {
        if (sharedLaunch) throw new Error("картинки чеков не найдены");
        return;
      }
      const containsPdf = receipts.some(
        (receipt) =>
          receipt?.type === "application/pdf" ||
          String(receipt?.name || "").toLowerCase().endsWith(".pdf"),
      );
      setReceiptProcessingState(
        elements,
        true,
        containsPdf
          ? "Обрабатываем PDF. Это может занять некоторое время..."
          : "Распознаем QR-код чека...",
      );
      await waitForProcessingPaint();
      const drafts = [];
      for (const [index, receipt] of receipts.entries()) {
        if (receipts.length > 1) {
          setReceiptProcessingState(
            elements,
            true,
            `Обрабатываем файл ${index + 1} из ${receipts.length}...`,
          );
        }
        drafts.push(await createSharedReceiptDraft(receipt, index));
      }
      state.sharedReceiptDrafts = drafts;
      worker.postMessage({
        type: "moneyflow:clear-shared-receipts",
        ids: receipts.map((receipt) => receipt.id),
      });
      renderQueue();
      const recognized = state.sharedReceiptDrafts.filter(
        (receipt) => receipt.status === "ready",
      ).length;
      actions.call(
        "showAppNotice",
        recognized
          ? `Получено чеков: ${receipts.length}. QR распознано: ${recognized}.`
          : "Картинки получены, но QR-коды распознать не удалось.",
        recognized ? "success" : "error",
      );
    } catch (error) {
      actions.call(
        "showAppNotice",
        `Не удалось обработать переданные чеки: ${error?.message || "неизвестная ошибка"}`,
        "error",
      );
    } finally {
      setReceiptProcessingState(elements, false);
      receiving = false;
      if (receiveAgain) {
        receiveAgain = false;
        window.setTimeout(receiveFromShareTarget, 0);
      }
    }
  }
  function onQueueClick(event) {
    const button = event.target.closest("[data-shared-receipt-action]");
    if (!button) return;
    const receipt = state.sharedReceiptDrafts.find(
      (item) =>
        item.id ===
        button.closest("[data-shared-receipt-id]")?.dataset.sharedReceiptId,
    );
    if (!receipt) return;
    if (button.dataset.sharedReceiptAction === "dismiss") {
      state.sharedReceiptDrafts = state.sharedReceiptDrafts.filter(
        (item) => item.id !== receipt.id,
      );
      renderQueue();
      return;
    }
    if (receipt.status !== "ready") return;
    if (state.syncSettings.accessMode === "reader")
      return actions.call(
        "showAppNotice",
        "На устройстве читателя операции добавлять нельзя.",
        "error",
      );
    actions.call("updateSyncSettingsVisibility", false);
    actions.call("updateQuickAddVisibility", true);
    actions.call("closeCategoryPicker");
    actions.call("setQuickAddMode", "add");
    state.operationType = "expense";
    actions.call("applyQuickAddType");
    actions.call("setQuickAddAmount", String(receipt.amount));
    if (elements.categorySelect) elements.categorySelect.value = "";
    if (elements.categoryPickerInput) elements.categoryPickerInput.value = "";
    if (elements.descriptionInput) elements.descriptionInput.value = "";
    actions.call(
      "setQuickAddDate",
      actions.call("normalizeDateForInput", receipt.operationDate),
    );
    state.sharedReceiptDrafts = state.sharedReceiptDrafts.filter(
      (item) => item.id !== receipt.id,
    );
    renderQueue();
    elements.form?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function getScanner() {
    if (scanner) return scanner;
    scanner = createReceiptScanner({
      elements: {
        card: elements.receiptScannerCard,
        status: elements.receiptScannerStatus,
        video: elements.receiptScannerVideo,
      },
      isReadOnly: () => state.syncSettings.accessMode === "reader",
      createDetector: createQrDetector,
      detectQr: detectQrFromSource,
      parseReceipt: parseReceiptQr,
      onReceiptRecognized: (parsed) => {
        state.sharedReceiptDrafts.unshift({
          id: `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: "Сканированный чек",
          status: "ready",
          ...parsed,
        });
        renderQueue();
        elements.sharedReceiptsCard?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      },
    });
    return scanner;
  }
  function bind() {
    const scheduleReceive = () => {
      [0, 400, 1200, 3000, 7000, 12000].forEach((delay) =>
        window.setTimeout(receiveFromShareTarget, delay),
      );
    };
    bindShareLaunchQueue(window.launchQueue, scheduleReceive);
    elements.sharedReceiptsList?.addEventListener("click", onQueueClick);
    elements.receiptScanToggleButton?.addEventListener("click", () =>
      getScanner().toggle(),
    );
    elements.receiptScannerCloseButton?.addEventListener("click", () =>
      scanner?.close(),
    );
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.type === "moneyflow:shared-receipts-ready")
        scheduleReceive();
    });
    window.addEventListener("focus", scheduleReceive);
    window.addEventListener("pageshow", scheduleReceive);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleReceive();
    });
    window.setInterval(() => {
      if (document.visibilityState === "visible") receiveFromShareTarget();
    }, 2500);
  }
  return { bind, onQueueClick, receiveFromShareTarget, renderQueue };
}

function waitForProcessingPaint() {
  return new Promise((resolve) => {
    const afterFrame = () => window.setTimeout(resolve, 20);
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(afterFrame);
    } else {
      afterFrame();
    }
  });
}
