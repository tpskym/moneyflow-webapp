import assert from "node:assert/strict";
import test from "node:test";
import { getCategoryChartEntries } from "../modules/filters-view.js";

test("складывает диаграмму по категориям и сортирует по сумме", () => {
  const entries = getCategoryChartEntries([
    { type: "expense", amount: 20, categoryId: "food" },
    { type: "expense", amount: 40, categoryId: "food" },
    { type: "expense", amount: 50, categoryId: "travel" },
  ], "expense", (id) => ({ id, color: "#000" }), (id) => id, (value) => Math.round(value * 100) / 100);
  assert.deepEqual(entries.map(({ categoryId, amount }) => ({ categoryId, amount })), [{ categoryId: "food", amount: 60 }, { categoryId: "travel", amount: 50 }]);
});
