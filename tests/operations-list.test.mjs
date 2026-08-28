import assert from "node:assert/strict";
import test from "node:test";
import { renderOperationsMarkup } from "../modules/operations-list.js";

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const formatMoney = (value) => Number(value).toFixed(2);
const formatOperationDate = (operation) => operation.operationDate;
const operations = [
  { id: "a", type: "income", amount: 100, categoryName: "Зарплата", description: "Аванс", operationDate: "2026-08-28" },
  { id: "b", type: "expense", amount: 20, categoryName: "Продукты", description: "", operationDate: "2026-08-28" },
  { id: "c", type: "expense", amount: 10, categoryName: "Транспорт", description: "Метро", operationDate: "2026-08-27" },
];

test("группирует операции по дням и выводит корректные знаки", () => {
  const markup = renderOperationsMarkup(operations, { accessMode: "writer", escapeHtml, formatMoney, formatOperationDate });
  assert.equal((markup.match(/operation-day/g) || []).length, 2);
  assert.match(markup, />\+ 100.00 ₽</);
  assert.match(markup, />- 20.00 ₽</);
  assert.match(markup, /Копировать/);
  assert.match(markup, /Удалить/);
});

test("показывает облачную метку только для невыгруженной операции редактора", () => {
  const markup = renderOperationsMarkup(operations, { accessMode: "writer", pendingOperationIds: new Set(["b"]), escapeHtml, formatMoney, formatOperationDate });
  assert.equal((markup.match(/operation-pending-upload/g) || []).length, 1);
});

test("в режиме читателя не выводит меню редактирования", () => {
  const markup = renderOperationsMarkup(operations, { accessMode: "reader", escapeHtml, formatMoney, formatOperationDate });
  assert.match(markup, /operation-view-trigger/);
  assert.doesNotMatch(markup, /operation-menu-trigger/);
  assert.doesNotMatch(markup, /operation-pending-upload/);
});
