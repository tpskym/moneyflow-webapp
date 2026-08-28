import assert from "node:assert/strict";
import test from "node:test";
import {
  createReceiptShareController,
  createSharedReceiptDraft,
  setReceiptProcessingState,
} from "../modules/receipt-share-controller.js";

test("показывает состояние обработки переданного PDF", () => {
  const attributes = new Map();
  const elements = {
    receiptProcessingOverlay: {
      hidden: true,
      setAttribute(name, value) { attributes.set(name, value); },
    },
    receiptProcessingStatus: { textContent: "" },
  };

  setReceiptProcessingState(elements, true, "Обрабатываем PDF...");
  assert.equal(elements.receiptProcessingOverlay.hidden, false);
  assert.equal(elements.receiptProcessingStatus.textContent, "Обрабатываем PDF...");
  assert.equal(attributes.get("aria-busy"), "true");

  setReceiptProcessingState(elements, false);
  assert.equal(elements.receiptProcessingOverlay.hidden, true);
  assert.equal(attributes.get("aria-busy"), "false");
});

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

test("выводит создание операции и закрытие в общей нижней группе", () => {
  const elements = {
    sharedReceiptsCard: { hidden: true },
    sharedReceiptsCount: { textContent: "" },
    sharedReceiptsList: { innerHTML: "" },
  };
  const state = {
    sharedReceiptDrafts: [{
      id: "receipt-1",
      name: "check.png",
      status: "ready",
      amount: 42.5,
      operationDate: "2026-08-28",
      fiscalNumber: "1",
      fiscalDocument: "2",
    }],
  };
  const actions = {
    call(name, value) {
      if (name === "formatMoney") return String(value);
      if (name === "formatOperationDate") return value.operationDate;
      return String(value);
    },
  };

  createReceiptShareController({ elements, state, actions }).renderQueue();

  assert.match(elements.sharedReceiptsList.innerHTML, /class="shared-receipt-actions"/);
  assert.match(elements.sharedReceiptsList.innerHTML, />Создать операцию</);
  assert.match(elements.sharedReceiptsList.innerHTML, /aria-label="Убрать чек">×</);
  assert.doesNotMatch(elements.sharedReceiptsList.innerHTML, /Открыть операцию/);
});

test("после создания операции закрывает выбранный чек", () => {
  const elements = {
    sharedReceiptsCard: { hidden: false },
    sharedReceiptsCount: { textContent: "1" },
    sharedReceiptsList: { innerHTML: "" },
    categorySelect: { value: "category" },
    categoryPickerInput: { value: "category" },
    descriptionInput: { value: "description" },
    form: { scrollIntoView() {} },
  };
  const state = {
    syncSettings: { accessMode: "editor" },
    sharedReceiptDrafts: [{
      id: "receipt-1",
      name: "check.png",
      status: "ready",
      amount: 42.5,
      operationDate: "2026-08-28",
    }],
  };
  const actions = {
    call(name, value) {
      if (name === "normalizeDateForInput") return value;
      return undefined;
    },
  };
  const controller = createReceiptShareController({ elements, state, actions });
  const button = {
    dataset: { sharedReceiptAction: "fill" },
    closest: () => ({ dataset: { sharedReceiptId: "receipt-1" } }),
  };

  controller.onQueueClick({ target: { closest: () => button } });

  assert.equal(state.sharedReceiptDrafts.length, 0);
  assert.equal(elements.sharedReceiptsCard.hidden, true);
  assert.equal(elements.sharedReceiptsCount.textContent, "0");
});
