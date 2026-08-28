import assert from "node:assert/strict";
import test from "node:test";

import { getMatchedCategories, mergeCategories, pickCategoryColor, sanitizeCategories } from "../modules/category-core.js";

test("ищет категории по началу, части слова и похожему написанию", () => {
  const categories = [{ id: "food", name: "Продукты", color: "#EF4444" }, { id: "taxi", name: "Такси", color: "#0EA5E9" }];

  assert.deepEqual(getMatchedCategories(categories, "продукт").map((item) => item.id), ["food"]);
  assert.deepEqual(getMatchedCategories(categories, "прдукт").map((item) => item.id), ["food"]);
});

test("объединяет категории без дублей по названию и сохраняет цвет", () => {
  const result = mergeCategories(
    [{ id: "local", name: "Продукты", color: "#ef4444" }],
    [{ id: "remote-same", name: " продукты ", color: "#0EA5E9" }, { id: "remote", name: "Такси", color: "#0ea5e9" }],
  );

  assert.deepEqual(result.map((item) => item.id), ["local", "remote"]);
  assert.equal(result[0].color, "#EF4444");
  assert.equal(result[1].color, "#0EA5E9");
});

test("создаёт безопасные категории и выбирает неиспользуемый цвет", () => {
  const categories = sanitizeCategories([{ id: "food", name: "Продукты", color: "bad" }], { createId: () => "new" });
  assert.equal(categories[0].color, "#64748B");
  assert.equal(pickCategoryColor([{ color: "#EF4444" }], ["#EF4444", "#22C55E"], () => 0), "#22C55E");
});
