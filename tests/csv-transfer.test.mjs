import assert from "node:assert/strict";
import test from "node:test";

import { parseDebitCreditCsv, parseCsvRows } from "../modules/csv-transfer.js";

const createId = (prefix, index) => `${prefix}-${index}`;

test("разбирает CSV Debit and Credit, категории и знак суммы", () => {
  const csv = [
    "Дата,Описание,Категория,Контрагент,Заметки,Счет,Сумма",
    "2026-08-28 12:30:00,---,Продукты,Магазин,Покупка,,\"-1 250,50\"",
    "2026-08-29 10:00:00,---,Зарплата,,, ,150000",
  ].join("\n");

  const result = parseDebitCreditCsv(csv, { createId });

  assert.equal(result.categories.length, 2);
  assert.equal(result.operations.length, 2);
  assert.equal(result.operations[0].type, "expense");
  assert.equal(result.operations[0].amount, 1250.5);
  assert.equal(result.operations[0].description, "Магазин · Покупка");
  assert.equal(result.operations[1].type, "income");
});

test("понимает запятые и кавычки внутри ячеек", () => {
  assert.deepEqual(parseCsvRows('Дата,Категория\n"2026-08-28, 12:00",Продукты'), [["Дата", "Категория"], ["2026-08-28, 12:00", "Продукты"]]);
});

test("отклоняет файл с неподходящими колонками", () => {
  assert.throws(() => parseDebitCreditCsv("Дата,Описание\n2026-08-28,Тест", { createId }), /формат Debit and Credit/);
});
