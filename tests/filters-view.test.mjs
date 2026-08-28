import assert from "node:assert/strict";
import test from "node:test";
import { getAvailableOperationYears } from "../modules/filters-view.js";

test("годы идут от текущего до самой ранней операции", () => {
  const operations = [
    { operationDate: "2026-08-01" },
    { operationDate: "2021-02-10" },
    { operationDate: "2024-04-20" },
  ];

  assert.deepEqual(
    getAvailableOperationYears(operations, 2026),
    [2026, 2025, 2024, 2023, 2022, 2021],
  );
  assert.deepEqual(
    getAvailableOperationYears(operations, 2027),
    [2027, 2026, 2025, 2024, 2023, 2022, 2021],
  );
});

test("без операций показывает только текущий год", () => {
  assert.deepEqual(getAvailableOperationYears([], 2027), [2027]);
});
