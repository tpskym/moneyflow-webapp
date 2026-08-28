export function normalizeDateForInput(dateValue) {
  const date = parseDateFromValue(dateValue);
  if (Number.isNaN(date.getTime())) return getTodayInputDate();
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

export function getTodayInputDate() {
  return normalizeDateForInput(getTodayDate());
}

export function parseOperationDate(value) {
  const date = parseDateFromInput(value);
  return Number.isNaN(date.getTime()) ? getTodayDate() : date;
}

export function parseDateFromInput(value) {
  if (!value) return getTodayDate();
  const normalized = String(value).trim().replace(/\//g, ".");
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return createLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) || getTodayDate();

  const russian = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (russian) return createLocalDate(Number(russian[3]), Number(russian[2]), Number(russian[1])) || getTodayDate();

  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 8) {
    return createLocalDate(Number(digits.slice(4, 8)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2))) || getTodayDate();
  }
  return getTodayDate();
}

export function getTodayDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function dateToDateOnlyString(date) {
  return parseDateToDateOnlyString(date);
}

export function parseDateToDateOnlyString(dateValue) {
  const date = parseDateFromValue(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function operationDateOnlyString(dateValue) {
  return parseDateToDateOnlyString(dateValue);
}

export function parseDateFromValue(value) {
  if (!value) return new Date(NaN);
  if (typeof value === "number") return new Date(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? new Date(NaN) : value;
  if (typeof value !== "string") return new Date(NaN);

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return createLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) || new Date(NaN);

  const russian = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (russian) return createLocalDate(Number(russian[3]), Number(russian[2]), Number(russian[1])) || new Date(NaN);

  const direct = new Date(value);
  return Number.isNaN(direct.getTime()) ? new Date(NaN) : direct;
}

export function isValidTimestamp(value) {
  return Number.isFinite(parseDateFromValue(value).getTime());
}

export function getOperationDateValue(operation) {
  if (!operation) return "";
  const operationDate = parseDateToDateOnlyString(operation.operationDate);
  if (operationDate) return operationDate;
  return parseDateToDateOnlyString(operation.date || operation.createdAt);
}

function createLocalDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
