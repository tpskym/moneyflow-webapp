import assert from "node:assert/strict";
import test from "node:test";

import {
  getOperationDateValue,
  normalizeDateForInput,
  parseDateFromInput,
  parseDateFromValue,
  parseDateToDateOnlyString,
} from "../modules/dates.js";

test("принимает дату операции в российском и ISO формате", () => {
  assert.equal(normalizeDateForInput("2026-08-28"), "28.08.2026");
  assert.equal(parseDateToDateOnlyString("28.08.2026"), "2026-08-28");
  assert.equal(parseDateFromInput("28082026").getFullYear(), 2026);
});

test("возвращает пустую строку для невозможной даты", () => {
  assert.equal(parseDateToDateOnlyString("31.02.2026"), "");
  assert.equal(Number.isNaN(parseDateFromValue("2026-99-01").getTime()), true);
});

test("приоритет даты операции выше даты создания", () => {
  assert.equal(getOperationDateValue({ operationDate: "2026-08-28", createdAt: "2026-01-01T12:00:00.000Z" }), "2026-08-28");
  assert.equal(getOperationDateValue({ date: "2026-02-03" }), "2026-02-03");
});
