import assert from "node:assert/strict";
import test from "node:test";
import { orderCategoriesForPicker } from "../modules/category-picker.js";

const normalize = (value) => String(value).toLocaleLowerCase("ru");

test("сначала возвращает шесть наиболее используемых категорий", () => {
  const categories = ["Альфа", "Бета", "Гамма", "Дельта", "Еда", "Жильё", "Транспорт", "Аптека"].map((name, index) => ({ id: String(index), name }));
  const operations = ["4", "4", "4", "2", "2", "6", "1", "7"].map((categoryId) => ({ categoryId }));
  const ordered = orderCategoriesForPicker(categories, operations, normalize);
  assert.deepEqual(ordered.slice(0, 6).map((category) => category.id), ["4", "2", "7", "1", "6", "0"]);
  assert.deepEqual(ordered.slice(5).map((category) => category.name), ["Альфа", "Дельта", "Жильё"]);
});

test("неиспользуемые категории дополняет в алфавитном порядке", () => {
  const categories = [{ id: "z", name: "Яблоки" }, { id: "a", name: "Аптека" }, { id: "f", name: "Еда" }];
  const ordered = orderCategoriesForPicker(categories, [{ categoryId: "f" }], normalize);
  assert.deepEqual(ordered.map((category) => category.name), ["Еда", "Аптека", "Яблоки"]);
});
