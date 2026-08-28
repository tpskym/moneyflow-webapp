import assert from "node:assert/strict";
import test from "node:test";

import {
  enrichOperationsWithBalance,
  getFilteredOperations,
  getOperationsByYear,
  mergeOperations,
  prepareOperationsForSync,
  sanitizeOperations,
} from "../modules/operation-core.js";

const categories = { food: "Продукты", salary: "Зарплата" };
const getCategoryName = (id) => categories[id] || "";

test("считает расчётный баланс в хронологическом порядке", () => {
  const operations = [
    {
      id: "expense",
      type: "expense",
      amount: 40,
      categoryId: "food",
      operationDate: "2026-08-02",
      createdAt: "2026-08-02T10:00:00.000Z",
    },
    {
      id: "income",
      type: "income",
      amount: 100,
      categoryId: "salary",
      operationDate: "2026-08-01",
      createdAt: "2026-08-01T10:00:00.000Z",
    },
  ];

  const result = enrichOperationsWithBalance(operations, getCategoryName);

  assert.equal(result.find((item) => item.id === "income").balanceAfter, 100);
  assert.equal(result.find((item) => item.id === "expense").balanceAfter, 60);
  assert.equal(
    result.find((item) => item.id === "expense").categoryName,
    "Продукты",
  );
});

test("фильтрует операции по тексту, типу и категориям", () => {
  const operations = [
    {
      id: "1",
      type: "expense",
      amount: 1250.5,
      categoryId: "food",
      categoryName: "Продукты",
      description: "Магазин",
      operationDate: "2026-08-01",
      createdAt: "2026-08-01T10:00:00.000Z",
    },
    {
      id: "2",
      type: "income",
      amount: 5000,
      categoryId: "salary",
      categoryName: "Зарплата",
      description: "",
      operationDate: "2026-08-02",
      createdAt: "2026-08-02T10:00:00.000Z",
    },
  ];

  assert.deepEqual(
    getFilteredOperations(operations, {
      searchText: "1250",
      activeTypeFilter: "all",
      activeCategoryFilter: new Set(),
    }).map((item) => item.id),
    ["1"],
  );
  assert.deepEqual(
    getFilteredOperations(operations, {
      searchText: "",
      activeTypeFilter: "expense",
      activeCategoryFilter: new Set(["food"]),
    }).map((item) => item.id),
    ["1"],
  );
});

test("совмещает фильтр года, месяца и диапазона дат", () => {
  const operations = [
    { id: "1", operationDate: "2026-08-01" },
    { id: "2", operationDate: "2026-09-01" },
    { id: "3", operationDate: "2025-08-01" },
  ];
  const filters = {
    activeYearFilter: new Set([2026]),
    activeMonthFilter: new Set([8]),
    activeDayFilter: new Set(),
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
  };

  assert.deepEqual(
    getOperationsByYear(operations, filters).map((item) => item.id),
    ["1"],
  );
});

test("подготавливает отсутствующие ID и дату добавления от начала синхронизации", () => {
  const result = prepareOperationsForSync(
    [
      { type: "income" },
      { id: "fixed", createdAt: "2026-01-01T00:00:00.000Z" },
    ],
    "2026-08-28T10:00:00.000Z",
    { createId: () => "generated" },
  );

  assert.equal(result.changed, true);
  assert.equal(result.operations[0].id, "generated");
  assert.equal(result.operations[0].createdAt, "2026-08-28T10:05:00.000Z");
  assert.equal(result.operations[1].id, "fixed");
});

test("слияние не заменяет локальные записи и игнорирует некорректные удалённые", () => {
  const local = [
    {
      id: "local",
      type: "income",
      amount: 10,
      categoryId: "salary",
      operationDate: "2026-08-01",
    },
  ];
  const remote = [
    {
      id: "local",
      type: "expense",
      amount: 99,
      categoryId: "food",
      operationDate: "2026-08-02",
    },
    {
      id: "remote",
      type: "expense",
      amount: 20,
      categoryId: "food",
      operationDate: "2026-08-03",
    },
    {
      id: "bad",
      type: "income",
      amount: 0,
      categoryId: "food",
      operationDate: "2026-08-03",
    },
  ];

  assert.deepEqual(
    mergeOperations(local, remote).map((item) => item.id),
    ["local", "remote"],
  );
});

test("санитизация исключает некорректные и повторяющиеся операции", () => {
  const result = sanitizeOperations([
    { id: "valid", type: "expense", amount: -12.345, categoryId: "food", operationDate: "2026-08-03", description: "  рынок  " },
    { id: "valid", type: "income", amount: 99, categoryId: "salary", operationDate: "2026-08-04" },
    { id: "zero", type: "income", amount: 0, categoryId: "salary", operationDate: "2026-08-04" },
    { id: "missing-category", type: "income", amount: 10, operationDate: "2026-08-04" },
  ]);

  assert.deepEqual(result, [{ id: "valid", type: "expense", amount: 12.35, categoryId: "food", operationDate: "2026-08-03", description: "рынок", createdAt: "", localAddedAt: "" }]);
});
