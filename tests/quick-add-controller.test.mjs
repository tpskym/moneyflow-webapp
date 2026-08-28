import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationDraft } from "../modules/quick-add-controller.js";

const deps = {
  createId: () => "operation-1",
  dateToDateOnlyString: (date) => date.toISOString().slice(0, 10),
  normalizeDateForInput: (date) => date.toLocaleDateString("ru-RU"),
  now: () => new Date("2026-08-28T12:00:00.000Z"),
  parseDateFromInput: (value) => {
    const [day, month, year] = value.split(".").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  },
  round2: (value) => Math.round(value * 100) / 100,
};

test("создаёт операцию с копейками и стабильными датами", () => {
  const draft = buildOperationDraft({ amountText: "123,45", categoryId: "food", description: "Магазин", operationDateText: "28.08.2026", type: "expense" }, deps);
  assert.deepEqual(draft, { id: "operation-1", operationDate: "2026-08-28", createdAt: "2026-08-28T12:00:00.000Z", localAddedAt: "2026-08-28T12:00:00.000Z", type: "expense", amount: 123.45, categoryId: "food", description: "Магазин" });
});

test("не создаёт операцию без категории, даты или положительной суммы", () => {
  assert.equal(buildOperationDraft({ amountText: "0", categoryId: "food", operationDateText: "28.08.2026" }, deps), null);
  assert.equal(buildOperationDraft({ amountText: "10", categoryId: "", operationDateText: "28.08.2026" }, deps), null);
  assert.equal(buildOperationDraft({ amountText: "10", categoryId: "food", operationDateText: "31.02.2026" }, deps), null);
});
