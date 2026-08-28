import { getOperationDateValue, parseDateFromValue } from "./dates.js";

const CATEGORY_COLORS = ["#0EA5E9", "#22C55E", "#F97316", "#EC4899", "#8B5CF6", "#EAB308", "#14B8A6", "#EF4444"];

export function parseDebitCreditCsv(text, { createId = defaultCreateId } = {}) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("CSV-файл пустой.");
  const headers = rows[0].map((item) => String(item || "").replace(/^\uFEFF/, "").trim());
  if (["Дата", "Категория", "Сумма"].some((header) => !headers.includes(header))) {
    throw new Error("Нужен формат Debit and Credit с колонками Дата, Категория и Сумма.");
  }

  const categories = new Map();
  const operations = [];
  rows.slice(1).forEach((cells, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, String(cells[column] || "").trim()]));
    const operationDate = parseCsvOperationDate(row["Дата"]);
    const categoryName = row["Категория"];
    const amount = Number(String(row["Сумма"] || "").replace(/\s/g, "").replace(",", "."));
    if (!operationDate || !categoryName || !Number.isFinite(amount) || amount === 0) return;

    const categoryKey = normalizeText(categoryName);
    if (!categories.has(categoryKey)) {
      const colorIndex = categories.size;
      categories.set(categoryKey, {
        id: createId("category", colorIndex),
        name: categoryName,
        mode: "both",
        color: CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length],
      });
    }

    const notes = String(row["Заметки"] || "").trim();
    const counterparty = String(row["Контрагент"] || "").trim();
    const sourceDescription = String(row["Описание"] || "").trim();
    const description = [counterparty, notes, sourceDescription !== "---" ? sourceDescription : ""].filter(Boolean).join(" · ");
    const timestamp = parseCsvTimestamp(row["Дата"], index);
    operations.push({
      id: createId("operation", index),
      createdAt: timestamp.toISOString(),
      localAddedAt: timestamp.toISOString(),
      operationDate,
      type: amount > 0 ? "income" : "expense",
      amount: round2(Math.abs(amount)),
      categoryId: categories.get(categoryKey).id,
      description,
    });
  });

  return { operations, categories: [...categories.values()] };
}

export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (character === "\n" && !quoted) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => String(value).trim()));
}

export function formatCsvOperationDate(operation) {
  const date = parseDateFromValue(getOperationDateValue(operation));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} 12:00:00`;
}

export function escapeCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function parseCsvOperationDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = parseDateFromValue(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function parseCsvTimestamp(value, index) {
  const timestamp = new Date(String(value || "").trim().replace(" ", "T"));
  return Number.isNaN(timestamp.getTime()) ? new Date(Date.now() + index) : new Date(timestamp.getTime() + index);
}

function normalizeText(text) {
  return String(text || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function defaultCreateId(prefix, index) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 10)}`;
}
