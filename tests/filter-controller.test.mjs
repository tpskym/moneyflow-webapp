import assert from "node:assert/strict";
import test from "node:test";
import { applyPeriodSelection, applyTypeFilter } from "../modules/filter-controller.js";

const state = () => ({
  activeYearFilter: new Set([2026]),
  activeMonthFilter: new Set(),
  activeDayFilter: new Set(),
});

test("выбор месяца оставляет один месяц для выбора дней", () => {
  const value = state();
  applyPeriodSelection(value, "month", 5);
  applyPeriodSelection(value, "month", 6);
  assert.deepEqual([...value.activeMonthFilter], [5, 6]);
  applyPeriodSelection(value, "day", 3);
  assert.equal(value.activeDayFilter.size, 0);
});

test("несколько лет сбрасывают месяцы и дни", () => {
  const value = state();
  value.activeYearFilter.add(2025);
  value.activeMonthFilter.add(5);
  value.activeDayFilter.add(3);
  applyPeriodSelection(value, "month", 6, "add");
  assert.equal(value.activeMonthFilter.size, 0);
  assert.equal(value.activeDayFilter.size, 0);
});

test("выделяет выбранный тип операции в поиске", () => {
  const value = { activeTypeFilter: "all" };
  const chips = ["all", "income", "expense"].map((type) => ({
    type,
    attributes: new Map(),
    classes: new Set(type === "all" ? ["active"] : []),
    getAttribute(name) {
      return name === "data-type" ? this.type : null;
    },
    setAttribute(name, content) {
      this.attributes.set(name, content);
    },
    classList: {
      toggle(name, enabled) {
        if (enabled) this.owner.classes.add(name);
        else this.owner.classes.delete(name);
      },
      owner: null,
    },
  }));
  chips.forEach((chip) => {
    chip.classList.owner = chip;
  });

  applyTypeFilter(value, "expense", chips);

  assert.equal(value.activeTypeFilter, "expense");
  assert.deepEqual(chips.map((chip) => chip.classes.has("active")), [false, false, true]);
  assert.deepEqual(chips.map((chip) => chip.classes.has("is-active")), [false, false, true]);
  assert.deepEqual(chips.map((chip) => chip.attributes.get("aria-pressed")), ["false", "false", "true"]);
});
