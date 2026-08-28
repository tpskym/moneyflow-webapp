import { getOperationDateValue, isValidTimestamp, parseDateFromValue } from "./dates.js";

export function prepareOperationsForSync(operations, syncStartedAt, { createId = getUuid, offsetMs = 5 * 60 * 1000 } = {}) {
  const baseTimestamp = getSyncCreatedAtBase(syncStartedAt, offsetMs);
  let cursor = 0;
  let changed = false;
  const updated = Array.isArray(operations)
    ? operations.map((operation) => {
        if (!operation || typeof operation !== "object") return operation;
        const isCreatedAtMissing = !isValidTimestamp(operation.createdAt);
        const isIdMissing = !String(operation.id || "").trim();
        if (!isIdMissing && !isCreatedAtMissing) return operation;
        changed = true;
        const createdAt = isCreatedAtMissing ? new Date(baseTimestamp + cursor++).toISOString() : operation.createdAt;
        return { ...operation, id: isIdMissing ? createId() : operation.id, createdAt };
      })
    : [];
  return { operations: updated, changed };
}

export function prepareRemoteOperationForSync(operation, syncStartedAt, cursor, { offsetMs = 5 * 60 * 1000 } = {}) {
  if (!operation || typeof operation !== "object" || isValidTimestamp(operation.createdAt)) return operation;
  return { ...operation, createdAt: new Date(getSyncCreatedAtBase(syncStartedAt, offsetMs) + cursor).toISOString() };
}

export function sanitizeOperations(operations) {
  if (!Array.isArray(operations)) return [];
  const ids = new Set();
  return operations.reduce((result, source) => {
    const id = String(source?.id || "").trim();
    const type = String(source?.type || "");
    const amount = round2(Math.abs(Number(source?.amount)));
    const categoryId = String(source?.categoryId || "").trim();
    const operationDate = getOperationDateValue(source);
    if (ids.has(id) || !id || !["income", "expense"].includes(type) || !amount || !categoryId || !operationDate) return result;
    ids.add(id);
    result.push({
      ...source,
      id,
      type,
      amount,
      categoryId,
      operationDate,
      description: String(source?.description || "").trim(),
      createdAt: String(source?.createdAt || ""),
      localAddedAt: String(source?.localAddedAt || ""),
    });
    return result;
  }, []);
}

export function compareOperationsChronologicalAscending(left, right) {
  return getOperationSortDate(left) - getOperationSortDate(right) || dateToOrderTiebreak(left, right);
}

export function compareOperationsChronologicalDescending(left, right) {
  return getOperationSortDate(right) - getOperationSortDate(left) || dateToOrderTiebreak(right, left);
}

export function enrichOperationsWithBalance(operations, getCategoryName = () => "") {
  const sorted = [...operations].sort(compareOperationsChronologicalAscending);
  let runningBalance = 0;
  const balances = new Map();
  for (const operation of sorted) {
    runningBalance = round2(runningBalance + signedAmount(operation));
    balances.set(operation.id, runningBalance);
  }
  return operations.map((operation) => ({ ...operation, balanceAfter: balances.get(operation.id) ?? 0, categoryName: getCategoryName(operation.categoryId) }));
}

export function getFilteredOperations(operations, filters = {}) {
  const normalizedQuery = normalizeTextForSearch(filters.searchText);
  const queryAmount = normalizeAmountForSearch(filters.searchText);
  const categoryFilter = filters.activeCategoryFilter instanceof Set ? filters.activeCategoryFilter : new Set();
  const selected = operations
    .filter((operation) => {
      if (!["income", "expense"].includes(operation.type)) return false;
      if (categoryFilter.size && !categoryFilter.has(operation.categoryId)) return false;
      if (!normalizedQuery) return true;
      const searchable = `${normalizeTextForSearch(operation.description)} ${normalizeTextForSearch(operation.categoryName)}`;
      const amounts = [formatMoney(operation.amount), formatMoney(Math.abs(operation.amount)), operation.amount, Number(operation.amount).toFixed(2)]
        .map(normalizeAmountForSearch);
      return searchable.includes(normalizedQuery) || amounts.some((value) => value.includes(queryAmount));
    })
    .sort(compareOperationsChronologicalDescending);
  return filters.activeTypeFilter && filters.activeTypeFilter !== "all" ? selected.filter((operation) => operation.type === filters.activeTypeFilter) : selected;
}

export function getOperationsByYear(operations, filters = {}) {
  return operations.filter((operation) => matchesOperationPeriod(operation, filters));
}

export function matchesOperationPeriod(operation, filters = {}) {
  const date = parseDateFromValue(getOperationDateValue(operation));
  if (Number.isNaN(date.getTime())) return false;
  const years = filters.activeYearFilter instanceof Set ? filters.activeYearFilter : new Set();
  const months = filters.activeMonthFilter instanceof Set ? filters.activeMonthFilter : new Set();
  const days = filters.activeDayFilter instanceof Set ? filters.activeDayFilter : new Set();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (years.size && !years.has(year)) return false;
  if (years.size === 1 && months.size && !months.has(month)) return false;
  if (years.size === 1 && months.size === 1 && days.size && !days.has(day)) return false;
  const timestamp = new Date(year, month - 1, day).getTime();
  const from = getDateBoundary(filters.dateFrom, false);
  const to = getDateBoundary(filters.dateTo, true);
  return (from === null || timestamp >= from) && (to === null || timestamp <= to);
}

export function getOperationYear(operation) {
  return parseDateFromValue(getOperationDateValue(operation)).getFullYear();
}

export function mergeOperations(localOperations, remoteOperations) {
  const seen = new Set();
  const result = [];
  for (const operation of localOperations) {
    if (!operation?.id || seen.has(operation.id)) continue;
    seen.add(operation.id);
    result.push(operation);
  }
  for (const operation of remoteOperations) {
    if (!operation?.id || seen.has(operation.id) || !isOperationValid(operation)) continue;
    seen.add(operation.id);
    result.push(operation);
  }
  return result.sort(compareOperationsChronologicalAscending);
}

export function signedAmount(operation) {
  if (operation.type === "income") return Math.abs(Number(operation.amount) || 0);
  if (operation.type === "expense") return -Math.abs(Number(operation.amount) || 0);
  return 0;
}

export function formatMoney(value) {
  return (Number(value) || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function normalizeTextForSearch(text) {
  return String(text || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

export function normalizeAmountForSearch(text) {
  return normalizeTextForSearch(text).replace(/\s/g, "").replace(/,/g, ".");
}

export function getUuid() {
  return globalThis.crypto?.randomUUID?.() || `op-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function getDisplayOperationId(operationId) {
  const normalized = String(operationId || "").trim();
  if (!normalized || normalized.length <= 10) return normalized;
  return `${normalized.slice(0, 5)}…${normalized.slice(-4)}`;
}

export function formatOperationDate(operation) {
  const date = parseDateFromValue(getOperationDateValue(operation));
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatOperationDateTime(operation) {
  const date = parseDateFromValue(operation?.createdAt);
  if (Number.isNaN(date.getTime())) return "Ожидает синхронизации";
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })} ${time}.${milliseconds}`;
}

export function formatAmountForCancellation(value) {
  return Math.abs(round2(Number(value) || 0)).toFixed(2);
}

function getSyncCreatedAtBase(syncStartedAt, offsetMs) {
  const timestamp = parseDateFromValue(syncStartedAt).getTime();
  return (Number.isFinite(timestamp) ? timestamp : Date.now()) + offsetMs;
}

function getOperationSortDate(operation) {
  return parseDateFromValue(getOperationDateValue(operation)).getTime();
}

function dateToOrderTiebreak(left, right) {
  return getOperationOrderTimestamp(left) - getOperationOrderTimestamp(right) || String(left?.id || "").localeCompare(String(right?.id || ""));
}

function getOperationOrderTimestamp(operation) {
  const createdAt = parseDateFromValue(operation?.createdAt).getTime();
  if (Number.isFinite(createdAt)) return createdAt;
  const localAddedAt = parseDateFromValue(operation?.localAddedAt).getTime();
  return Number.isFinite(localAddedAt) ? localAddedAt : 0;
}

function getDateBoundary(value, endOfDay) {
  if (!value || !String(value).trim()) return null;
  const date = parseDateFromValue(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime();
}

function isOperationValid(operation) {
  return ["income", "expense"].includes(operation.type) && Number.isFinite(Number(operation.amount)) && Number(operation.amount) !== 0 && operation.categoryId && operation.operationDate && operation.id;
}
